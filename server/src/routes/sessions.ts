import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { recordAuditEvent } from "../lib/audit";

const router = Router();
router.use(requireAuth);

// ── GET /api/auth/sessions — List active sessions for authenticated user ───
router.get("/", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const currentSessionId = req.sessionId;

  const sessions = await prisma.session.findMany({
    where: {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { lastActiveAt: "desc" },
    select: {
      id: true,
      browser: true,
      os: true,
      deviceType: true,
      isSuspicious: true,
      ipAddress: true,
      createdAt: true,
      lastActiveAt: true,
      expiresAt: true,
    },
  });

  const formatted = sessions.map((s) => ({
    id: s.id,
    browser: s.browser || "Unknown Browser",
    os: s.os || "Unknown OS",
    deviceType: s.deviceType || "desktop",
    isSuspicious: s.isSuspicious ?? false,
    ipAddress: s.ipAddress || "Unknown IP",
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === currentSessionId,
  }));

  res.json(formatted);
});

// ── POST /api/auth/sessions/revoke-others — Revoke all other active sessions ─
router.post("/revoke-others", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const currentSessionId = req.sessionId;

  if (!currentSessionId) {
    return res.status(400).json({ error: "Current session identifier missing" });
  }

  // Find all active sessions for this user EXCEPT the calling session
  const otherSessions = await prisma.session.findMany({
    where: {
      userId,
      id: { not: currentSessionId },
      revokedAt: null,
    },
    select: { id: true },
  });

  const otherSessionIds = otherSessions.map((s) => s.id);

  if (otherSessionIds.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: { in: otherSessionIds } },
        data: { revokedAt: new Date() },
      });

      await tx.refreshToken.updateMany({
        where: { sessionId: { in: otherSessionIds } },
        data: { revoked: true },
      });
    });
  }

  await recordAuditEvent(userId, "DEVICE_SESSIONS_REVOKED_ALL_OTHERS", {
    currentSessionId,
    revokedCount: otherSessionIds.length,
    ip: req.ip,
  });

  res.json({
    message: "Successfully logged out all other devices",
    revokedCount: otherSessionIds.length,
  });
});

// ── DELETE /api/auth/sessions/:sessionId — Revoke individual session ───────
router.delete("/:sessionId", async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const targetSessionId = req.params.sessionId;

  // IDOR Protection: Query strictly where userId === req.userId and session exists
  const session = await prisma.session.findFirst({
    where: {
      id: targetSessionId,
      userId,
      revokedAt: null,
    },
  });

  if (!session) {
    // 404 anti-IDOR: don't reveal if session exists for another user
    return res.status(404).json({ error: "Session not found" });
  }

  // Revoke session and associated refresh tokens
  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  await prisma.refreshToken.updateMany({
    where: { sessionId: session.id },
    data: { revoked: true },
  });

  await recordAuditEvent(userId, "SESSION_REVOKED", {
    sessionId: session.id,
    isCurrent: session.id === req.sessionId,
    ip: req.ip,
  });

  await recordAuditEvent(userId, "DEVICE_SESSION_REVOKED", {
    sessionId: session.id,
    targetBrowser: session.browser,
    targetOs: session.os,
    targetDeviceType: session.deviceType,
    isCurrent: session.id === req.sessionId,
    ip: req.ip,
  });

  res.status(204).send();
});

export default router;
