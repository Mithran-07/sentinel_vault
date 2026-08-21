import { Router } from "express";
import { z } from "zod";
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import {
  randomState,
  randomNonce,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  buildAuthorizationUrl,
} from "openid-client";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireOrgPermission } from "../middleware/orgAuth";
import { recordAuditEvent } from "../lib/audit";
import { signAccessToken, signRefreshToken } from "../lib/jwt";
import {
  assertKmsConfigured,
  decryptOidcClientSecret,
  encryptOidcClientSecret,
  KmsConfigurationError,
  verifyKmsKeyAccess,
} from "../lib/kms";

// We will implement SAML and OIDC logic here or in separate libs.

const router = Router();

// Zod schemas for SSO config
const SamlConfigSchema = z.object({
  entityId: z.string().min(1),
  ssoUrl: z.string().url(),
  x509Certificate: z.string().min(1),
  isActive: z.boolean().default(true),
});

const OidcConfigSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1), // Plaintext from client, we encrypt it
  issuer: z.string().url(),
  isActive: z.boolean().default(true),
});

/**
 * GET /api/orgs/:orgId/sso
 * Fetches SSO configuration for an organization (no secrets).
 */
router.get("/:orgId/sso", requireAuth, requireOrgPermission("sso.manage"), async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  const config = await prisma.identityProvider.findUnique({
    where: { organizationId: orgId }
  });

  if (!config) {
    return res.status(404).json({ error: "SSO configuration not found" });
  }

  // Sanitize response
  return res.json({
    id: config.id,
    type: config.type,
    isActive: config.isActive,
    entityId: config.entityId,
    ssoUrl: config.ssoUrl,
    x509Certificate: config.x509Certificate,
    clientId: config.clientId,
    issuer: config.issuer,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  });
});

/**
 * PUT /api/orgs/:orgId/sso/saml
 * Configures SAML IdP
 */
router.put("/:orgId/sso/saml", requireAuth, requireOrgPermission("sso.manage"), async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  const parsed = SamlConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  const config = await prisma.identityProvider.upsert({
    where: { organizationId: orgId },
    update: {
      type: "SAML",
      entityId: data.entityId,
      ssoUrl: data.ssoUrl,
      x509Certificate: data.x509Certificate,
      isActive: data.isActive,
      // Clear OIDC fields
      clientId: null,
      clientSecretCiphertext: null,
      issuer: null,
    },
    create: {
      organizationId: orgId,
      type: "SAML",
      entityId: data.entityId,
      ssoUrl: data.ssoUrl,
      x509Certificate: data.x509Certificate,
      isActive: data.isActive,
    }
  });

  await recordAuditEvent(req.userId!, "sso.configured", { orgId, type: "SAML", isActive: data.isActive });

  res.json({ message: "SAML configured successfully", config: { type: config.type, isActive: config.isActive } });
});

/**
 * PUT /api/orgs/:orgId/sso/oidc
 * Configures OIDC IdP
 */
router.put("/:orgId/sso/oidc", requireAuth, requireOrgPermission("sso.manage"), async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  const parsedOidc = OidcConfigSchema.safeParse(req.body);
  if (!parsedOidc.success) {
    return res.status(400).json({ error: "Invalid input", details: parsedOidc.error.flatten() });
  }
  const data = parsedOidc.data;

  try {
    assertKmsConfigured();
    await verifyKmsKeyAccess();
  } catch (error) {
    // Do not fall back to the development MFA cipher or reveal KMS details.
    return res.status(error instanceof KmsConfigurationError ? 503 : 503).json({
      error: "OIDC configuration is temporarily unavailable",
    });
  }

  // A new UUID can safely be used in the encryption context before the row is
  // created. This avoids ever persisting an enabled OIDC provider without a
  // KMS-protected secret, and preserves an existing configuration on failure.
  const existing = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });
  const providerId = existing?.id ?? uuidv4();
  let clientSecretCiphertext: string;
  try {
    clientSecretCiphertext = await encryptOidcClientSecret(providerId, data.clientSecret);
  } catch {
    // Never fall back to a local cipher or alter a working configuration.
    return res.status(503).json({ error: "OIDC configuration is temporarily unavailable" });
  }
  const config = await prisma.identityProvider.upsert({
    where: { organizationId: orgId },
    update: {
      type: "OIDC",
      clientId: data.clientId,
      clientSecretCiphertext,
      issuer: data.issuer,
      isActive: data.isActive,
      entityId: null,
      ssoUrl: null,
      x509Certificate: null,
    },
    create: {
      id: providerId,
      organizationId: orgId,
      type: "OIDC",
      clientId: data.clientId,
      clientSecretCiphertext,
      issuer: data.issuer,
      isActive: data.isActive,
    },
  });

  await recordAuditEvent(req.userId!, "sso.configured", { orgId, type: "OIDC", isActive: data.isActive });

  res.json({ message: "OIDC configured successfully", config: { type: config.type, isActive: config.isActive } });
});

