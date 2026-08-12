import { Router, Response } from "express";
import argon2 from "argon2";
import crypto from "crypto";
import { z } from "zod";
import { UAParser } from "ua-parser-js";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken, signMfaChallengeToken } from "../lib/jwt";
import { recordAuditEvent } from "../lib/audit";
import rateLimit from "express-rate-limit";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later" },
});

const router = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

// Cookie helper
function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie("refreshToken", { path: "/api/auth" });
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

// ── Registration ─────────────────────────────────────────────────────────────
const registerSchema = z.object({
  email: z.string().email(),
  authHash: z.string().min(20),
  kdfSalt: z.string().min(16),
  kdfMemoryKb: z.number().int().positive().optional(),
  kdfIterations: z.number().int().positive().optional(),
  kdfParallelism: z.number().int().positive().optional(),
  encryptedVaultKeyCiphertext: z.string().min(1),
  encryptedVaultKeyIv: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return res.status(409).json({ error: "Account already exists" });
  }

  // Double-hash authHash server-side with Argon2id
  const serverAuthHash = await argon2.hash(data.authHash, { type: argon2.argon2id });

  const user = await prisma.user.create({
    data: {
      email: data.email,
      authHash: serverAuthHash,
      kdfSalt: data.kdfSalt,
      kdfMemoryKb: data.kdfMemoryKb ?? 65536,
      kdfIterations: data.kdfIterations ?? 3,
      kdfParallelism: data.kdfParallelism ?? 4,
      encryptedVaultKeyCiphertext: data.encryptedVaultKeyCiphertext,
      encryptedVaultKeyIv: data.encryptedVaultKeyIv,
      lastLoginAt: new Date(),
      lastLoginIp: req.ip,
    },
  });

  await recordAuditEvent(user.id, "ACCOUNT_CREATED", { email: user.email });

  // Create initial Session
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

  const accessToken = signAccessToken({ sub: user.id, sessionId: session.id, email: user.email });
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

  await recordAuditEvent(user.id, "SESSION_CREATED", { sessionId: session.id, ip: req.ip });

  setRefreshCookie(res, refreshToken);
  res.status(201).json({ accessToken, refreshToken });
});

// ── KDF prelogin (account-enumeration resistant) ───────────────────────────
router.get("/kdf", authLimiter, async (req, res) => {
  const email = String(req.query.email || "");
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user) {
    // Deterministic fake salt per email to prevent timing/response enumeration
    const fakeSalt = crypto.createHash("sha256").update(email).digest("hex").slice(0, 32);
    return res.json({ salt: fakeSalt, memoryKb: 65536, iterations: 3, parallelism: 4 });
  }

  res.json({
    salt: user.kdfSalt,
    memoryKb: user.kdfMemoryKb,
    iterations: user.kdfIterations,
    parallelism: user.kdfParallelism,
  });
});

// ── Login ────────────────────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email(),
  authHash: z.string().min(20),
});

router.post("/login", authLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { email, authHash } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });

  // Progressive lockout check
  if (user && user.lockoutUntil && user.lockoutUntil > new Date()) {
    const minutesLeft = Math.ceil((user.lockoutUntil.getTime() - Date.now()) / 60000);
    return res.status(429).json({
      error: `Account temporarily locked due to multiple failed login attempts. Try again in ${minutesLeft} minute(s).`,
    });
  }

  // Constant-time verify pattern to avoid user enumeration by response time
  const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$c29tZWhhc2g";
  const ok = await argon2.verify(user?.authHash ?? dummyHash, authHash).catch(() => false);

  if (!user || !ok) {
    if (user) {
      const failedAttempts = user.failedLoginAttempts + 1;
      const lockoutUntil = failedAttempts >= MAX_FAILED_ATTEMPTS ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null;
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: failedAttempts, lockoutUntil },
      });
      await recordAuditEvent(user.id, "LOGIN_FAILURE", { ip: req.ip, attempts: failedAttempts });
    }
    return res.status(401).json({ error: "Invalid email or master password" });
  }

  // Reset lockout tracking on successful auth
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginAttempts: 0, lockoutUntil: null, lastLoginAt: new Date(), lastLoginIp: req.ip },
  });

  await recordAuditEvent(user.id, "LOGIN_SUCCESS", { ip: req.ip });

  // Check if MFA is enabled for this account
  const mfa = await prisma.mfaMethod.findFirst({
    where: { userId: user.id, type: "TOTP", verifiedAt: { not: null } },
  });

  if (mfa) {
    const mfaToken = signMfaChallengeToken(user.id);
    await recordAuditEvent(user.id, "MFA_CHALLENGE_CREATED", { type: "TOTP" });
    return res.json({
      mfaRequired: true,
      mfaToken,
    });
  }

  // Create new Session (MFA not enabled)
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

  const accessToken = signAccessToken({ sub: user.id, sessionId: session.id, email: user.email });
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

  await recordAuditEvent(user.id, "SESSION_CREATED", { sessionId: session.id, ip: req.ip });

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
});

