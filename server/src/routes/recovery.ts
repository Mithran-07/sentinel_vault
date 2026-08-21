import { Router, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { UAParser } from "ua-parser-js";
import crypto from "crypto";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { verifyAccessToken, signAccessToken, signRefreshToken } from "../lib/jwt";
import { recordAuditEvent } from "../lib/audit";
import { parseDeviceType, generateDeviceFingerprint, evaluateSuspiciousDevice } from "../lib/device";
import {
  generateRecoveryCodeBatch,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
} from "../lib/recovery";

const router = Router();

// IP Rate Limiter: 10 requests per 15 minutes
const recoveryIpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === "production" ? 10 : 100,
  message: { error: "Too many recovery attempts from this IP. Try again in 15 minutes." },
});

// Account Throttling Map: Track failed attempts per userId/email
interface AccountThrottle {
  attempts: number;
  resetAt: number;
}
const accountThrottleMap = new Map<string, AccountThrottle>();

function checkAccountThrottle(accountKey: string): boolean {
  const now = Date.now();
  const entry = accountThrottleMap.get(accountKey);
  if (!entry) return false;
  if (now > entry.resetAt) {
    accountThrottleMap.delete(accountKey);
    return false;
  }
  return entry.attempts >= 5;
}

function incrementAccountThrottle(accountKey: string) {
  const now = Date.now();
  const entry = accountThrottleMap.get(accountKey);
  if (!entry || now > entry.resetAt) {
    accountThrottleMap.set(accountKey, { attempts: 1, resetAt: now + 15 * 60 * 1000 });
  } else {
    entry.attempts += 1;
  }
}

