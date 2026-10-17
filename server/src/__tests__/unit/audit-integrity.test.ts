import crypto from "crypto";
import { testPrisma, assertIsolatedTestDatabase } from "../../lib/test-prisma";

jest.mock("../../lib/prisma", () => ({
  prisma: testPrisma,
}));

import { prisma } from "../../lib/prisma";
import { recordAuditEvent, verifyAuditChain, computeAuditEventHash } from "../../lib/audit";
import { deactivateUserAccount } from "../../lib/user-lifecycle";

describe("SV-SEC-017: Audit History Integrity & Decoupled Lifecycle", () => {
  const testRunId = Date.now().toString(36);

  beforeAll(async () => {
    assertIsolatedTestDatabase();
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });


  describe("Hard User Deletion & Audit Trail Preservation", () => {
    it("should retain all audit events and keep hash chain intact when a user is hard-deleted", async () => {
      const userId = `test-user-harddel-${testRunId}`;
      const email = `test-harddel-${testRunId}@example.com`;

      // 1. Create test user
      await prisma.user.create({
        data: {
          id: userId,
          email,
          authHash: "test-auth-hash",
          kdfSalt: "test-salt",
          encryptedVaultKeyCiphertext: "test-ciphertext",
          encryptedVaultKeyIv: "test-iv",
        },
      });

      // 2. Append 5 sequential audit events
      for (let i = 1; i <= 5; i++) {
        await recordAuditEvent(userId, `EVENT_${i}`, { step: i, marker: testRunId });
      }

      // 3. Verify audit chain before deletion
      const preDeletionChain = await verifyAuditChain(userId);
      expect(preDeletionChain.valid).toBe(true);
      expect(preDeletionChain.brokenAt).toBeNull();

      // 4. Hard-delete the user from User table
      await prisma.user.delete({ where: { id: userId } });

      // Verify user record is completely gone
      const deletedUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(deletedUser).toBeNull();

      // 5. CRITICAL CHECK: Verify all 5 audit events are STILL in the database
      const remainingEvents = await prisma.auditEvent.findMany({
        where: { userId },
        orderBy: { sequence: "asc" },
      });
      expect(remainingEvents).toHaveLength(5);
      expect(remainingEvents[0].eventType).toBe("EVENT_1");
      expect(remainingEvents[4].eventType).toBe("EVENT_5");

      // Verify historical userId values were not set to NULL or rewritten
      for (const ev of remainingEvents) {
        expect(ev.userId).toBe(userId);
      }

      // 6. CRITICAL CHECK: Verify the cryptographic hash chain is STILL 100% valid
      const postDeletionChain = await verifyAuditChain(userId);
      expect(postDeletionChain.valid).toBe(true);
      expect(postDeletionChain.brokenAt).toBeNull();

      // 7. Cleanup ephemeral test audit events
      await prisma.auditEvent.deleteMany({ where: { userId } });
    });
  });

  describe("Soft-Delete Lifecycle & Secret Shredding (deactivateUserAccount)", () => {
    it("should shred master secrets, revoke sessions, and append terminal audit event", async () => {
      const userId = `test-user-softdel-${testRunId}`;
      const email = `test-softdel-${testRunId}@example.com`;

      // 1. Create user with associated secrets and sessions
      const user = await prisma.user.create({
        data: {
          id: userId,
          email,
          authHash: "$argon2id$v=19$m=65536,t=3,p=4$dummy$dummy",
          kdfSalt: "dummy-salt",
          encryptedVaultKeyCiphertext: "secret-vault-key-cipher",
          encryptedVaultKeyIv: "secret-vault-key-iv",
        },
      });

      // Add a session
      const session = await prisma.session.create({
        data: {
          userId,
          lastTokenHash: "hash123",
          expiresAt: new Date(Date.now() + 3600000),
        },
      });

      // Add a refresh token
      await prisma.refreshToken.create({
        data: {
          userId,
          sessionId: session.id,
          tokenHash: `rt-${testRunId}`,
          expiresAt: new Date(Date.now() + 7200000),
        },
      });

      // Add a recovery code and passkey
      await prisma.recoveryCode.create({
        data: {
          userId,
          codeHash: "dummy-code-hash",
        },
      });

      await prisma.passkey.create({
        data: {
          userId,
          credentialId: `cred-${testRunId}`,
          publicKey: "dummy-pubkey",
        },
      });

      // Log an initial event
      await recordAuditEvent(userId, "USER_REGISTERED", { email });

      // 2. Perform account deactivation
      await deactivateUserAccount(userId, { reason: "User GDPR erasure request" });

      // 3. Verify user record state
      const deactivatedUser = await prisma.user.findUnique({ where: { id: userId } });
      expect(deactivatedUser).not.toBeNull();
      expect(deactivatedUser!.deletedAt).toBeInstanceOf(Date);
      expect(deactivatedUser!.isSuspended).toBe(true);
      // Secrets shredded
      expect(deactivatedUser!.encryptedVaultKeyCiphertext).toBe("DELETED");
      expect(deactivatedUser!.encryptedVaultKeyIv).toBe("DELETED");
      expect(deactivatedUser!.authHash.startsWith("DELETED_")).toBe(true);

      // 4. Verify credentials purged / revoked
      const remainingSessions = await prisma.session.findMany({ where: { userId } });
      expect(remainingSessions.every((s) => s.revokedAt !== null)).toBe(true);

      const remainingTokens = await prisma.refreshToken.findMany({ where: { userId } });
      expect(remainingTokens.every((t) => t.revoked === true)).toBe(true);

      const passkeyCount = await prisma.passkey.count({ where: { userId } });
      expect(passkeyCount).toBe(0);

      const recoveryCount = await prisma.recoveryCode.count({ where: { userId } });
      expect(recoveryCount).toBe(0);

      // 5. Verify terminal audit event appended and chain valid
      const events = await prisma.auditEvent.findMany({
        where: { userId },
        orderBy: { sequence: "asc" },
      });
      expect(events.length).toBe(2);
      expect(events[0].eventType).toBe("USER_REGISTERED");
      expect(events[1].eventType).toBe("USER_ACCOUNT_DELETED");

      const chainCheck = await verifyAuditChain(userId);
      expect(chainCheck.valid).toBe(true);
      expect(chainCheck.brokenAt).toBeNull();

      // Cleanup
      await prisma.refreshToken.deleteMany({ where: { userId } });
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.auditEvent.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    });

    it("should prevent deactivation if user is the sole active OWNER of an organization", async () => {
      const ownerId = `test-owner-${testRunId}`;
      const orgId = `test-org-${testRunId}`;

      await prisma.user.create({
        data: {
          id: ownerId,
          email: `owner-${testRunId}@example.com`,
          authHash: "dummy",
          kdfSalt: "dummy",
          encryptedVaultKeyCiphertext: "dummy",
          encryptedVaultKeyIv: "dummy",
        },
      });

      const org = await prisma.organization.create({
        data: {
          id: orgId,
          name: `Test Org ${testRunId}`,
        },
      });

      await prisma.organizationMember.create({
        data: {
          orgId: org.id,
          userId: ownerId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      // Attempt deactivation as sole owner -> should reject
      await expect(deactivateUserAccount(ownerId)).rejects.toThrow(
        "Cannot delete account while you are the sole owner of an organization"
      );

      // Add a co-owner
      const coOwnerId = `test-coowner-${testRunId}`;
      await prisma.user.create({
        data: {
          id: coOwnerId,
          email: `coowner-${testRunId}@example.com`,
          authHash: "dummy",
          kdfSalt: "dummy",
          encryptedVaultKeyCiphertext: "dummy",
          encryptedVaultKeyIv: "dummy",
        },
      });

      await prisma.organizationMember.create({
        data: {
          orgId: org.id,
          userId: coOwnerId,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      // Now deactivation of the first owner should succeed
      await expect(deactivateUserAccount(ownerId)).resolves.not.toThrow();

      // Cleanup
      await prisma.organizationMember.deleteMany({ where: { orgId } });
      await prisma.organization.delete({ where: { id: orgId } });
      await prisma.auditEvent.deleteMany({ where: { userId: { in: [ownerId, coOwnerId] } } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, coOwnerId] } } });
    });
  });
});
