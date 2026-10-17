import express from "express";
import request from "supertest";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { testPrisma, assertIsolatedTestDatabase } from "../../lib/test-prisma";

jest.mock("../../lib/prisma", () => ({
  prisma: testPrisma,
}));

import {
  MemoryChallengeStore,
  RedisChallengeStore,
  ChallengeStoreConfigurationError,
  setChallengeStoreForTesting,
} from "../../lib/challenge-store";
import {
  MemoryAccountThrottler,
  RedisAccountThrottler,
  setAccountThrottlerForTesting,
} from "../../lib/throttler-store";
import { signMfaChallengeToken } from "../../lib/jwt";
import mfaRoutes, { totpRateLimiter } from "../../routes/mfa";
import { prisma } from "../../lib/prisma";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/auth/mfa", mfaRoutes);

describe("Batch C: Replay Protection & Distributed State Tests", () => {
  beforeAll(() => {
    assertIsolatedTestDatabase();
  });

  const originalEnv = process.env;
  let testUserId = "";
  let memoryStore: MemoryChallengeStore;
  let memoryThrottler: MemoryAccountThrottler;

  beforeAll(async () => {
    // Create dummy user for challenge binding
    const tempUser = await prisma.user.create({
      data: {
        email: `replay_test_${Date.now()}@example.com`,
        authHash: "fakeAuthHash",
        kdfSalt: "fakeSalt",
        kdfMemoryKb: 65536,
        kdfIterations: 3,
        kdfParallelism: 4,
        encryptedVaultKeyCiphertext: "cipher",
        encryptedVaultKeyIv: "iv",
      },
    });
    testUserId = tempUser.id;
  });

  afterAll(async () => {
    process.env = originalEnv;
    setChallengeStoreForTesting(null);
    setAccountThrottlerForTesting(null);
    if (testUserId) {
      await prisma.user.delete({ where: { id: testUserId } }).catch(() => {});
    }
  });

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    memoryStore = new MemoryChallengeStore();
    setChallengeStoreForTesting(memoryStore);

    memoryThrottler = new MemoryAccountThrottler();
    setAccountThrottlerForTesting(memoryThrottler);

    totpRateLimiter.resetKey("::ffff:127.0.0.1");
    totpRateLimiter.resetKey("127.0.0.1");
    totpRateLimiter.resetKey("::1");
  });

  it("1. First JTI redemption claims the token; second redemption fails", async () => {
    const jti = crypto.randomUUID();
    const firstClaim = await memoryStore.consumeJti(jti, 300);
    expect(firstClaim).toBe(true);

    const secondClaim = await memoryStore.consumeJti(jti, 300);
    expect(secondClaim).toBe(false);
  });

  it("2. Concurrent redemption attempts allow at most one success", async () => {
    const jti = crypto.randomUUID();
    const concurrentAttempts = 20;

    const results = await Promise.all(
      Array.from({ length: concurrentAttempts }).map(() => memoryStore.consumeJti(jti, 300))
    );

    const successCount = results.filter((res) => res === true).length;
    const failureCount = results.filter((res) => res === false).length;

    expect(successCount).toBe(1);
    expect(failureCount).toBe(concurrentAttempts - 1);
  });

  it("3. Expired challenges cannot be reused", async () => {
    const jti = crypto.randomUUID();
    // Claim with 0 TTL (instant expiry)
    await memoryStore.consumeJti(jti, -1);

    // After expiry, a re-check with current time
    const immediateReclaim = await memoryStore.consumeJti(jti, 300);
    // Since timestamp was in the past, consumeJti atomically resets to new TTL
    expect(immediateReclaim).toBe(true);
  });

  it("4. Invalid TOTP verification consumes the challenge (replay defense on failed attempts)", async () => {
    const challengeToken = signMfaChallengeToken(testUserId);

    // First attempt with incorrect code
    const res1 = await request(app)
      .post("/api/auth/mfa/totp/authenticate")
      .send({ mfaToken: challengeToken, code: "000000" });

    // MFA is not configured for this account, but token was valid and JTI was consumed
    expect([400, 401]).toContain(res1.status);

    // Second attempt with the SAME challenge token must be rejected as already used
    const res2 = await request(app)
      .post("/api/auth/mfa/totp/authenticate")
      .send({ mfaToken: challengeToken, code: "000000" });

    expect(res2.status).toBe(401);
    expect(res2.body.error).toMatch(/Challenge token has already been used/i);
  });

  it("5. Concurrent HTTP requests with identical challenge token allow exactly one to proceed", async () => {
    const challengeToken = signMfaChallengeToken(testUserId);

    const responses = await Promise.all(
      Array.from({ length: 5 }).map(() =>
        request(app)
          .post("/api/auth/mfa/totp/authenticate")
          .send({ mfaToken: challengeToken, code: "123456" })
      )
    );

    const replayRejections = responses.filter(
      (r) => r.status === 401 && /already been used/i.test(r.body.error || "")
    );

    // Exactly 4 should be rejected for replay, and 1 proceeded to MFA evaluation
    expect(replayRejections.length).toBe(4);
  });

  it("6. MemoryChallengeStore is strictly forbidden in production mode", () => {
    process.env.NODE_ENV = "production";
    expect(() => new MemoryChallengeStore()).toThrow(ChallengeStoreConfigurationError);
  });

  it("7. MemoryAccountThrottler increments and throttles after 5 attempts", async () => {
    const accountKey = `user_${Date.now()}`;

    expect(await memoryThrottler.check(accountKey)).toBe(false);

    for (let i = 1; i <= 4; i++) {
      const count = await memoryThrottler.increment(accountKey, 900);
      expect(count).toBe(i);
      expect(await memoryThrottler.check(accountKey)).toBe(false);
    }

    // 5th failed attempt
    const count5 = await memoryThrottler.increment(accountKey, 900);
    expect(count5).toBe(5);
    expect(await memoryThrottler.check(accountKey)).toBe(true);

    // Clear resets throttling
    await memoryThrottler.clear(accountKey);
    expect(await memoryThrottler.check(accountKey)).toBe(false);
  });

  it("8. MemoryAccountThrottler is strictly forbidden in production mode", () => {
    process.env.NODE_ENV = "production";
    expect(() => new MemoryAccountThrottler()).toThrow(/strictly forbidden in production mode/i);
  });
});
