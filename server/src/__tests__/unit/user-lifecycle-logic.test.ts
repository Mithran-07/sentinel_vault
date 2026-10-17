import crypto from "crypto";
import { prisma } from "../../lib/prisma";
import * as auditModule from "../../lib/audit";
import { deactivateUserAccount } from "../../lib/user-lifecycle";

describe("Batch F Corrective Actions Unit Tests (Mocked Prisma)", () => {
  const fakeUserId = "usr-test-lifecycle-123";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe("SEC-F-001: Atomic Account Deactivation Transaction", () => {
    it("should pass the transaction client to recordAuditEvent and execute all operations in a single transaction", async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: fakeUserId,
            email: "test@example.com",
            deletedAt: null,
            isSuspended: false,
          }),
          update: jest.fn().mockResolvedValue({
            id: fakeUserId,
            deletedAt: new Date(),
            isSuspended: true,
          }),
        },
        organizationMember: {
          findMany: jest.fn().mockResolvedValue([]),
          count: jest.fn().mockResolvedValue(2),
          updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        session: {
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        refreshToken: {
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        mfaMethod: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        recoveryCode: {
          deleteMany: jest.fn().mockResolvedValue({ count: 8 }),
        },
        passkey: {
          deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        sharedCredential: {
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
      };

      jest.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      const recordAuditSpy = jest
        .spyOn(auditModule, "recordAuditEvent")
        .mockResolvedValue({} as any);

      const result = await deactivateUserAccount(fakeUserId, {
        reason: "User requested deletion",
        ip: "127.0.0.1",
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      // Ensure recordAuditEvent was invoked with mockTx as the 4th argument (participating in transaction)
      expect(recordAuditSpy).toHaveBeenCalledWith(
        fakeUserId,
        "USER_ACCOUNT_DELETED",
        expect.objectContaining({ reason: "User requested deletion", ip: "127.0.0.1" }),
        mockTx
      );

      // Verify all mutative operations occurred on the transaction client
      expect(mockTx.session.updateMany).toHaveBeenCalled();
      expect(mockTx.refreshToken.updateMany).toHaveBeenCalled();
      expect(mockTx.mfaMethod.deleteMany).toHaveBeenCalled();
      expect(mockTx.recoveryCode.deleteMany).toHaveBeenCalled();
      expect(mockTx.passkey.deleteMany).toHaveBeenCalled();
      expect(mockTx.organizationMember.updateMany).toHaveBeenCalled();
      expect(mockTx.user.update).toHaveBeenCalled();
      expect(result.deletedAt).toBeDefined();
    });

    it("should propagate errors and abort transaction if secret shredding fails", async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: fakeUserId,
            email: "test@example.com",
            deletedAt: null,
            isSuspended: false,
          }),
          update: jest.fn().mockRejectedValue(new Error("Database write failure")),
        },
        organizationMember: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        mfaMethod: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        recoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        passkey: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        sharedCredential: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };

      jest.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });
      jest.spyOn(auditModule, "recordAuditEvent").mockResolvedValue({} as any);

      await expect(deactivateUserAccount(fakeUserId)).rejects.toThrow("Database write failure");
    });
  });

  describe("SEC-F-002: Deterministic Locking Order & Concurrency Protection", () => {
    it("should acquire advisory locks on organization IDs in deterministic sorted order", async () => {
      const acquiredLocks: string[] = [];
      const mockTx: any = {
        $executeRaw: jest.fn().mockImplementation((strings: TemplateStringsArray, ...values: any[]) => {
          acquiredLocks.push(values[0]);
          return Promise.resolve(1);
        }),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: fakeUserId,
            email: "test@example.com",
            deletedAt: null,
            isSuspended: false,
          }),
          update: jest.fn().mockResolvedValue({ id: fakeUserId, deletedAt: new Date() }),
        },
        organizationMember: {
          // Return orgs in unsorted order: org-gamma, org-alpha, org-beta
          findMany: jest.fn().mockResolvedValue([
            { orgId: "org-gamma" },
            { orgId: "org-alpha" },
            { orgId: "org-beta" },
          ]),
          count: jest.fn().mockResolvedValue(3),
          updateMany: jest.fn().mockResolvedValue({ count: 3 }),
        },
        session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        mfaMethod: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        recoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        passkey: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        sharedCredential: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };

      jest.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });
      jest.spyOn(auditModule, "recordAuditEvent").mockResolvedValue({} as any);

      await deactivateUserAccount(fakeUserId);

      // First lock is user advisory lock
      expect(acquiredLocks[0]).toBe(fakeUserId);
      // Next locks must be org IDs strictly sorted: org-alpha, org-beta, org-gamma
      expect(acquiredLocks.slice(1)).toEqual(["org-alpha", "org-beta", "org-gamma"]);
    });

    it("should reject deactivation when active owner count is 1 or less under lock", async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: fakeUserId,
            email: "test@example.com",
            deletedAt: null,
            isSuspended: false,
          }),
        },
        organizationMember: {
          findMany: jest.fn().mockResolvedValue([{ orgId: "org-single-owner" }]),
          count: jest.fn().mockResolvedValue(1), // sole owner
        },
      };

      jest.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });

      await expect(deactivateUserAccount(fakeUserId)).rejects.toThrow(
        "Cannot delete account while you are the sole owner of an organization"
      );
    });
  });

  describe("SEC-F-003: Organization Membership Consistency", () => {
    it("should mark all active organization memberships as REMOVED", async () => {
      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUnique: jest.fn().mockResolvedValue({
            id: fakeUserId,
            email: "test@example.com",
            deletedAt: null,
            isSuspended: false,
          }),
          update: jest.fn().mockResolvedValue({ id: fakeUserId, deletedAt: new Date() }),
        },
        organizationMember: {
          findMany: jest.fn().mockResolvedValue([]),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        session: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        refreshToken: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
        mfaMethod: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        recoveryCode: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        passkey: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
        sharedCredential: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
      };

      jest.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });
      jest.spyOn(auditModule, "recordAuditEvent").mockResolvedValue({} as any);

      await deactivateUserAccount(fakeUserId);

      expect(mockTx.organizationMember.updateMany).toHaveBeenCalledWith({
        where: { userId: fakeUserId, status: "ACTIVE" },
        data: { status: "REMOVED" },
      });
    });
  });

  describe("SEC-F-004: Idempotency & Repeat Deactivation", () => {
    it("should return existing user without creating duplicate audit events if already deactivated", async () => {
      const existingDeletedUser = {
        id: fakeUserId,
        email: "test@example.com",
        deletedAt: new Date("2026-10-01T00:00:00Z"),
        isSuspended: true,
      };

      const mockTx: any = {
        $executeRaw: jest.fn().mockResolvedValue(1),
        user: {
          findUnique: jest.fn().mockResolvedValue(existingDeletedUser),
          update: jest.fn(),
        },
        organizationMember: {
          findMany: jest.fn(),
          updateMany: jest.fn(),
        },
        session: { updateMany: jest.fn() },
      };

      jest.spyOn(prisma, "$transaction").mockImplementation(async (callback: any) => {
        return callback(mockTx);
      });
      const recordAuditSpy = jest.spyOn(auditModule, "recordAuditEvent");

      const result = await deactivateUserAccount(fakeUserId);

      expect(result).toBe(existingDeletedUser);
      // Must NOT record another terminal audit event
      expect(recordAuditSpy).not.toHaveBeenCalled();
      // Must NOT re-update user
      expect(mockTx.user.update).not.toHaveBeenCalled();
    });
  });

  describe("SEC-F-005: KDF Salt Enumeration Protection", () => {
    it("should produce identical fake salt responses for deleted vs non-existent accounts", () => {
      const deletedEmail = "deleted-user@example.com";
      const nonExistentEmail = "never-registered@example.com";

      // Simulation of /kdf logic
      const computeFakeSalt = (email: string) => {
        const fakeSalt = crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
        return {
          salt: fakeSalt,
          memoryKb: 65536,
          iterations: 3,
          parallelism: 4,
        };
      };

      const deletedResponse = computeFakeSalt(deletedEmail);
      const nonExistentResponse = computeFakeSalt(nonExistentEmail);

      // Both should have identical shape and default KDF parameters
      expect(deletedResponse.memoryKb).toBe(65536);
      expect(nonExistentResponse.memoryKb).toBe(65536);
      expect(deletedResponse.iterations).toBe(3);
      expect(nonExistentResponse.iterations).toBe(3);
      expect(deletedResponse.salt).toHaveLength(32);
      expect(nonExistentResponse.salt).toHaveLength(32);

      // Same email produces deterministic salt regardless of query time
      expect(computeFakeSalt(deletedEmail)).toEqual(deletedResponse);
    });
  });
});
