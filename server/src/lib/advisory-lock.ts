import { Prisma } from "@prisma/client";

/**
 * Explicit advisory lock category IDs for PostgreSQL pg_advisory_xact_lock(classid, objid).
 * Using separate category IDs ensures user locks and organization locks operate in distinct
 * namespaces, eliminating cross-domain hash collision contention.
 */
export const ADVISORY_LOCK_CLASS_USER = 1;
export const ADVISORY_LOCK_CLASS_ORG = 2;

/**
 * Acquires a transaction-scoped advisory lock for a user.
 * Category: 1 (CLASS_USER)
 * Serializes user-specific operations (e.g. audit-event sequence appends, account deactivation)
 * and automatically releases the lock upon transaction commit or rollback.
 */
export async function acquireUserAdvisoryLock(
  tx: Prisma.TransactionClient,
  userId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(1::int, hashtext(${userId}))`;
}

/**
 * Acquires a transaction-scoped advisory lock for an organization.
 * Category: 2 (CLASS_ORG)
 * Serializes organization ownership, membership, and deactivation checks,
 * and automatically releases the lock upon transaction commit or rollback.
 */
export async function acquireOrgAdvisoryLock(
  tx: Prisma.TransactionClient,
  orgId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(2::int, hashtext(${orgId}))`;
}

/**
 * Acquires transaction-scoped advisory locks for multiple organizations in deterministic
 * lexicographical order to prevent deadlocks across concurrent multi-org operations.
 */
export async function acquireOrgAdvisoryLocksSorted(
  tx: Prisma.TransactionClient,
  orgIds: string[]
): Promise<string[]> {
  const sortedOrgIds = [...new Set(orgIds)].sort();
  for (const orgId of sortedOrgIds) {
    await acquireOrgAdvisoryLock(tx, orgId);
  }
  return sortedOrgIds;
}

/**
 * Acquires transaction-scoped advisory locks in strict global hierarchical order:
 * 1. CLASS_USER (1::int) — user identity namespace
 * 2. CLASS_ORG (2::int) — organization namespace
 *
 * Enforcing this order across all operations that touch both an actor user and an organization
 * guarantees that no circular wait (deadlock) can occur between user-lifecycle operations
 * and organization-member mutations.
 */
export async function acquireUserAndOrgLocks(
  tx: Prisma.TransactionClient,
  userId: string,
  orgId: string
): Promise<void> {
  await acquireUserAdvisoryLock(tx, userId);
  await acquireOrgAdvisoryLock(tx, orgId);
}