// ── Refresh Token Rotation with Replay Detection ────────────────────────────
router.post("/refresh", async (req, res) => {
  const tokenFromCookie = req.cookies?.refreshToken;
  const tokenFromBody = req.body?.refreshToken;
  const rawToken = tokenFromCookie || tokenFromBody;

  if (!rawToken) {
    return res.status(400).json({ error: "Missing refresh token" });
  }

  try {
    const payload = verifyRefreshToken(rawToken);
    const incomingHash = hashToken(rawToken);

    // Look up the refresh token record
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash: incomingHash },
      include: { session: true },
    });

    if (!storedToken) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Invalid refresh token" });
    }

    // 🚨 REUSE DETECTION: If this token was ALREADY used, revoke the entire session/family!
    if (storedToken.usedAt !== null || storedToken.revoked || storedToken.session?.revokedAt !== null) {
      if (storedToken.sessionId) {
        // Revoke the entire session and all associated refresh tokens
        await prisma.session.update({
          where: { id: storedToken.sessionId },
          data: { revokedAt: new Date() },
        });
        await prisma.refreshToken.updateMany({
          where: { sessionId: storedToken.sessionId },
          data: { revoked: true },
        });
      }

      await recordAuditEvent(payload.sub, "REFRESH_TOKEN_REUSE_DETECTED", {
        sessionId: storedToken.sessionId,
        tokenHash: incomingHash,
      });

      clearRefreshCookie(res);
      return res.status(401).json({ error: "Security alert: refresh token reuse detected. Session revoked." });
    }

    // Check expiration
    if (storedToken.expiresAt < new Date()) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: "Refresh token expired" });
    }

    // Single-use: Mark current token as used
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { usedAt: new Date() },
    });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: payload.sub } });

    // Issue NEW refresh token in the SAME token family
    const newRefreshToken = signRefreshToken(user.id, payload.sessionId, payload.family);
    const newHash = hashToken(newRefreshToken);

    await prisma.refreshToken.create({
      data: {
        sessionId: payload.sessionId,
        userId: user.id,
        tokenHash: newHash,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    await prisma.session.update({
      where: { id: payload.sessionId },
      data: { lastTokenHash: newHash, lastActiveAt: new Date() },
    });

    const newAccessToken = signAccessToken({ sub: user.id, sessionId: payload.sessionId, email: user.email });

    await recordAuditEvent(user.id, "REFRESH_TOKEN_ROTATED", { sessionId: payload.sessionId });

    setRefreshCookie(res, newRefreshToken);
    res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("Refresh error:", err);
    clearRefreshCookie(res);
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

// ── Logout (Single Session) ──────────────────────────────────────────────────
router.post("/logout", async (req, res) => {
  const tokenFromCookie = req.cookies?.refreshToken;
  const tokenFromBody = req.body?.refreshToken;
  const rawToken = tokenFromCookie || tokenFromBody;

  if (rawToken) {
    try {
      const incomingHash = hashToken(rawToken);
      const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: incomingHash } });
      if (stored) {
        await prisma.refreshToken.update({ where: { id: stored.id }, data: { revoked: true } });
        if (stored.sessionId) {
          await prisma.session.update({ where: { id: stored.sessionId }, data: { revokedAt: new Date() } });
          await recordAuditEvent(stored.userId, "SESSION_REVOKED", { sessionId: stored.sessionId });
        }
        await recordAuditEvent(stored.userId, "LOGOUT", { sessionId: stored.sessionId });
      }
    } catch {
      // Ignore token verification errors during logout
    }
  }

  clearRefreshCookie(res);
  res.status(204).send();
});

// ── Logout All Sessions ──────────────────────────────────────────────────────
router.post("/logout-all", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;

  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });

  await recordAuditEvent(userId, "SESSION_REVOKED_ALL", { ip: req.ip });

  clearRefreshCookie(res);
  res.status(204).send();
});

export default router;
