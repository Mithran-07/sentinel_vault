import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

// Read baseline .env to compare against development DATABASE_URL
const envPath = path.resolve(__dirname, "../../.env");
const parsedEnv = fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {};
const devUrlStr = parsedEnv.DATABASE_URL || process.env.DEV_DATABASE_URL || "";


/**
 * Strict preflight guard that verifies the test database is an isolated local test instance.
 * Fails closed if any check fails.
 */
export function assertIsolatedTestDatabase(testUrlStr?: string): URL {
  const urlToVerify = testUrlStr !== undefined ? testUrlStr : (process.env.TEST_DATABASE_URL || "");
  if (!urlToVerify) {
    throw new Error("PREFLIGHT_GUARD_FAILED: TEST_DATABASE_URL is not set.");
  }


  let testUrl: URL;
  try {
    testUrl = new URL(urlToVerify);
  } catch (err: any) {
    throw new Error(`PREFLIGHT_GUARD_FAILED: Malformed TEST_DATABASE_URL: ${err.message}`);
  }

  // 1. Strict protocol verification
  if (testUrl.protocol !== "postgresql:" && testUrl.protocol !== "postgres:") {
    throw new Error(`PREFLIGHT_GUARD_FAILED: Invalid protocol '${testUrl.protocol}'. Must be postgresql:`);
  }

  // 2. Strict local host verification
  const allowedHosts = new Set(["127.0.0.1", "localhost"]);
  if (!allowedHosts.has(testUrl.hostname)) {
    throw new Error(`PREFLIGHT_GUARD_FAILED: Host '${testUrl.hostname}' is not an approved local test host.`);
  }

  // 3. Strict database name verification (must be exactly 'vault_test_isolated')
  const dbName = testUrl.pathname.slice(1);
  const expectedDbName = "vault_test_isolated";
  if (dbName !== expectedDbName) {
    throw new Error(
      `PREFLIGHT_GUARD_FAILED: Database name '${dbName}' does not match expected isolated test database '${expectedDbName}'.`
    );
  }

  // 4. Reject equality with development DATABASE_URL
  if (devUrlStr) {
    try {
      const devUrl = new URL(devUrlStr);
      if (testUrl.href === devUrl.href) {
        throw new Error("PREFLIGHT_GUARD_FAILED: TEST_DATABASE_URL is identical to DATABASE_URL.");
      }
      if (devUrl.pathname.slice(1) === dbName) {
        throw new Error(
          `PREFLIGHT_GUARD_FAILED: Target database name matches development database name '${dbName}'.`
        );
      }
    } catch (e: any) {
      if (e.message.startsWith("PREFLIGHT_GUARD_FAILED")) throw e;
    }
  }

  return testUrl;
}

// Derive default TEST_DATABASE_URL from devUrl if not explicitly set in process.env
function getEffectiveTestUrl(): string {
  if (process.env.TEST_DATABASE_URL) {
    return process.env.TEST_DATABASE_URL;
  }
  if (devUrlStr) {
    const u = new URL(devUrlStr);
    u.pathname = "/vault_test_isolated";
    return u.toString();
  }
  throw new Error("PREFLIGHT_GUARD_FAILED: Neither TEST_DATABASE_URL nor DATABASE_URL is configured.");
}

const verifiedUrl = assertIsolatedTestDatabase(getEffectiveTestUrl());

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: verifiedUrl.toString(),
    },
  },
});
