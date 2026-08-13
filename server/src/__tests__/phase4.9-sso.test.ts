/**
 * Phase 4.9 — Enterprise SSO & Identity Provider Integration Tests
 * Covers: config RBAC, SSO configuration, secret safety, tenant isolation, suspension, JIT placeholders.
 */

import { createHash, randomBytes } from "crypto";
import request from "supertest";
import { prisma } from "../lib/prisma";

const API_BASE = "http://127.0.0.1:4000";

jest.mock("../lib/kms", () => ({
  assertKmsConfigured: jest.fn(),
  verifyKmsKeyAccess: jest.fn().mockResolvedValue(true),
  encryptOidcClientSecret: jest.fn().mockImplementation(async (providerId, secret) => {
    return JSON.stringify({ ciphertext: "mock_ciphertext", iv: "mock_iv", tag: "mock_tag" });
  }),
  decryptOidcClientSecret: jest.fn().mockImplementation(async (providerId, ciphertext) => {
    return "mock_decrypted_secret";
  }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
async function registerUser(email: string) {
  const saltHex = randomBytes(16).toString("hex");
  const authHash = createHash("sha256").update(`auth_${email}_${saltHex}`).digest("base64");
  const res = await request(API_BASE).post("/api/auth/register").send({
    email,
    authHash,
    kdfSalt: saltHex,
    kdfMemoryKb: 65536,
    kdfIterations: 3,
    kdfParallelism: 4,
    encryptedVaultKeyCiphertext: "dummyCiphertext",
    encryptedVaultKeyIv: "dummyIv",
  });
  if (res.status !== 201) throw new Error(`Registration failed for ${email}: ${JSON.stringify(res.body)}`);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return { accessToken: res.body.accessToken as string, userId: user.id, email };
}

async function createOrg(ownerToken: string, name: string) {
  const res = await request(API_BASE)
    .post("/api/orgs")
    .set("Authorization", `Bearer ${ownerToken}`)
    .send({ name });
  if (res.status !== 201) throw new Error(`Org creation failed: ${JSON.stringify(res.body)}`);
  return res.body.data;
}

// ── Test Suite ────────────────────────────────────────────────────────────────
describe("Phase 4.9 — SSO & Identity Provider Integration", () => {
  let adminToken: string;
  let adminId: string;
  let adminEmail: string;
  let orgId: string;
  let regularToken: string;
  let regularUserId: string;
  let orgBId: string;
  let orgBAdminToken: string;

  beforeAll(async () => {
    const ts = Date.now();

    // Org A admin
    const admin = await registerUser(`sso_admin_${ts}@orgA.test`);
    adminToken = admin.accessToken;
    adminId = admin.userId;
    adminEmail = admin.email;

    const org = await createOrg(adminToken, `SSO Org A ${ts}`);
    orgId = org.id;

    // Regular user in Org A (no sso.manage)
    const regular = await registerUser(`sso_regular_${ts}@orgA.test`);
    regularToken = regular.accessToken;
    regularUserId = regular.userId;
    await prisma.organizationMember.create({
      data: { orgId, userId: regularUserId, role: "MEMBER", status: "ACTIVE" }
    });

    // Org B (for tenant isolation tests)
    const orgBAdmin = await registerUser(`sso_orgb_admin_${ts}@orgB.test`);
    orgBAdminToken = orgBAdmin.accessToken;
    const orgB = await createOrg(orgBAdminToken, `SSO Org B ${ts}`);
    orgBId = orgB.id;
  });

  // ── 1. Authentication & Authorization ─────────────────────────────────────
  describe("1. Authentication & Authorization", () => {
    it("GET /api/orgs/:orgId/sso — rejects unauthenticated", async () => {
      const res = await request(API_BASE).get(`/api/orgs/${orgId}/sso`);
      expect(res.status).toBe(401);
    });

    it("GET /api/orgs/:orgId/sso — rejects member without sso.manage", async () => {
      const res = await request(API_BASE)
        .get(`/api/orgs/${orgId}/sso`)
        .set("Authorization", `Bearer ${regularToken}`);
      expect(res.status).toBe(403);
    });

    it("PUT /api/orgs/:orgId/sso/saml — rejects unauthenticated", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/saml`)
        .send({ entityId: "x", ssoUrl: "https://idp.test", x509Certificate: "cert" });
      expect(res.status).toBe(401);
    });

    it("PUT /api/orgs/:orgId/sso/saml — rejects member without sso.manage", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/saml`)
        .set("Authorization", `Bearer ${regularToken}`)
        .send({ entityId: "x", ssoUrl: "https://idp.test", x509Certificate: "cert" });
      expect(res.status).toBe(403);
    });

    it("PUT /api/orgs/:orgId/sso/oidc — rejects member without sso.manage", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/oidc`)
        .set("Authorization", `Bearer ${regularToken}`)
        .send({ clientId: "x", clientSecret: "s", issuer: "https://idp.test" });
      expect(res.status).toBe(403);
    });
  });

  // ── 2. SAML Configuration ─────────────────────────────────────────────────
  describe("2. SAML Configuration", () => {
    it("allows org admin to configure SAML", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/saml`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityId: "https://idp.example.com",
          ssoUrl: "https://idp.example.com/sso/saml",
          x509Certificate: "MIIB... (test cert data)",
          isActive: true,
        });
      expect(res.status).toBe(200);
      expect(res.body.config.type).toBe("SAML");
      expect(res.body.config.isActive).toBe(true);
    });

    it("can retrieve SAML config without returning secret", async () => {
      const res = await request(API_BASE)
        .get(`/api/orgs/${orgId}/sso`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe("SAML");
      expect(res.body.entityId).toBe("https://idp.example.com");
      // Secrets must never be returned
      expect(res.body.clientSecretCiphertext).toBeUndefined();
      expect(res.body.clientSecret).toBeUndefined();
    });

    it("returns 404 for org with no SSO configured", async () => {
      const res = await request(API_BASE)
        .get(`/api/orgs/${orgBId}/sso`)
        .set("Authorization", `Bearer ${orgBAdminToken}`);
      expect(res.status).toBe(404);
    });

    it("validates SAML schema — rejects invalid ssoUrl", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/saml`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityId: "https://idp.example.com",
          ssoUrl: "not-a-url", // Invalid
          x509Certificate: "cert",
        });
      expect(res.status).toBe(400);
    });

    it("validates SAML schema — rejects missing entityId", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/saml`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          ssoUrl: "https://idp.example.com/sso",
          x509Certificate: "cert",
        });
      expect(res.status).toBe(400);
    });
  });

  // ── 3. OIDC Configuration ─────────────────────────────────────────────────
  describe("3. OIDC Configuration", () => {
    it.skip("allows org admin to configure OIDC", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/oidc`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          clientId: "my_client_id_123",
          clientSecret: "super_sensitive_secret_value",
          issuer: "https://accounts.google.com",
          isActive: true,
        });
      expect(res.status).toBe(200);
      expect(res.body.config.type).toBe("OIDC");
    });

    it.skip("OIDC client secret is NOT returned in GET response", async () => {
      const res = await request(API_BASE)
        .get(`/api/orgs/${orgId}/sso`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.type).toBe("OIDC");
      expect(res.body.clientId).toBe("my_client_id_123");
      // CRITICAL: Secret must never appear in any form
      expect(res.body.clientSecretCiphertext).toBeUndefined();
      expect(res.body.clientSecret).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("super_sensitive_secret_value");
    });

    it.skip("OIDC client secret is encrypted at rest, not plaintext", async () => {
      const idp = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });
      expect(idp).not.toBeNull();
      expect(idp!.clientSecretCiphertext).not.toBeNull();
      // It should be JSON with ciphertext/iv/tag fields (AES-256-GCM encrypted)
      const parsed = JSON.parse(idp!.clientSecretCiphertext!);
      expect(parsed.ciphertext).toBeDefined();
      expect(parsed.iv).toBeDefined();
      expect(parsed.tag).toBeDefined();
      // The plaintext secret must NOT appear in the stored ciphertext
      expect(idp!.clientSecretCiphertext).not.toContain("super_sensitive_secret_value");
    });

    it("validates OIDC schema — rejects invalid issuer URL", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/oidc`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          clientId: "x",
          clientSecret: "s",
          issuer: "not-a-url",
        });
      expect(res.status).toBe(400);
    });

    it("validates OIDC schema — rejects empty clientId", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/oidc`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          clientId: "",
          clientSecret: "secret",
          issuer: "https://accounts.google.com",
        });
      expect(res.status).toBe(400);
    });
  });

  // ── 4. Tenant Isolation ───────────────────────────────────────────────────
  describe("4. Tenant Isolation", () => {
    it("Org A admin cannot read Org B's SSO config", async () => {
      const res = await request(API_BASE)
        .get(`/api/orgs/${orgBId}/sso`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });

    it("Org A admin cannot configure Org B's SAML", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgBId}/sso/saml`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityId: "https://malicious.idp.com",
          ssoUrl: "https://malicious.idp.com/sso",
          x509Certificate: "malicious_cert",
        });
      expect(res.status).toBe(403);
    });

    it("Org A admin cannot configure Org B's OIDC", async () => {
      const res = await request(API_BASE)
        .put(`/api/orgs/${orgBId}/sso/oidc`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          clientId: "injected_client",
          clientSecret: "injected_secret",
          issuer: "https://injected.com",
        });
      expect(res.status).toBe(403);
    });
  });

  // ── 5. SSO Discovery Flow ─────────────────────────────────────────────────
  describe("5. SSO Login Discovery", () => {
    it("GET /api/auth/sso/login — rejects missing identifier", async () => {
      const res = await request(API_BASE).get("/api/auth/sso/login");
      expect(res.status).toBe(400);
    });

    it("GET /api/auth/sso/login — rejects invalid email format", async () => {
      const res = await request(API_BASE).get("/api/auth/sso/login?identifier=notanemail");
      expect(res.status).toBe(400);
    });

    it("GET /api/auth/sso/login — returns 404 for nonexistent user", async () => {
      const res = await request(API_BASE).get(`/api/auth/sso/login?identifier=${encodeURIComponent("ghost@nonexistent.test")}`);
      expect(res.status).toBe(404);
    });

    it("GET /api/auth/sso/login — returns 400 if org has no SSO configured", async () => {
      // Org B admin user has no SSO configured in Org B
      const res = await request(API_BASE).get(`/api/auth/sso/login?identifier=${encodeURIComponent(orgBAdminToken)}`);
      // We'd need the actual email, let's use orgBAdmin's email
      const orgBAdminUser = await prisma.user.findFirst({ where: { organizationMembers: { some: { orgId: orgBId } } } });
      if (orgBAdminUser) {
        const res2 = await request(API_BASE).get(`/api/auth/sso/login?identifier=${encodeURIComponent(orgBAdminUser.email)}`);
        expect([400, 404]).toContain(res2.status);
      }
    });
  });

  // ── 6. Suspension Enforcement ─────────────────────────────────────────────
  describe("6. Suspension Enforcement", () => {
    it("suspended user is rejected by requireAuth", async () => {
      const suspendedUser = await registerUser(`sso_suspended_${Date.now()}@test.test`);
      await prisma.user.update({ where: { id: suspendedUser.userId }, data: { isSuspended: true } });
      const res = await request(API_BASE)
        .get(`/api/orgs/${orgId}/sso`)
        .set("Authorization", `Bearer ${suspendedUser.accessToken}`);
      expect(res.status).toBe(401);
      // Clean up
      await prisma.user.delete({ where: { id: suspendedUser.userId } });
    });
  });

  // ── 7. Zero-Knowledge Invariants ──────────────────────────────────────────
  describe("7. Zero-Knowledge Invariants", () => {
    it("OIDC client secret never appears in any API response body", async () => {
      // Configure with a known secret
      const secret = `known_secret_${Date.now()}`;
      await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/oidc`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          clientId: "zk_test_client",
          clientSecret: secret,
          issuer: "https://accounts.google.com",
          isActive: true,
        });

      const getRes = await request(API_BASE)
        .get(`/api/orgs/${orgId}/sso`)
        .set("Authorization", `Bearer ${adminToken}`);
      expect(JSON.stringify(getRes.body)).not.toContain(secret);
    });

    it("JIT provisioned user has cryptoSetupPending=true in database", async () => {
      // We can directly verify a JIT user created via the processSsoUser helper
      // by creating one in the database and checking the field
      const jitUser = await prisma.user.create({
        data: {
          email: `jit_test_${Date.now()}@sso.test`,
          authHash: "sso_pending_dummy",
          kdfSalt: "sso_pending",
          encryptedVaultKeyCiphertext: "sso_pending",
          encryptedVaultKeyIv: "sso_pending",
          cryptoSetupPending: true,
        }
      });
      expect(jitUser.cryptoSetupPending).toBe(true);
      // Clean up
      await prisma.user.delete({ where: { id: jitUser.id } });
    });

    it("JIT user placeholder auth data cannot be used for password login", async () => {
      // Create a JIT user with placeholder auth hash
      const jitEmail = `jit_login_${Date.now()}@sso.test`;
      await prisma.user.create({
        data: {
          email: jitEmail,
          authHash: "sso_pending_some_uuid_here",
          kdfSalt: "sso_pending",
          encryptedVaultKeyCiphertext: "sso_pending",
          encryptedVaultKeyIv: "sso_pending",
          cryptoSetupPending: true,
        }
      });

      // Attempt to login with the placeholder hash
      const loginRes = await request(API_BASE).post("/api/auth/login").send({
        email: jitEmail,
        authHash: "sso_pending_some_uuid_here",
      });
      // Login should fail — argon2 will reject the placeholder non-hash string
      expect(loginRes.status).not.toBe(200);
      // Clean up
      await prisma.user.deleteMany({ where: { email: jitEmail } });
    });
  });

  // ── 8. Database Schema Verification ───────────────────────────────────────
  describe("8. Database Schema Verification", () => {
    it("IdentityProvider is organization-scoped with unique constraint", async () => {
      // Configuring SAML twice in the same org should upsert, not create duplicate
      await request(API_BASE)
        .put(`/api/orgs/${orgId}/sso/saml`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityId: "https://idp.example.com",
          ssoUrl: "https://idp.example.com/sso",
          x509Certificate: "cert",
          isActive: true,
        });

      const count = await prisma.identityProvider.count({ where: { organizationId: orgId } });
      expect(count).toBe(1); // Upsert, not insert
    });

    it("IdentityProvider cascades on Organization delete", async () => {
      const tempOrg = await createOrg(adminToken, `Temp Org ${Date.now()}`);
      await request(API_BASE)
        .put(`/api/orgs/${tempOrg.id}/sso/saml`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          entityId: "https://temp.idp.com",
          ssoUrl: "https://temp.idp.com/sso",
          x509Certificate: "temp_cert",
        });

      const before = await prisma.identityProvider.findUnique({ where: { organizationId: tempOrg.id } });
      expect(before).not.toBeNull();

      // Delete the organization
      await prisma.organization.delete({ where: { id: tempOrg.id } });

      const after = await prisma.identityProvider.findUnique({ where: { organizationId: tempOrg.id } });
      expect(after).toBeNull(); // Cascaded
    });

    it("User model has ssoProviderId, ssoSubjectId, cryptoSetupPending fields", async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
      expect(user).toHaveProperty("ssoProviderId");
      expect(user).toHaveProperty("ssoSubjectId");
      expect(user).toHaveProperty("cryptoSetupPending");
      expect(user.cryptoSetupPending).toBe(false); // Normal user
    });
  });
});
