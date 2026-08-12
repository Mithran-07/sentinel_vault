import Redis from "ioredis";
import crypto from "crypto";

export interface StoredPasskeyChallenge {
  challenge: string;
  userId?: string;
  ceremonyType: "registration" | "authentication";
  expiresAt: number;
}

// In-memory fallback map for dev mode if Redis server is unreachable
const memoryFallbackMap = new Map<string, StoredPasskeyChallenge>();

class ChallengeManager {
  private redis: Redis | null = null;
  private isRedisAvailable = false;

  constructor() {
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    try {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 2000,
      });

      this.redis.connect().then(() => {
        this.isRedisAvailable = true;
      }).catch(() => {
        this.isRedisAvailable = false;
      });

      this.redis.on("error", () => {
        this.isRedisAvailable = false;
      });
    } catch {
      this.isRedisAvailable = false;
    }
  }

  async storeChallenge(
    ceremonyType: "registration" | "authentication",
    userId?: string,
    ttlSeconds = 300
  ): Promise<{ challenge: string; challengeId: string }> {
    const challengeBuffer = crypto.randomBytes(32);
    // WebAuthn spec base64url challenge string
    const challenge = challengeBuffer.toString("base64url");
    const challengeId = crypto.randomUUID();

    const record: StoredPasskeyChallenge = {
      challenge,
      userId,
      ceremonyType,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    if (this.isRedisAvailable && this.redis) {
      try {
        await this.redis.set(
          `passkey:challenge:${challengeId}`,
          JSON.stringify(record),
          "EX",
          ttlSeconds
        );
        return { challenge, challengeId };
      } catch {
        this.isRedisAvailable = false;
      }
    }

    // Fallback storage
    memoryFallbackMap.set(`passkey:challenge:${challengeId}`, record);
    if (ttlSeconds > 0) {
      setTimeout(() => memoryFallbackMap.delete(`passkey:challenge:${challengeId}`), ttlSeconds * 1000);
    }

    return { challenge, challengeId };
  }

  /**
   * Atomic consumption of challenge.
   * Uses Redis GETDEL to fetch and delete in a single atomic command, preventing multi-instance replay attacks.
   */
  async consumeChallenge(challengeId: string): Promise<StoredPasskeyChallenge | null> {
    const key = `passkey:challenge:${challengeId}`;

    if (this.isRedisAvailable && this.redis) {
      try {
        // Redis GETDEL atomically returns and deletes the key
        const raw = await this.redis.call("GETDEL", key) as string | null;
        if (!raw) return null;

        const record: StoredPasskeyChallenge = JSON.parse(raw);
        if (record.expiresAt < Date.now()) return null;

        return record;
      } catch {
        // Fallback to GET + DEL script if GETDEL isn't available on older Redis
        try {
          const raw = await this.redis.get(key);
          if (!raw) return null;
          await this.redis.del(key);

          const record: StoredPasskeyChallenge = JSON.parse(raw);
          if (record.expiresAt < Date.now()) return null;

          return record;
        } catch {
          this.isRedisAvailable = false;
        }
      }
    }

    // Memory fallback atomic consumption
    const record = memoryFallbackMap.get(key);
    if (!record) return null;
    memoryFallbackMap.delete(key);

    if (record.expiresAt < Date.now()) return null;

    return record;
  }
}

export const challengeManager = new ChallengeManager();