function clearAccountThrottle(accountKey: string) {
  accountThrottleMap.delete(accountKey);
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie("refreshToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

// ── POST /api/auth/recovery/generate ───────────────────────────────────────
router.post("/generate", requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;
  const plaintextCodes = generateRecoveryCodeBatch(10);
  const batchId = crypto.randomUUID();

  // Hash each code using Argon2id
  const hashedCodes = await Promise.all(plaintextCodes.map((code) => hashRecoveryCode(code)));

  await prisma.$transaction(async (tx) => {
    // Delete previous recovery codes for this user
    await tx.recoveryCode.deleteMany({ where: { userId } });

    // Create new batch of recovery codes
    for (const codeHash of hashedCodes) {
      await tx.recoveryCode.create({
        data: {
          userId,
          codeHash,
          batchId,
        },
      });
    }
  });

  await recordAuditEvent(userId, "RECOVERY_CODES_GENERATED", { batchId, count: 10 });

  res.json({
    codes: plaintextCodes,
    batchId,
  });
});

// ── GET /api/auth/recovery/status ──────────────────────────────────────────
router.get("/status", requireAuth, async (req: AuthedRequest, res: Response) => {
  const userId = req.userId!;

  const remainingCodes = await prisma.recoveryCode.count({
    where: { userId, usedAt: null },
  });

  res.json({
    enabled: remainingCodes > 0,
    remainingCodes,
  });
});

// ── POST /api/auth/recovery/verify ─────────────────────────────────────────
const verifySchema = z.object({
  mfaToken: z.string().min(1),
  recoveryCode: z.string().min(1),
});

router.post("/verify", recoveryIpRateLimiter, async (req, res) => {
  try {
    const parsed = verifySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request payload" });
    }

    const { mfaToken, recoveryCode } = parsed.data;

    // 1. Verify 2-step mfaToken
    let tokenPayload: any;
    try {
      tokenPayload = verifyAccessToken(mfaToken);
    } catch {
      return res.status(401).json({ error: "Invalid recovery code or challenge token" });
    }

    if (tokenPayload.purpose !== "mfa_challenge" || !tokenPayload.sub) {
      return res.status(401).json({ error: "Invalid recovery code or challenge token" });
    }

    const userId = tokenPayload.sub;

    // 2. Account throttling check
    if (checkAccountThrottle(userId)) {
      return res.status(429).json({ error: "Too many recovery attempts for this account. Try again in 15 minutes." });
    }

    // 3. User & active recovery codes lookup
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      incrementAccountThrottle(userId);
      return res.status(401).json({ error: "Invalid recovery code or challenge token" });
    }

    const activeCodes = await prisma.recoveryCode.findMany({
      where: { userId, usedAt: null },
    });

    if (activeCodes.length === 0) {
      incrementAccountThrottle(userId);
      await recordAuditEvent(userId, "RECOVERY_CODE_REJECTED", { reason: "no_active_codes" });
      return res.status(401).json({ error: "Invalid recovery code or challenge token" });
    }

    // 4. Verify submitted code against active code hashes
    let matchedCodeId: string | null = null;
    for (const record of activeCodes) {
      const isMatch = await verifyRecoveryCodeHash(recoveryCode, record.codeHash);
      if (isMatch) {
        matchedCodeId = record.id;
        break;
      }
    }

    if (!matchedCodeId) {
      incrementAccountThrottle(userId);
      await recordAuditEvent(userId, "RECOVERY_CODE_REJECTED", { reason: "invalid_code" });
      return res.status(401).json({ error: "Invalid recovery code or challenge token" });
    }

    // 5. Atomic single-use consumption & Session Creation in Prisma $transaction
    const userAgentStr = req.headers["user-agent"];
    const parser = new UAParser(userAgentStr);
    const browser = `${parser.getBrowser().name || "Unknown"} ${parser.getBrowser().version || ""}`.trim();
    const os = `${parser.getOS().name || "Unknown"} ${parser.getOS().version || ""}`.trim();
    const deviceType = parseDeviceType(userAgentStr);
    const deviceFingerprint = generateDeviceFingerprint(userId, userAgentStr);
    const isSuspicious = await evaluateSuspiciousDevice(userId, browser, os, deviceFingerprint);

    const ipAddress = req.ip || req.socket.remoteAddress || "127.0.0.1";
    const tokenFamily = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    const session = await prisma.$transaction(async (tx) => {
      // Atomically mark recovery code as used
      await tx.recoveryCode.update({
        where: { id: matchedCodeId! },
        data: { usedAt: new Date() },
      });

      // Revoke all OTHER active sessions for this user
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Revoke all active refresh tokens for this user
      await tx.refreshToken.updateMany({
        where: { userId, revoked: false },
        data: { revoked: true },
      });

      // Create new active Session
      const newSession = await tx.session.create({
        data: {
          userId,
          tokenFamily,
          lastTokenHash: "initial_recovery",
          userAgent: userAgentStr,
          browser,
          os,
          deviceType,
          deviceFingerprint,
          isSuspicious,
          ipAddress,
          expiresAt,
        },
      });

      return newSession;
    });

    await recordAuditEvent(userId, "DEVICE_SESSION_CREATED", {
      sessionId: session.id,
      browser,
      os,
      deviceType,
      ip: ipAddress,
      isSuspicious,
      authMethod: "recovery_code",
    });

    if (isSuspicious) {
      await recordAuditEvent(userId, "SUSPICIOUS_DEVICE_DETECTED", {
        sessionId: session.id,
        browser,
        os,
        deviceType,
        ip: ipAddress,
        reason: "new_unrecognized_device",
      });
    }

    // Issue tokens
    const accessToken = signAccessToken({ sub: user.id, sessionId: session.id, email: user.email, isSuperAdmin: user.isSuperAdmin });
    const refreshTokenRaw = signRefreshToken(user.id, session.id, tokenFamily);
    const refreshTokenHash = crypto.createHash("sha256").update(refreshTokenRaw).digest("hex");

    await prisma.refreshToken.create({
      data: {
        sessionId: session.id,
        userId: user.id,
        tokenHash: refreshTokenHash,
        expiresAt,
      },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { lastTokenHash: refreshTokenHash },
    });

    setRefreshCookie(res, refreshTokenRaw);
    clearAccountThrottle(userId);

    const remainingCount = activeCodes.length - 1;
    await recordAuditEvent(userId, "RECOVERY_CODE_USED", { remainingCodes: remainingCount });

    res.json({
      accessToken,
      user: {
        id: user.id,
        email: user.email,
      },
      kdf: {
        salt: user.kdfSalt,
        iterations: user.kdfIterations,
        memoryKb: user.kdfMemoryKb,
        parallelism: user.kdfParallelism,
      },
      encryptedVaultKey: {
        ciphertext: user.encryptedVaultKeyCiphertext,
        iv: user.encryptedVaultKeyIv,
      },
    });
  } catch (err) {
    console.error("RECOVERY VERIFY ERROR:", err);
    throw err;
  }
});

export default router;
