import { createHash, randomBytes } from "crypto";
import request from "supertest";
import express from "express";
import cookieParser from "cookie-parser";
import { testPrisma, assertIsolatedTestDatabase } from "../../lib/test-prisma";

jest.mock("../../lib/prisma", () => ({
  prisma: testPrisma,
}));

import authRoutes from "../../routes/auth";
import mfaRoutes, { totpRateLimiter } from "../../routes/mfa";
import { prisma } from "../../lib/prisma";

const app = express();
app.use(cookieParser());
app.use(express.json());
app.use("/api/auth", authRoutes);
app.use("/api/auth/mfa", mfaRoutes);

describe("Batch B: Authentication & Token Safety Tests", () => {
  beforeAll(() => {
    assertIsolatedTestDatabase();
  });

  const uniqueId = Date.now();
  const testEmail = `token_safety_${uniqueId}@example.com`;
  const authHash = createHash("sha256").update(`pass_${uniqueId}`).digest("base64");
  const saltHex = randomBytes(16).toString("hex");

  let refreshCookie = "";
  let accessToken = "";
  let userId = "";

  afterAll(async () => {
    if (userId) {
      await prisma.user.delete({ where: { id: userId } }).catch(() => {});
    }
  });

  it("1. Registration issues HttpOnly SameSite=Strict cookie and omits refreshToken from JSON", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({
        email: testEmail,
        authHash,
        kdfSalt: saltHex,
        kdfMemoryKb: 65536,
        kdfIterations: 3,
        kdfParallelism: 4,
        encryptedVaultKeyCiphertext: "dummyCiphertext",
        encryptedVaultKeyIv: "dummyIv",
      });

    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeDefined();
    // Verify refreshToken is NOT in the JSON payload
    expect(res.body.refreshToken).toBeUndefined();

    // Check Set-Cookie headers
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    expect(cookieHeader).toContain("refreshToken=");
    expect(cookieHeader).toContain("Path=/api/auth");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader.toLowerCase()).toContain("samesite=strict");

    const user = await prisma.user.findUnique({ where: { email: testEmail } });
    expect(user).not.toBeNull();
    userId = user!.id;
  });

  it("2. Login issues HttpOnly SameSite=Strict cookie and omits refreshToken from JSON", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({
        email: testEmail,
        authHash,
      });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.kdf).toBeDefined();

    accessToken = res.body.accessToken;

    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    expect(cookieHeader).toContain("refreshToken=");
    expect(cookieHeader).toContain("Path=/api/auth");
    expect(cookieHeader).toContain("HttpOnly");
    expect(cookieHeader.toLowerCase()).toContain("samesite=strict");

    // Extract cookie value for subsequent tests
    const match = cookieHeader.match(/refreshToken=([^;]+)/);
    expect(match).not.toBeNull();
    refreshCookie = `refreshToken=${match![1]}`;
  });

  it("3. Refresh without anti-CSRF custom header is rejected when cookie is provided", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie)
      .send({});

    // Should be rejected with 403 Forbidden due to missing X-Requested-With header
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/CSRF protection header/i);
  });

  it("4. Refresh with valid cookie and anti-CSRF header succeeds and omits refreshToken from JSON", async () => {
    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie)
      .set("X-Requested-With", "XMLHttpRequest")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();

    // Rotated cookie should be issued
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    expect(cookieHeader).toContain("refreshToken=");
    expect(cookieHeader.toLowerCase()).toContain("samesite=strict");

    const match = cookieHeader.match(/refreshToken=([^;]+)/);
    expect(match).not.toBeNull();
    refreshCookie = `refreshToken=${match![1]}`;
  });

  it("5. Logout revokes token and clears refreshToken cookie with SameSite=Strict", async () => {
    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", refreshCookie)
      .send({});

    expect(res.status).toBe(204);

    // Verify clearCookie is sent
    const cookies = res.headers["set-cookie"];
    expect(cookies).toBeDefined();
    const cookieHeader = Array.isArray(cookies) ? cookies.join("; ") : cookies;
    expect(cookieHeader).toContain("refreshToken=;");
    expect(cookieHeader.toLowerCase()).toContain("samesite=strict");

    // Verify previously active refresh token is now revoked
    const refreshAfterLogout = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", refreshCookie)
      .set("X-Requested-With", "XMLHttpRequest")
      .send({});

    expect(refreshAfterLogout.status).toBe(401);
  });

  it("6. TOTP authentication rate limiter blocks brute force after 5 attempts", async () => {
    // Reset any previous hits from localhost in this test runner
    totpRateLimiter.resetKey("::ffff:127.0.0.1");
    totpRateLimiter.resetKey("127.0.0.1");
    totpRateLimiter.resetKey("::1");

    for (let i = 0; i < 5; i++) {
      const res = await request(app)
        .post("/api/auth/mfa/totp/authenticate")
        .send({ mfaToken: "invalid.token.structure", code: "000000" });
      expect(res.status).not.toBe(429);
    }

    const throttledRes = await request(app)
      .post("/api/auth/mfa/totp/authenticate")
      .send({ mfaToken: "invalid.token.structure", code: "000000" });

    expect(throttledRes.status).toBe(429);
    expect(throttledRes.body.error).toMatch(/Too many MFA verification attempts/i);

    // Clean up rate limiter key for clean teardown
    totpRateLimiter.resetKey("::ffff:127.0.0.1");
    totpRateLimiter.resetKey("127.0.0.1");
    totpRateLimiter.resetKey("::1");
  });
});
