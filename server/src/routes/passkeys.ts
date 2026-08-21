import { Router, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { UAParser } from "ua-parser-js";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import {
  createPasskeyRegistrationOptions,
  verifyPasskeyRegistration,
  createPasskeyAuthenticationOptions,
  verifyPasskeyAuthentication,
} from "../lib/passkey";
import { signAccessToken, signRefreshToken } from "../lib/jwt";
import { recordAuditEvent } from "../lib/audit";
import { parseDeviceType, generateDeviceFingerprint, evaluateSuspiciousDevice } from "../lib/device";

const router = Router();

// Approved Rate Limiters
const registerRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: "Too many passkey registration attempts. Try again in 15 minutes." },
});

const authenticateRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 15 : 100,
  message: { error: "Too many passkey authentication attempts. Try again in 15 minutes." },
});

const managementRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: "Too many passkey management requests. Try again in 15 minutes." },
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

// ── GET /api/auth/passkeys — List user passkeys ─────────────────────────────
router.get("/", requireAuth, managementRateLimiter, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const passkeys = await prisma.passkey.findMany({
    where: { userId },
    select: {
      id: true,
      credentialId: true,
      name: true,
      deviceType: true,
      createdAt: true,
      lastUsedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  res.json(passkeys);
});

// ── POST /api/auth/passkeys/register/begin ──────────────────────────────────
router.post("/register/begin", requireAuth, registerRateLimiter, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const existing = await prisma.passkey.findMany({ where: { userId }, select: { credentialId: true } });

  const { options, challengeId } = await createPasskeyRegistrationOptions(
    user.id,
    user.email,
    existing.map((e) => e.credentialId)
  );

  await recordAuditEvent(userId, "PASSKEY_REGISTRATION_STARTED", { challengeId });
  res.json({ options, challengeId });
});

// ── POST /api/auth/passkeys/register/complete ───────────────────────────────
const registerCompleteSchema = z.object({
  challengeId: z.string(),
  name: z.string().optional(),
  response: z.any(),
});

router.post("/register/complete", requireAuth, registerRateLimiter, async (req: AuthedRequest, res) => {
  const parsed = registerCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid registration payload" });

  const userId = req.userId!;
  const { challengeId, name, response } = parsed.data;

  try {
    const verification = await verifyPasskeyRegistration(challengeId, response, userId);
    if (!verification.verified || !verification.registrationInfo) {
      await recordAuditEvent(userId, "PASSKEY_AUTHENTICATION_FAILURE", { ceremony: "registration" });
      return res.status(400).json({ error: "Registration verification failed" });
    }

    const { credential, credentialDeviceType } = verification.registrationInfo;

    // Check duplicate credential ID
    const duplicate = await prisma.passkey.findUnique({
      where: { credentialId: credential.id },
    });
    if (duplicate) {
      return res.status(409).json({ error: "This passkey has already been registered" });
    }

    const passkey = await prisma.passkey.create({
      data: {
        userId,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey).toString("base64url"),
        signCount: credential.counter,
        deviceType: credentialDeviceType || "multiDevice",
        name: name || "Security Key / Passkey",
        transports: credential.transports ? JSON.stringify(credential.transports) : null,
      },
    });

    await recordAuditEvent(userId, "PASSKEY_REGISTERED", { passkeyId: passkey.id, name: passkey.name });
    res.json({ success: true, passkey });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : "Passkey registration failed" });
  }
});

// ── POST /api/auth/passkeys/authenticate/begin ──────────────────────────────
const authBeginSchema = z.object({
  email: z.string().email().optional(),
});

router.post("/authenticate/begin", authenticateRateLimiter, async (req, res) => {
  const parsed = authBeginSchema.safeParse(req.body);
  const email = parsed.success ? parsed.data.email : undefined;

  let userPasskeys: Array<{ credentialId: string; transports?: string | null }> | undefined;
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      userPasskeys = await prisma.passkey.findMany({
        where: { userId: user.id },
        select: { credentialId: true, transports: true },
      });
    }
  }

  const { options, challengeId } = await createPasskeyAuthenticationOptions(userPasskeys);
  
  if (email) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await recordAuditEvent(user.id, "PASSKEY_AUTHENTICATION_STARTED", { challengeId });
    }
  }

  res.json({ options, challengeId });
});

// ── POST /api/auth/passkeys/authenticate/complete ───────────────────────────
const authCompleteSchema = z.object({
  challengeId: z.string(),
  response: z.any(),
});

