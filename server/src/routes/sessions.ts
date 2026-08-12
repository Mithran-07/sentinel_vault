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
    ipAddress: s.ipAddress || "Unknown IP",
    createdAt: s.createdAt,
    lastActiveAt: s.lastActiveAt,
    expiresAt: s.expiresAt,
    isCurrent: s.id === currentSessionId,
  }));

  res.json(formatted);
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

  res.status(204).send();
});

export default router;