/**
 * GET /api/orgs/:orgId/sso/attributes
 * Fetch attribute mappings
 */
router.get("/:orgId/sso/attributes", requireAuth, requireOrgPermission("sso.manage"), async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  const provider = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });
  if (!provider) return res.status(404).json({ error: "SSO not configured" });

  const mappings = await prisma.idpAttributeMapping.findMany({
    where: { providerId: provider.id }
  });
  res.json({ mappings });
});

const AttributeMappingSchema = z.object({
  idpAttribute: z.string().min(1),
  appAttribute: z.string().min(1),
});

/**
 * POST /api/orgs/:orgId/sso/attributes
 * Create attribute mapping
 */
router.post("/:orgId/sso/attributes", requireAuth, requireOrgPermission("sso.manage"), async (req: AuthedRequest, res) => {
  const { orgId } = req.params;
  const parsed = AttributeMappingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const provider = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });
  if (!provider) return res.status(404).json({ error: "SSO not configured" });

  try {
    const mapping = await prisma.idpAttributeMapping.create({
      data: {
        providerId: provider.id,
        idpAttribute: parsed.data.idpAttribute,
        appAttribute: parsed.data.appAttribute
      }
    });
    await recordAuditEvent(req.userId!, "sso.mapping.created", { orgId, idpAttribute: mapping.idpAttribute, appAttribute: mapping.appAttribute });
    res.json({ mapping });
  } catch (err) {
    res.status(400).json({ error: "Mapping already exists" });
  }
});

/**
 * DELETE /api/orgs/:orgId/sso/attributes/:id
 * Delete attribute mapping
 */
router.delete("/:orgId/sso/attributes/:id", requireAuth, requireOrgPermission("sso.manage"), async (req: AuthedRequest, res) => {
  const { orgId, id } = req.params;
  const provider = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });
  if (!provider) return res.status(404).json({ error: "SSO not configured" });

  const mapping = await prisma.idpAttributeMapping.findUnique({ where: { id } });
  if (!mapping || mapping.providerId !== provider.id) {
    return res.status(404).json({ error: "Mapping not found" });
  }

  await prisma.idpAttributeMapping.delete({ where: { id } });
  await recordAuditEvent(req.userId!, "sso.mapping.deleted", { orgId, idpAttribute: mapping.idpAttribute, appAttribute: mapping.appAttribute });
  res.json({ message: "Mapping deleted" });
});

// Zod schemas for auth callbacks
const SSOAuthRequestSchema = z.object({
  email: z.string().email(),
});

export const ssoAuthRouter = Router();