router.post("/authenticate/complete", authenticateRateLimiter, async (req, res) => {
  const parsed = authCompleteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid payload" });

  const { challengeId, response } = parsed.data;
  const credentialId = response.id;

  const passkey = await prisma.passkey.findUnique({
    where: { credentialId },
    include: { user: true },
  });

  if (!passkey) {
    return res.status(401).json({ error: "Unrecognized or deleted passkey credential" });
  }

  try {
    const verification = await verifyPasskeyAuthentication(challengeId, response, {
      credentialId: passkey.credentialId,
      publicKey: passkey.publicKey,
      signCount: passkey.signCount,
    });

    if (!verification.verified || !verification.authenticationInfo) {
      await recordAuditEvent(passkey.userId, "PASSKEY_AUTHENTICATION_FAILURE", { credentialId });
      return res.status(401).json({ error: "Passkey signature verification failed" });
    }

    const { newCounter } = verification.authenticationInfo;

    // Sign counter anomaly check
    if (passkey.signCount > 0 && newCounter <= passkey.signCount) {
      await recordAuditEvent(passkey.userId, "PASSKEY_AUTHENTICATION_FAILURE", {
        reason: "sign_counter_rollback",
        expectedCount: passkey.signCount,
        gotCount: newCounter,
      });
      return res.status(401).json({ error: "Security violation: Authenticator sign counter anomaly detected" });
    }

    // Update passkey sign count and last used timestamp
    await prisma.passkey.update({
      where: { id: passkey.id },
      data: { signCount: newCounter, lastUsedAt: new Date() },
    });

    // Create Session & tokens (integrating with Phase 3.2 Session architecture)
    const userAgentStr = req.headers["user-agent"];
    const { browser, os } = parseDevice(userAgentStr);
    const deviceType = parseDeviceType(userAgentStr);
    const deviceFingerprint = generateDeviceFingerprint(passkey.userId, userAgentStr);
    const isSuspicious = await evaluateSuspiciousDevice(passkey.userId, browser, os, deviceFingerprint);

    const session = await prisma.session.create({
      data: {
        userId: passkey.userId,
        tokenFamily: crypto.randomUUID(),
        lastTokenHash: "",
        ipAddress: req.ip,
        userAgent: userAgentStr,
        browser,
        os,
        deviceType,
        deviceFingerprint,
        isSuspicious,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await recordAuditEvent(passkey.userId, "DEVICE_SESSION_CREATED", {
      sessionId: session.id,
      browser,
      os,
      deviceType,
      ip: req.ip,
      isSuspicious,
      authMethod: "passkey",
    });

    if (isSuspicious) {
      await recordAuditEvent(passkey.userId, "SUSPICIOUS_DEVICE_DETECTED", {
        sessionId: session.id,
        browser,
        os,
        deviceType,
        ip: req.ip,
        reason: "new_unrecognized_device",
      });
    }

    const accessToken = signAccessToken({ sub: passkey.userId, sessionId: session.id, email: passkey.user.email, isSuperAdmin: passkey.user.isSuperAdmin });
    const refreshToken = signRefreshToken(passkey.userId, session.id, session.tokenFamily);

    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        userId: passkey.userId,
        tokenHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { lastTokenHash: tokenHash },
    });

    await recordAuditEvent(passkey.userId, "PASSKEY_AUTHENTICATION_SUCCESS", { passkeyId: passkey.id });
    await recordAuditEvent(passkey.userId, "LOGIN_SUCCESS", { ip: req.ip, method: "passkey" });

    setRefreshCookie(res, refreshToken);
    res.json({
      accessToken,
      refreshToken,
      kdf: {
        salt: passkey.user.kdfSalt,
        memoryKb: passkey.user.kdfMemoryKb,
        iterations: passkey.user.kdfIterations,
        parallelism: passkey.user.kdfParallelism,
      },
      encryptedVaultKey: {
        ciphertext: passkey.user.encryptedVaultKeyCiphertext,
        iv: passkey.user.encryptedVaultKeyIv,
      },
    });
  } catch (err) {
    return res.status(401).json({ error: err instanceof Error ? err.message : "Passkey authentication failed" });
  }
});

// ── PATCH /api/auth/passkeys/:id — Rename passkey (with IDOR check) ──────────
const renameSchema = z.object({
  name: z.string().min(1).max(50),
});

router.patch("/:id", requireAuth, managementRateLimiter, async (req: AuthedRequest, res) => {
  const parsed = renameSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Name must be between 1 and 50 characters" });

  const userId = req.userId!;
  const passkeyId = req.params.id;

  // Strict IDOR Check
  const passkey = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
  });

  if (!passkey) {
    return res.status(404).json({ error: "Passkey not found" });
  }

  const updated = await prisma.passkey.update({
    where: { id: passkey.id },
    data: { name: parsed.data.name },
  });

  await recordAuditEvent(userId, "PASSKEY_RENAMED", { passkeyId: passkey.id, newName: updated.name });
  res.json(updated);
});

// ── DELETE /api/auth/passkeys/:id — Remove passkey (with IDOR check) ─────────
router.delete("/:id", requireAuth, managementRateLimiter, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const passkeyId = req.params.id;

  // Strict IDOR Check
  const passkey = await prisma.passkey.findFirst({
    where: { id: passkeyId, userId },
  });

  if (!passkey) {
    return res.status(404).json({ error: "Passkey not found" });
  }

  await prisma.passkey.delete({ where: { id: passkey.id } });
  await recordAuditEvent(userId, "PASSKEY_REMOVED", { passkeyId: passkey.id, name: passkey.name });

  res.status(204).send();
});

export default router;
