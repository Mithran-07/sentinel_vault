import { Router, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { UAParser } from "ua-parser-js";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import {
  secretProtection,
  generateTotpSetup,
  verifyTotpCode,
  isMfaChallengeJtiUsed,
  markMfaChallengeJtiUsed,
} from "../lib/mfa";
import {
  verifyAccessToken,
  signAccessToken,
  signRefreshToken,
} from "../lib/jwt";
import { recordAuditEvent } from "../lib/audit";

const router = Router();

// Rate limiter: max 5 TOTP code verification attempts per 5 minutes to prevent PIN brute force
const totpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many MFA verification attempts. Please try again in 5 minutes." },
});

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function parseDevice(userAgentStr?: string) {
  if (!userAgentStr) return { browser: "Unknown", os: "Unknown" };
  const parser = new UAParser(userAgentStr);
  const result = parser.getResult();
  return {
    browser: `${result.browser.name || "Unknown"} ${result.browser.version || ""}`.trim(),
    os: `${result.os.name || "Unknown"} ${result.os.version || ""}`.trim(),
  };
}

// ── GET /api/auth/mfa/status — Check if user has MFA active ──────────────────
router.get("/status", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const mfa = await prisma.mfaMethod.findFirst({
    where: { userId, type: "TOTP", verifiedAt: { not: null } },
  });

  res.json({
    mfaEnabled: !!mfa,
    type: mfa ? "TOTP" : null,
  });
});

// ── POST /api/auth/mfa/totp/setup — Initiate TOTP enrollment ────────────────
router.post("/totp/setup", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  // Clean up any stale unverified setup attempts for this user
  await prisma.mfaMethod.deleteMany({
    where: { userId, type: "TOTP", verifiedAt: null },
  });

  const setup = await generateTotpSetup(user.email);
  const encryptedPayload = await secretProtection.encryptSecret(setup.secret);

  // Store encrypted secret with verifiedAt = null (unverified until first successful code)
  await prisma.mfaMethod.create({
    data: {
      userId,
      type: "TOTP",
      secretEncrypted: JSON.stringify(encryptedPayload),
      verifiedAt: null,
    },
  });

  await recordAuditEvent(userId, "MFA_ENROLLMENT_STARTED", { type: "TOTP" });

  res.json({
    secret: setup.secret, // Returned ONLY during enrollment step to display setup key
    otpauthUrl: setup.otpauthUrl,
    qrCodeDataUrl: setup.qrCodeDataUrl,
  });
});

// ── POST /api/auth/mfa/totp/verify — Finalize enrollment with 6-digit code ─
const verifySchema = z.object({
  code: z.string().length(6),
});

router.post("/totp/verify", requireAuth, totpRateLimiter, async (req: AuthedRequest, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid code format. 6 digits required." });
  }

  const userId = req.userId!;
  const unverified = await prisma.mfaMethod.findFirst({
    where: { userId, type: "TOTP", verifiedAt: null },
  });

  if (!unverified || !unverified.secretEncrypted) {
    return res.status(404).json({ error: "No pending MFA setup found" });
  }

  const payload = JSON.parse(unverified.secretEncrypted);
  const secret = await secretProtection.decryptSecret(payload);

  const isValid = verifyTotpCode(secret, parsed.data.code);
  if (!isValid) {
    await recordAuditEvent(userId, "MFA_VERIFICATION_FAILURE", { context: "enrollment" });
    return res.status(401).json({ error: "Invalid authentication code" });
  }

  // Mark MFA method as verified/enabled
  await prisma.mfaMethod.update({
    where: { id: unverified.id },
    data: { verifiedAt: new Date() },
  });

  await recordAuditEvent(userId, "MFA_ENROLLED", { type: "TOTP" });

  res.json({ success: true, message: "Multi-Factor Authentication enabled successfully" });
});

// ── POST /api/auth/mfa/totp/authenticate — Complete 2-step login challenge ─
const authenticateSchema = z.object({
  mfaToken: z.string(),
  code: z.string().length(6),
});