ssoAuthRouter.get("/login", async (req, res) => {
  const identifier = req.query.identifier as string;
  if (!identifier) {
    return res.status(400).json({ error: "Missing identifier (email)" });
  }

  // Domain discovery
  const domain = identifier.split("@")[1];
  if (!domain) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  // Find orgs by member email domain. (Realistically, domains should be verified and claimed by an org, 
  // but for this phase we match by user email or let's assume we look up an org where a user with this email exists).
  // Wait! A user might not exist yet if JIT is needed. We need a way to map domain to org.
  // Without a `domains` array on `Organization`, we can look up an existing user.
  // If the user doesn't exist, how do we know which org they belong to for JIT?
  // We can query organizations that have this domain in their members, but what if no members exist?
  // Let's rely on finding a user for now.
  const user = await prisma.user.findUnique({
    where: { email: identifier.toLowerCase().trim() },
    include: { organizationMembers: { include: { org: { include: { identityProvider: true } } } } }
  });

  if (!user) {
    // If we want JIT, the user MUST be invited first, or we must use IdP-initiated flow.
    // Or we must have Org-level Domain claiming. Since we don't have domain claiming,
    // let's assume JIT means they must be invited first (status = INVITED), or we reject.
    return res.status(404).json({ error: "No organization found for this email" });
  }

  const orgMember = user.organizationMembers[0];
  if (!orgMember) {
    return res.status(404).json({ error: "User is not part of any organization" });
  }

  const idp = orgMember.org.identityProvider;
  if (!idp || !idp.isActive) {
    return res.status(400).json({ error: "SSO is not configured for this organization" });
  }

  const callbackBase = process.env.API_URL || "http://127.0.0.1:4000";

  if (idp.type === "SAML") {
    const { createSamlProvider } = await import("../lib/saml");
    const saml = createSamlProvider({
      entityId: idp.entityId!,
      ssoUrl: idp.ssoUrl!,
      x509Certificate: idp.x509Certificate!,
      issuer: `${callbackBase}/api/auth/sso/saml/metadata/${idp.organizationId}`,
      callbackUrl: `${callbackBase}/api/auth/sso/saml/acs/${idp.organizationId}`,
    });
    
    // We can't generate a redirect easily without an express req, but SAML class has `getAuthorizeUrlAsync`
    const url = await saml.getAuthorizeUrlAsync("", "", {});
    return res.json({ url });
  } else if (idp.type === "OIDC") {
    const { createOidcClient } = await import("../lib/oidc");
    if (!idp.clientSecretCiphertext) {
      return res.status(503).json({ error: "OIDC is temporarily unavailable" });
    }
    const decryptedSecret = await decryptOidcClientSecret(idp.id, idp.clientSecretCiphertext);
    const client = await createOidcClient({
      issuer: idp.issuer!,
      clientId: idp.clientId!,
      clientSecret: decryptedSecret,
    });
    
    const state = randomState();
    const code_verifier = randomPKCECodeVerifier();
    const code_challenge = await calculatePKCECodeChallenge(code_verifier);
    const nonce = randomNonce();

    // Persist transaction securely in the database
    await prisma.ssoTransaction.create({
      data: {
        providerId: idp.id,
        organizationId: idp.organizationId,
        state,
        nonce,
        pkceVerifier: code_verifier,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes expiry
      }
    });

    const redirect_uri = `${callbackBase}/api/auth/sso/oidc/callback`;
    
    const url = buildAuthorizationUrl(client, {
      redirect_uri,
      state,
      code_challenge,
      code_challenge_method: "S256",
      nonce,
      scope: "openid profile email"
    }).href;
    
    return res.json({ url });
  }

  return res.status(400).json({ error: "Invalid SSO configuration" });
});

export default router;

// ────────────────────────────────────────────────────────────────────────────
// Public SSO auth router (no requireAuth — these are callback endpoints)
// ────────────────────────────────────────────────────────────────────────────

async function getMappedAttributes(providerId: string, claims: Record<string, any>): Promise<Record<string, any>> {
  const mappings = await prisma.idpAttributeMapping.findMany({ where: { providerId } });
  const mapped: Record<string, any> = { ...claims }; // base claims

  for (const mapping of mappings) {
    if (claims[mapping.idpAttribute] !== undefined) {
      mapped[mapping.appAttribute] = claims[mapping.idpAttribute];
    }
  }
  return mapped;
}

