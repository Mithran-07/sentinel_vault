import crypto from "crypto";
import {
  GENESIS_HASH,
  computeAuditEventPayload,
  computeAuditEventHash,
  verifyAuditChainEntries,
  verifyAuditChain,
  AuditChainVerificationItem,
} from "../../lib/audit";
import {
  truncateIpForAudit,
  SAFE_METADATA_KEYS,
  sanitizeAuditEvent,
} from "../../routes/admin";
import { prisma } from "../../lib/prisma";

describe("Batch D: Audit-Chain & Sanitization Unit Tests", () => {
  // ── 1. Genesis Hash & Chaining Primitives ─────────────────────────────────

  describe("1. Audit Chain Genesis & Hash Computation", () => {
    it("GENESIS_HASH is 64 zero hex characters (256-bit zero)", () => {
      expect(GENESIS_HASH).toBe("0".repeat(64));
      expect(GENESIS_HASH.length).toBe(64);
    });

    it("computeAuditEventPayload produces deterministic canonical JSON", () => {
      const payload1 = computeAuditEventPayload({
        userId: "user-uuid-1",
        eventType: "VAULT_ITEM_CREATED",
        metadata: { itemId: "item-1", action: "create" },
        prevHash: GENESIS_HASH,
        ts: 1700000000000,
      });

      const payload2 = computeAuditEventPayload({
        userId: "user-uuid-1",
        eventType: "VAULT_ITEM_CREATED",
        metadata: { itemId: "item-1", action: "create" },
        prevHash: GENESIS_HASH,
        ts: 1700000000000,
      });

      expect(payload1).toBe(payload2);
      expect(JSON.parse(payload1)).toEqual({
        userId: "user-uuid-1",
        eventType: "VAULT_ITEM_CREATED",
        metadata: { itemId: "item-1", action: "create" },
        prevHash: GENESIS_HASH,
        ts: 1700000000000,
      });
    });

    it("computeAuditEventHash produces deterministic SHA-256 hex digest", () => {
      const params = {
        userId: "user-uuid-1",
        eventType: "LOGIN",
        metadata: { ip: "127.0.0.1" },
        prevHash: GENESIS_HASH,
        ts: 1700000000000,
      };

      const hash1 = computeAuditEventHash(params);
      const hash2 = computeAuditEventHash(params);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);

      // Mutating any field alters the SHA-256 digest
      const alteredHash = computeAuditEventHash({
        ...params,
        metadata: { ip: "127.0.0.2" },
      });
      expect(alteredHash).not.toBe(hash1);
    });
  });

  // ── 2. Sequential Linking & Valid Chain Verification ──────────────────────

  describe("2. Sequential Linking & Verification", () => {
    it("empty chain passes verification", () => {
      const result = verifyAuditChainEntries([]);
      expect(result).toEqual({ valid: true, brokenAt: null });
    });

    it("single event with GENESIS_HASH passes verification", () => {
      const chain: AuditChainVerificationItem[] = [
        {
          id: "event-0",
          prevHash: GENESIS_HASH,
          hash: crypto.createHash("sha256").update("event-0-payload").digest("hex"),
        },
      ];

      const result = verifyAuditChainEntries(chain);
      expect(result).toEqual({ valid: true, brokenAt: null });
    });

    it("unbroken multi-event chain passes verification", () => {
      const userId = "user-123";
      const tsBase = 1700000000000;

      // Construct a valid 4-event chain: E0 -> E1 -> E2 -> E3
      const e0Hash = computeAuditEventHash({
        userId,
        eventType: "USER_REGISTERED",
        prevHash: GENESIS_HASH,
        ts: tsBase,
      });
      const e1Hash = computeAuditEventHash({
        userId,
        eventType: "VAULT_KEY_CREATED",
        prevHash: e0Hash,
        ts: tsBase + 1000,
      });
      const e2Hash = computeAuditEventHash({
        userId,
        eventType: "VAULT_ITEM_ADDED",
        prevHash: e1Hash,
        ts: tsBase + 2000,
      });
      const e3Hash = computeAuditEventHash({
        userId,
        eventType: "USER_LOGGED_IN",
        prevHash: e2Hash,
        ts: tsBase + 3000,
      });

      const chain: AuditChainVerificationItem[] = [
        { id: "e0", prevHash: GENESIS_HASH, hash: e0Hash },
        { id: "e1", prevHash: e0Hash, hash: e1Hash },
        { id: "e2", prevHash: e1Hash, hash: e2Hash },
        { id: "e3", prevHash: e2Hash, hash: e3Hash },
      ];

      const result = verifyAuditChainEntries(chain);
      expect(result).toEqual({ valid: true, brokenAt: null });
    });
  });

  // ── 3. Tampering: Genesis, History, Metadata, Reordering, Deletion ────────

  describe("3. Tamper Detection (Genesis, History, Reorder, Deletion)", () => {
    it("detects tampered genesis hash at first record", () => {
      const chain: AuditChainVerificationItem[] = [
        {
          id: "e0",
          prevHash: "forged_genesis_hash_" + "f".repeat(44),
          hash: "a".repeat(64),
        },
      ];

      const result = verifyAuditChainEntries(chain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe("e0");
    });

    it("detects historical record modification in subsequent record's prevHash", () => {
      const h0 = "0".repeat(63) + "1";
      const h1 = "0".repeat(63) + "2";
      const h2 = "0".repeat(63) + "3";

      const chain: AuditChainVerificationItem[] = [
        { id: "e0", prevHash: GENESIS_HASH, hash: h0 },
        { id: "e1", prevHash: h0, hash: h1 },
        { id: "e2", prevHash: h1, hash: h2 },
      ];

      // Attacker modifies e1's hash (e.g. to cover up tampered action)
      const tamperedChain: AuditChainVerificationItem[] = [
        { id: "e0", prevHash: GENESIS_HASH, hash: h0 },
        { id: "e1", prevHash: h0, hash: "f".repeat(64) }, // altered e1 hash
        { id: "e2", prevHash: h1, hash: h2 }, // e2 still points to old h1
      ];

      const result = verifyAuditChainEntries(tamperedChain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe("e2"); // Detected at e2 because e2.prevHash !== e1.hash
    });

    it("detects payload and metadata tampering when recomputed against event hash", () => {
      const userId = "user-audit-test";
      const originalMetadata = { role: "MEMBER", orgId: "org-1" };
      const ts = 1700000000000;

      const legitimateHash = computeAuditEventHash({
        userId,
        eventType: "ROLE_ASSIGNED",
        metadata: originalMetadata,
        prevHash: GENESIS_HASH,
        ts,
      });

      // Attacker attempts to forge elevated privileges in metadata without altering hash
      const tamperedMetadata = { role: "ADMIN", orgId: "org-1" };
      const recalculatedHash = computeAuditEventHash({
        userId,
        eventType: "ROLE_ASSIGNED",
        metadata: tamperedMetadata,
        prevHash: GENESIS_HASH,
        ts,
      });

      // Recalculating hash from tampered metadata proves payload integrity failure
      expect(recalculatedHash).not.toBe(legitimateHash);
    });

    it("detects swapped/reordered audit records", () => {
      const h0 = "1".repeat(64);
      const h1 = "2".repeat(64);
      const h2 = "3".repeat(64);

      // Legitimate sequence: e0 -> e1 -> e2
      // Swapped sequence: e0 -> e2 -> e1
      const swappedChain: AuditChainVerificationItem[] = [
        { id: "e0", prevHash: GENESIS_HASH, hash: h0 },
        { id: "e2", prevHash: h1, hash: h2 }, // e2 expects e1, but preceded by e0!
        { id: "e1", prevHash: h0, hash: h1 },
      ];

      const result = verifyAuditChainEntries(swappedChain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe("e2");
    });

    it("detects deleted/truncated intermediate record", () => {
      const h0 = "1".repeat(64);
      const h1 = "2".repeat(64);
      const h2 = "3".repeat(64);

      // Deleting e1 leaves e0 followed by e2
      const deletedChain: AuditChainVerificationItem[] = [
        { id: "e0", prevHash: GENESIS_HASH, hash: h0 },
        { id: "e2", prevHash: h1, hash: h2 }, // e2.prevHash is h1, but e0.hash is h0
      ];

      const result = verifyAuditChainEntries(deletedChain);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe("e2");
    });
  });

  // ── 4. Boundary Mocking of Database Verification (verifyAuditChain) ────────

  describe("4. Database Boundary Mocking (verifyAuditChain)", () => {
    it("queries audit records in ascending sequence order and returns valid for unbroken chain", async () => {
      const userId = "test-user-boundary";
      const h0 = "a".repeat(64);
      const h1 = "b".repeat(64);

      const findManySpy = jest.spyOn(prisma.auditEvent, "findMany").mockResolvedValue([
        { id: "evt-1", sequence: 1, userId, eventType: "LOGIN", metadata: null, prevHash: GENESIS_HASH, hash: h0, createdAt: new Date() },
        { id: "evt-2", sequence: 2, userId, eventType: "LOGOUT", metadata: null, prevHash: h0, hash: h1, createdAt: new Date() },
      ] as any);

      const result = await verifyAuditChain(userId);
      expect(result).toEqual({ valid: true, brokenAt: null });

      expect(findManySpy).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { sequence: "asc" },
      });

      findManySpy.mockRestore();
    });

    it("detects broken chain from database query without live DB connection", async () => {
      const userId = "test-user-broken";

      const findManySpy = jest.spyOn(prisma.auditEvent, "findMany").mockResolvedValue([
        { id: "evt-1", sequence: 1, userId, eventType: "LOGIN", metadata: null, prevHash: GENESIS_HASH, hash: "a".repeat(64), createdAt: new Date() },
        { id: "evt-2", sequence: 2, userId, eventType: "LOGOUT", metadata: null, prevHash: "corrupted_prev_hash", hash: "b".repeat(64), createdAt: new Date() },
      ] as any);

      const result = await verifyAuditChain(userId);
      expect(result.valid).toBe(false);
      expect(result.brokenAt).toBe("evt-2");

      findManySpy.mockRestore();
    });
  });

  // ── 5. IP Address Masking Behavior (truncateIpForAudit) ────────────────────

  describe("5. IP Address Masking Behavior", () => {
    it("masks standard IPv4 addresses by replacing the last octet with .xxx", () => {
      expect(truncateIpForAudit("192.168.1.100")).toBe("192.168.1.xxx");
      expect(truncateIpForAudit("10.0.0.1")).toBe("10.0.0.xxx");
      expect(truncateIpForAudit("172.16.254.1")).toBe("172.16.254.xxx");
      expect(truncateIpForAudit("8.8.8.8")).toBe("8.8.8.xxx");
    });

    it("unwraps and masks IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)", () => {
      expect(truncateIpForAudit("::ffff:192.168.1.42")).toBe("192.168.1.xxx");
      expect(truncateIpForAudit("::ffff:10.20.30.40")).toBe("10.20.30.xxx");
    });

    it("truncates standard IPv6 addresses to /48 prefix", () => {
      expect(truncateIpForAudit("2001:0db8:85a3:0000:0000:8a2e:0370:7334")).toBe(
        "2001:0db8:85a3::/48"
      );
      expect(truncateIpForAudit("fe80:0000:0000:0000:0204:61ff:fe9d:f156")).toBe(
        "fe80:0000:0000::/48"
      );
    });

    it("handles malformed IPv4 and IPv6 strings gracefully", () => {
      expect(truncateIpForAudit("192.168.1")).toBe("ipv4.xxx"); // less than 4 octets
      expect(truncateIpForAudit("10.1")).toBe("ipv4.xxx");
    });

    it("returns 'unknown' for undefined, empty, or unparseable input", () => {
      expect(truncateIpForAudit(undefined)).toBe("unknown");
      expect(truncateIpForAudit("")).toBe("unknown");
      expect(truncateIpForAudit("invalid-ip-format")).toBe("unknown");
    });
  });

  // ── 6. Audit Metadata Sanitization (sanitizeAuditEvent) ───────────────────

  describe("6. Audit Metadata Whitelisting & Sanitization", () => {
    it("preserves whitelisted safe metadata keys and masks IP addresses", () => {
      const rawEvent = {
        id: "event-1",
        sequence: 1,
        userId: "user-abc",
        eventType: "ADMIN_USER_UPDATED",
        createdAt: new Date(),
        metadata: {
          orgId: "org-123",
          targetUserId: "target-456",
          reason: "Role elevation",
          ip: "192.168.1.55",
          browser: "Chrome",
          os: "macOS",
          attempts: 1,
          status: "SUCCESS",
          name: "Test Admin",
          roleId: "role-admin",
          email: "admin@example.com",
          collectionId: "col-1",
          keyVersion: 1,
          policyType: "STRICT",
        },
      };

      const sanitized = sanitizeAuditEvent(rawEvent);

      expect(sanitized.id).toBe(rawEvent.id);
      expect(sanitized.sequence).toBe(rawEvent.sequence);
      expect(sanitized.userId).toBe(rawEvent.userId);
      expect(sanitized.eventType).toBe(rawEvent.eventType);

      // IP is safely truncated
      expect(sanitized.metadata.ip).toBe("192.168.1.xxx");

      // All safe keys retained
      expect(sanitized.metadata.orgId).toBe("org-123");
      expect(sanitized.metadata.targetUserId).toBe("target-456");
      expect(sanitized.metadata.reason).toBe("Role elevation");
      expect(sanitized.metadata.browser).toBe("Chrome");
      expect(sanitized.metadata.status).toBe("SUCCESS");
      expect(sanitized.metadata.policyType).toBe("STRICT");
    });

    it("strictly strips sensitive or forbidden keys from metadata", () => {
      const rawEvent = {
        id: "event-2",
        sequence: 2,
        userId: "user-abc",
        eventType: "USER_AUTHENTICATED",
        createdAt: new Date(),
        metadata: {
          ip: "10.0.0.99",
          browser: "Firefox",
          // Sensitive keys that must NEVER leak to audit viewers:
          password: "plain_text_password!",
          masterPassword: "master_password_hash",
          ciphertext: "encrypted_vault_key_blob",
          vaultKey: "raw_vault_key_bytes",
          token: "jwt_access_token_value",
          secret: "mfa_totp_seed_secret",
          authHash: "argon2id_auth_hash",
          creditCard: "4111-2222-3333-4444",
        },
      };

      const sanitized = sanitizeAuditEvent(rawEvent);

      // Permitted safe keys
      expect(sanitized.metadata.ip).toBe("10.0.0.xxx");
      expect(sanitized.metadata.browser).toBe("Firefox");

      // Strictly stripped sensitive keys
      expect(sanitized.metadata.password).toBeUndefined();
      expect(sanitized.metadata.masterPassword).toBeUndefined();
      expect(sanitized.metadata.ciphertext).toBeUndefined();
      expect(sanitized.metadata.vaultKey).toBeUndefined();
      expect(sanitized.metadata.token).toBeUndefined();
      expect(sanitized.metadata.secret).toBeUndefined();
      expect(sanitized.metadata.authHash).toBeUndefined();
      expect(sanitized.metadata.creditCard).toBeUndefined();
    });

    it("handles null or missing metadata gracefully without throwing", () => {
      const rawEvent = {
        id: "event-3",
        sequence: 3,
        userId: "user-abc",
        eventType: "SIMPLE_EVENT",
        createdAt: new Date(),
        metadata: null,
      };

      const sanitized = sanitizeAuditEvent(rawEvent);
      expect(sanitized.metadata).toEqual({});
    });
  });
});