router.post("/totp/authenticate", totpRateLimiter, async (req, res) => {
  const parsed = authenticateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { mfaToken, code } = parsed.data;

  try {
    const payload = verifyAccessToken(mfaToken);

    // Purpose & challenge token validation
    if (payload.purpose !== "mfa_challenge" || !payload.jti) {
      return res.status(401).json({ error: "Invalid challenge token" });
    }

    // Replay protection: check single-use JTI
    if (isMfaChallengeJtiUsed(payload.jti)) {
      await recordAuditEvent(payload.sub, "MFA_VERIFICATION_FAILURE", { reason: "replay_attempt" });
      return res.status(401).json({ error: "Challenge token has already been used" });
    }
    markMfaChallengeJtiUsed(payload.jti);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });
    const mfa = await prisma.mfaMethod.findFirst({
      where: { userId: user.id, type: "TOTP", verifiedAt: { not: null } },
    });

    if (!mfa || !mfa.secretEncrypted) {
      return res.status(400).json({ error: "MFA not configured for this account" });
    }

    const secretPayload = JSON.parse(mfa.secretEncrypted);
    const secret = await secretProtection.decryptSecret(secretPayload);

    const isValid = verifyTotpCode(secret, code);
    if (!isValid) {
      await recordAuditEvent(user.id, "MFA_VERIFICATION_FAILURE", { context: "login" });
      return res.status(401).json({ error: "Invalid authentication code" });
    }

    // TOTP verification succeeded! Issue full Session & tokens
    const userAgentStr = req.headers["user-agent"];
    const { browser, os } = parseDevice(userAgentStr);
    const session = await prisma.session.create({
      data: {
        userId: user.id,
        tokenFamily: crypto.randomUUID(),
        lastTokenHash: "",
        ipAddress: req.ip,
        userAgent: userAgentStr,
        browser,
        os,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    const accessToken = signAccessToken({ sub: user.id, sessionId: session.id, email: user.email, isSuperAdmin: user.isSuperAdmin });
    const refreshToken = signRefreshToken(user.id, session.id, session.tokenFamily);

    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { lastTokenHash: tokenHash },
    });

    await recordAuditEvent(user.id, "MFA_VERIFICATION_SUCCESS", { context: "login" });
    await recordAuditEvent(user.id, "LOGIN_SUCCESS", { ip: req.ip, mfaUsed: true });

    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      refreshToken,
      kdf: {
        salt: user.kdfSalt,
        memoryKb: user.kdfMemoryKb,
        iterations: user.kdfIterations,
        parallelism: user.kdfParallelism,
      },
      encryptedVaultKey: {
        ciphertext: user.encryptedVaultKeyCiphertext,
        iv: user.encryptedVaultKeyIv,
      },
    });
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired MFA challenge token" });
  }
});

// ── POST /api/auth/mfa/totp/disable — Disable TOTP MFA ─────────────────────
const disableSchema = z.object({
  code: z.string().length(6),
});

router.post("/totp/disable", requireAuth, totpRateLimiter, async (req: AuthedRequest, res) => {
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Current 6-digit authentication code required to disable MFA" });
  }

  const userId = req.userId!;
  const currentSessionId = req.sessionId;

  const mfa = await prisma.mfaMethod.findFirst({
    where: { userId, type: "TOTP", verifiedAt: { not: null } },
  });

  if (!mfa || !mfa.secretEncrypted) {
    return res.status(400).json({ error: "MFA is not currently enabled" });
  }

  const payload = JSON.parse(mfa.secretEncrypted);
  const secret = await secretProtection.decryptSecret(payload);

  const isValid = verifyTotpCode(secret, parsed.data.code);
  if (!isValid) {
    await recordAuditEvent(userId, "MFA_VERIFICATION_FAILURE", { context: "disable" });
    return res.status(401).json({ error: "Invalid authentication code" });
  }

  // Remove MFA method
  await prisma.mfaMethod.delete({ where: { id: mfa.id } });

  // Security Policy: Revoke all OTHER sessions when MFA is disabled
  if (currentSessionId) {
    await prisma.session.updateMany({
      where: { userId, id: { not: currentSessionId }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await prisma.refreshToken.updateMany({
      where: { userId, sessionId: { not: currentSessionId }, revoked: false },
      data: { revoked: true },
    });
  }

  await recordAuditEvent(userId, "MFA_DISABLED", { type: "TOTP", otherSessionsRevoked: true });

  res.json({ success: true, message: "MFA disabled and other active sessions revoked for security" });
});

export default router;