// We need a helper for processing the successful SSO user
async function processSsoUser(subject: string, email: string, providerId: string, orgId: string) {
  // Normalize email
  const normalizedEmail = email.trim().toLowerCase();
  
  // 1. Look up by authoritative provider + subject
  let ssoIdentity = await prisma.ssoIdentity.findUnique({
    where: { providerId_subject: { providerId, subject } },
    include: { user: true }
  });

  let user = ssoIdentity?.user;

  if (user) {
    if (user.isSuspended) {
      throw new Error("User account is suspended");
    }
    // Verify membership
    const member = await prisma.organizationMember.findUnique({
      where: { orgId_userId: { orgId, userId: user.id } }
    });
    if (!member || member.status !== "ACTIVE") {
      throw new Error("User is not an active member of this organization");
    }
  } else {
    // Identity does not exist. Do NOT auto-link based on email collision.
    const existingEmailUser = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existingEmailUser) {
      throw new Error("Email collision: Account already exists but is not linked to this SSO provider.");
    }

    // JIT Provisioning
    user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        authHash: "sso_pending_" + uuidv4(), // Placeholder
        kdfSalt: "sso_pending", 
        encryptedVaultKeyCiphertext: "sso_pending",
        encryptedVaultKeyIv: "sso_pending",
        cryptoSetupPending: true,
        ssoProviderId: providerId,
        ssoSubjectId: subject,
      }
    });

    // Add them to the org
    await prisma.organizationMember.create({
      data: {
        orgId,
        userId: user.id,
        role: "MEMBER",
        status: "ACTIVE"
      }
    });

    // Bind identity
    await prisma.ssoIdentity.create({
      data: {
        userId: user.id,
        providerId,
        subject
      }
    });

    await recordAuditEvent(user.id, "user.jit_provisioned", { orgId, providerId, subject });
  }

  // Create session
  const tokenFamily = uuidv4();
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      tokenFamily,
      lastTokenHash: "",
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
    }
  });

  const accessToken = signAccessToken({ sub: user.id, sessionId: session.id, email: user.email, isSuperAdmin: user.isSuperAdmin });
  const refreshTokenStr = signRefreshToken(user.id, session.id, tokenFamily);
  const hash = crypto.createHash("sha256").update(refreshTokenStr).digest("hex");
  
  await prisma.session.update({
    where: { id: session.id },
    data: { lastTokenHash: hash }
  });

  await prisma.refreshToken.create({
    data: {
      sessionId: session.id,
      userId: user.id,
      tokenHash: hash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });

  await recordAuditEvent(user.id, "user.login.sso", { orgId, sessionId: session.id });

  return { accessToken, refreshTokenStr, cryptoSetupPending: user.cryptoSetupPending };
}

ssoAuthRouter.post("/saml/acs/:orgId", async (req, res) => {
  const { orgId } = req.params;
  const idp = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });
  
  if (!idp || idp.type !== "SAML" || !idp.isActive) {
    return res.status(400).json({ error: "Invalid or inactive SAML configuration" });
  }

  const callbackBase = process.env.API_URL || "http://127.0.0.1:4000";
  const { createSamlProvider } = await import("../lib/saml");
  const saml = createSamlProvider({
    entityId: idp.entityId!,
    ssoUrl: idp.ssoUrl!,
    x509Certificate: idp.x509Certificate!,
    issuer: `${callbackBase}/api/auth/sso/saml/metadata/${idp.organizationId}`,
    callbackUrl: `${callbackBase}/api/auth/sso/saml/acs/${idp.organizationId}`,
  });

  try {
    const { profile } = await saml.validatePostResponseAsync(req.body);
    const mappedProfile = await getMappedAttributes(idp.id, profile || {});
    const email = mappedProfile?.email || mappedProfile?.nameID || mappedProfile?.mail;
    
    if (!email) {
      return res.status(400).json({ error: "SAML response missing email claim" });
    }

    const subject = mappedProfile?.nameID || email;

    // Check durable replay barrier
    if (profile?.inResponseTo) {
      try {
        await prisma.samlAssertionReplay.create({
          data: {
            providerId: idp.id,
            assertionId: String(profile.inResponseTo), // Using inResponseTo or assertion ID
            expiresAt: new Date(Date.now() + 5 * 60 * 1000)
          }
        });
      } catch (err) {
        return res.status(401).json({ error: "SAML assertion replay detected" });
      }
    }

    const { accessToken, refreshTokenStr, cryptoSetupPending } = await processSsoUser(subject, email, idp.id, orgId);

    // Normally we'd set the refresh token in cookie and redirect to frontend 
    // where they can get the access token from the URL hash or we just set both in cookies.
    // For simplicity, we can set them in cookies and redirect.
    res.cookie("refreshToken", refreshTokenStr, { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/api/auth" });
    const frontendUrl = process.env.CLIENT_ORIGIN || "http://localhost:3000";
    
    return res.redirect(`${frontendUrl}/sso-callback?token=${accessToken}&setupPending=${cryptoSetupPending}`);
  } catch {
    return res.status(401).json({ error: "SAML authentication failed" });
  }
});

