import Redis from "ioredis";

export class ChallengeStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeStoreUnavailableError";
  }
}

export class ChallengeStoreConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChallengeStoreConfigurationError";
  }
}

export interface ChallengeStore {
  readonly name: string;
  consumeJti(jti: string, ttlSeconds: number): Promise<boolean>;
  isAvailable(): Promise<boolean>;
  clearForTesting?(): Promise<void>;
}

/**
 * Memory-backed ChallengeStore for development and testing.
 * Uses atomic check-and-set within the single-threaded Node.js event loop.
 * Strictly prohibited in production.
 */
export class MemoryChallengeStore implements ChallengeStore {
  readonly name = "memory";
  private jtiMap = new Map<string, number>();

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new ChallengeStoreConfigurationError(
        "MemoryChallengeStore is strictly forbidden in production mode. A durable shared store (e.g. Redis) is required."
      );
    }
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async consumeJti(jti: string, ttlSeconds: number): Promise<boolean> {
    const now = Date.now();
    const expiresAt = this.jtiMap.get(jti);

    if (expiresAt && expiresAt > now) {
      return false; // Already consumed
    }

    // Atomically set new consumption expiry
    this.jtiMap.set(jti, now + ttlSeconds * 1000);
    return true;
  }

  async clearForTesting(): Promise<void> {
    this.jtiMap.clear();
  }
}

/**
 * Redis-backed durable ChallengeStore for distributed multi-instance production.
 * Uses atomic SET key 1 EX ttl NX.
 */
export class RedisChallengeStore implements ChallengeStore {
  readonly name = "redis";
  private client: Redis;

  constructor(redisUrlOrClient: string | Redis) {
    if (typeof redisUrlOrClient === "string") {
      this.client = new Redis(redisUrlOrClient, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null, // Do not hang indefinitely in tests
      });
    } else {
      this.client = redisUrlOrClient;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const ping = await this.client.ping();
      return ping === "PONG";
    } catch {
      return false;
    }
  }

  async consumeJti(jti: string, ttlSeconds: number): Promise<boolean> {
    try {
      const res = await this.client.set(`jti:${jti}`, "1", "EX", ttlSeconds, "NX");
      return res === "OK";
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new ChallengeStoreUnavailableError(
          "Durable replay protection store is unavailable; failing closed to prevent replay attack."
        );
      }
      throw err;
    }
  }

  async clearForTesting(): Promise<void> {
    // No-op or flush in test
  }
}

let activeChallengeStore: ChallengeStore | null = null;

export function getChallengeStore(): ChallengeStore {
  if (activeChallengeStore) return activeChallengeStore;

  const isProd = process.env.NODE_ENV === "production";
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    activeChallengeStore = new RedisChallengeStore(redisUrl);
    return activeChallengeStore;
  }

  if (isProd) {
    throw new ChallengeStoreConfigurationError(
      "Production environment requires a configured durable challenge store (REDIS_URL). In-memory fallback is strictly forbidden."
    );
  }

  activeChallengeStore = new MemoryChallengeStore();
  return activeChallengeStore;
}

export function setChallengeStoreForTesting(store: ChallengeStore | null): void {
  activeChallengeStore = store;
}
