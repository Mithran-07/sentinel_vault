import crypto from "crypto";
import { prisma } from "./prisma";
import { recordAuditEvent } from "./audit";
import { acquireUserAdvisoryLock, acquireOrgAdvisoryLocksSorted } from "./advisory-lock";

export interface DeactivateOptions {
  reason?: string;
  ip?: string;
}

/**
 * Executes a controlled, atomic, security-hardened account deactivation lifecycle:
 * 1. Serializes concurrent requests for the user via transaction-scoped advisory lock (CLASS_USER).
 * 2. Checks idempotency: if user is already deactivated, returns immediately without duplicate events.
 * 3. Identifies all organizations where the user is an active OWNER, sorts org IDs deterministically,
 *    and acquires advisory locks in sorted order (CLASS_ORG) to prevent deadlocks.
 * 4. Rechecks active owner counts under lock to prevent TOCTOU race conditions from orphaning orgs.
 * 5. Appends terminal USER_ACCOUNT_DELETED audit event WITHIN the transaction.
 * 6. Revokes all active sessions and refresh tokens.
 * 7. Purges secondary credentials (MFA methods, recovery codes, WebAuthn passkeys).
 * 8. Revokes active credential shares.
 * 9. Updates all active organization memberships to REMOVED.
 * 10. Shreds zero-knowledge master secrets and marks user as deactivated (deletedAt = now()).
 *
 * All operations commit or roll back together atomically.
 */
export async function deactivateUserAccount(userId: string, options: DeactivateOptions = {}) {
  return prisma.$transaction(async (tx) => {
    // 1. Acquire transaction advisory lock in CLASS_USER namespace (1::int) to serialize requests for this user
    await acquireUserAdvisoryLock(tx, userId);

    // 2. Fetch user state under lock for strict idempotency
    const user = await tx.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      const error: any = new Error("User not found");
      error.code = "USER_NOT_FOUND";
      error.statusCode = 404;
      throw error;
    }

    // Idempotency: if already deleted, return the deactivated record without recording duplicate terminal events
    if (user.deletedAt !== null) {
      return user;
    }

    // 3. Find all organizations where user is an active OWNER
    const ownedOrgs = await tx.organizationMember.findMany({
      where: { userId, role: "OWNER", status: "ACTIVE" },
      select: { orgId: true },
    });

    // Acquire transaction advisory locks on each org in deterministic sorted order (CLASS_ORG 2::int)
    const orgIds = await acquireOrgAdvisoryLocksSorted(
      tx,
      ownedOrgs.map((o) => o.orgId)
    );


    // 4. Recheck active ownership under lock (prevents concurrent deactivations from orphaning the org)
    for (const orgId of orgIds) {
      const activeOwnerCount = await tx.organizationMember.count({
        where: { orgId, role: "OWNER", status: "ACTIVE" },
      });
      if (activeOwnerCount <= 1) {
        const error: any = new Error(
          "Cannot delete account while you are the sole owner of an organization. Transfer ownership or delete the organization first."
        );
        error.code = "CANNOT_DELETE_SOLE_ORG_OWNER";
        error.statusCode = 409;
        throw error;
      }
    }

    // 5. Append terminal audit event WITHIN the transaction
    await recordAuditEvent(
      userId,
      "USER_ACCOUNT_DELETED",
      {
        reason: options.reason || "USER_REQUESTED",
        ip: options.ip,
      },
      tx
    );

    // 6. Revoke sessions
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 7. Revoke refresh tokens
    await tx.refreshToken.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true },
    });

    // 8. Purge secondary credentials
    await tx.mfaMethod.deleteMany({ where: { userId } });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.passkey.deleteMany({ where: { userId } });

    // 9. Revoke active credential shares
    await tx.sharedCredential.updateMany({
      where: { creatorId: userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    // 10. Update all active organization memberships to REMOVED
    await tx.organizationMember.updateMany({
      where: { userId, status: "ACTIVE" },
      data: { status: "REMOVED" },
    });

    // 11. Shred master secrets and mark user soft-deleted
    return tx.user.update({
      where: { id: userId },
      data: {
        deletedAt: new Date(),
        isSuspended: true,
        authHash: `DELETED_${crypto.randomUUID()}`,
        encryptedVaultKeyCiphertext: "DELETED",
        encryptedVaultKeyIv: "DELETED",
      },
    });
  });
}