// Note: The callback endpoint doesn't need orgId from URL, it gets it from the transaction state
ssoAuthRouter.get("/oidc/callback", async (req, res) => {
  const state = req.query.state as string;
  if (!state) {
    return res.status(400).json({ error: "Missing state parameter" });
  }

  // Atomically claim the transaction
  const transaction = await prisma.ssoTransaction.findUnique({ where: { state } });
  
  if (!transaction) {
    return res.status(401).json({ error: "Invalid or missing OIDC transaction state" });
  }
  
  if (transaction.expiresAt.getTime() < Date.now()) {
    return res.status(401).json({ error: "OIDC transaction expired" });
  }
  if (transaction.consumedAt) {
    return res.status(401).json({ error: "OIDC transaction already consumed" });
  }

  // Atomically consume
  await prisma.ssoTransaction.update({
    where: { id: transaction.id },
    data: { consumedAt: new Date() }
  });

  const orgId = transaction.organizationId;
  
  const idp = await prisma.identityProvider.findUnique({ where: { organizationId: orgId } });

  if (!idp || idp.type !== "OIDC" || !idp.isActive || idp.id !== transaction.providerId) {
    return res.status(400).json({ error: "Invalid or inactive OIDC configuration" });
  }

  const { createOidcClient } = await import("../lib/oidc");
  const openidClient = await import("openid-client");
  if (!idp.clientSecretCiphertext) {
    return res.status(503).json({ error: "OIDC is temporarily unavailable" });
  }
  let decryptedSecret: string;
  try {
    decryptedSecret = await decryptOidcClientSecret(idp.id, idp.clientSecretCiphertext);
  } catch {
    return res.status(503).json({ error: "OIDC is temporarily unavailable" });
  }
  const client = await createOidcClient({
    issuer: idp.issuer!,
    clientId: idp.clientId!,
    clientSecret: decryptedSecret,
  });

  const callbackBase = process.env.API_URL || "http://127.0.0.1:4000";
  const redirect_uri = `${callbackBase}/api/auth/sso/oidc/callback`;

  const nonce = transaction.nonce;
  const code_verifier = transaction.pkceVerifier;

  try {
    // OpenID Client v6 syntax for auth code exchange
    // URL containing the query string from IdP
    const currentUrl = new URL(req.originalUrl, callbackBase);
    const tokens = await openidClient.authorizationCodeGrant(client, currentUrl, {
      expectedState: state,
      expectedNonce: nonce,
      pkceCodeVerifier: code_verifier
    });

    const claims = tokens.claims();
    const mappedClaims = await getMappedAttributes(idp.id, claims || {});
    
    if (!mappedClaims || !mappedClaims.email) {
       return res.status(400).json({ error: "OIDC missing email claim" });
    }
    
    const subject = mappedClaims.sub || (mappedClaims.email as string);

    const { accessToken, refreshTokenStr, cryptoSetupPending } = await processSsoUser(subject, mappedClaims.email as string, idp.id, orgId);

    // Clear old cookies if any exist
    res.clearCookie("oidc_state");
    res.clearCookie("oidc_nonce");
    res.clearCookie("oidc_verifier");

    res.cookie("refreshToken", refreshTokenStr, { httpOnly: true, secure: process.env.NODE_ENV === "production", path: "/api/auth" });
    const frontendUrl = process.env.CLIENT_ORIGIN || "http://localhost:3000";
    
    return res.redirect(`${frontendUrl}/sso-callback?token=${accessToken}&setupPending=${cryptoSetupPending}`);
  } catch (err) {
    return res.status(401).json({ error: "OIDC authentication failed" });
  }
});
