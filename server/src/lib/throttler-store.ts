import Redis from "ioredis";

export class ThrottlerStoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThrottlerStoreUnavailableError";
  }
}

export interface AccountThrottler {
  readonly name: string;
  check(accountKey: string): Promise<boolean>;
  increment(accountKey: string, windowSeconds?: number): Promise<number>;
  clear(accountKey: string): Promise<void>;
  clearForTesting?(): Promise<void>;
}

interface MemoryThrottleEntry {
  attempts: number;
  resetAt: number;
}

/**
 * In-memory AccountThrottler for local development and testing.
 * Strictly prohibited in production.
 */
export class MemoryAccountThrottler implements AccountThrottler {
  readonly name = "memory";
  private store = new Map<string, MemoryThrottleEntry>();

  constructor() {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "MemoryAccountThrottler is strictly forbidden in production mode. A durable shared store (e.g. Redis) is required."
      );
    }
  }

  async check(accountKey: string): Promise<boolean> {
    const entry = this.store.get(accountKey);
    if (!entry) return false;
    if (Date.now() > entry.resetAt) {
      this.store.delete(accountKey);
      return false;
    }
    return entry.attempts >= 5;
  }

  async increment(accountKey: string, windowSeconds: number = 15 * 60): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(accountKey);

    if (!entry || now > entry.resetAt) {
      this.store.set(accountKey, { attempts: 1, resetAt: now + windowSeconds * 1000 });
      return 1;
    }

    entry.attempts += 1;
    return entry.attempts;
  }

  async clear(accountKey: string): Promise<void> {
    this.store.delete(accountKey);
  }

  async clearForTesting(): Promise<void> {
    this.store.clear();
  }
}

/**
 * Redis-backed distributed AccountThrottler.
 * Executes atomic increment-and-expiry via Lua script.
 */
export class RedisAccountThrottler implements AccountThrottler {
  readonly name = "redis";
  private client: Redis;

  // Lua script: atomically increments and sets TTL on first hit
  private static readonly INCR_EXPIRE_LUA = `
    local current = redis.call('INCR', KEYS[1])
    if current == 1 then
      redis.call('EXPIRE', KEYS[1], ARGV[1])
    end
    return current
  `;

  constructor(redisUrlOrClient: string | Redis) {
    if (typeof redisUrlOrClient === "string") {
      this.client = new Redis(redisUrlOrClient, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null,
      });
    } else {
      this.client = redisUrlOrClient;
    }
  }

  async check(accountKey: string): Promise<boolean> {
    try {
      const val = await this.client.get(`throttle:account:${accountKey}`);
      if (!val) return false;
      return parseInt(val, 10) >= 5;
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new ThrottlerStoreUnavailableError("Account throttling service is unavailable; failing closed.");
      }
      throw err;
    }
  }

  async increment(accountKey: string, windowSeconds: number = 15 * 60): Promise<number> {
    try {
      const result = await this.client.eval(
        RedisAccountThrottler.INCR_EXPIRE_LUA,
        1,
        `throttle:account:${accountKey}`,
        windowSeconds
      );
      return Number(result);
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new ThrottlerStoreUnavailableError("Account throttling service is unavailable; failing closed.");
      }
      throw err;
    }
  }

  async clear(accountKey: string): Promise<void> {
    try {
      await this.client.del(`throttle:account:${accountKey}`);
    } catch (err) {
      if (process.env.NODE_ENV === "production") {
        throw new ThrottlerStoreUnavailableError("Account throttling service is unavailable; failing closed.");
      }
      throw err;
    }
  }

  async clearForTesting(): Promise<void> {
    // No-op or test flush
  }
}

let activeThrottler: AccountThrottler | null = null;

export function getAccountThrottler(): AccountThrottler {
  if (activeThrottler) return activeThrottler;

  const isProd = process.env.NODE_ENV === "production";
  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    activeThrottler = new RedisAccountThrottler(redisUrl);
    return activeThrottler;
  }

  if (isProd) {
    throw new Error(
      "Production environment requires a configured durable throttler store (REDIS_URL). In-memory fallback is strictly forbidden."
    );
  }

  activeThrottler = new MemoryAccountThrottler();
  return activeThrottler;
}

export function setAccountThrottlerForTesting(throttler: AccountThrottler | null): void {
  activeThrottler = throttler;
}
