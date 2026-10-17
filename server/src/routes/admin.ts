import { Router, Response } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { requireAuth, requireGlobalAdmin, AuthedRequest } from "../middleware/auth";
import { recordAuditEvent } from "../lib/audit";

const router = Router();

// Server-side admin rate limiting (30 requests/minute, independent of organization policies)
const adminRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many admin requests. Please try again in 1 minute." },
  keyGenerator: (req: any) => req.userId || 'admin',
});

router.use(requireAuth);
router.use(requireGlobalAdmin);
router.use(adminRateLimiter);

// IP Masking Utility for Audit Logging
export function truncateIpForAudit(ip: string | undefined): string {
  if (!ip) return "unknown";
  const addr = ip.startsWith("::ffff:") ? ip.slice(7) : ip;
  if (addr.includes(".")) {
    const parts = addr.split(".");
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.${parts[2]}.xxx` : "ipv4.xxx";
  }
  if (addr.includes(":")) {
    const groups = addr.split(":");
    return groups.slice(0, 3).join(":") + "::/48";
  }
  return "unknown";
}

// Strict metadata whitelist for global audit sanitization
export const SAFE_METADATA_KEYS = new Set([
  "orgId", "targetUserId", "reason", "ip", "browser", "os", "attempts",
  "status", "name", "roleId", "email", "collectionId", "keyVersion", "policyType"
]);

export function sanitizeAuditEvent(event: any) {
  const sanitizedMetadata: Record<string, any> = {};
  if (event.metadata && typeof event.metadata === "object") {
    for (const [key, val] of Object.entries(event.metadata)) {
      if (SAFE_METADATA_KEYS.has(key)) {
        if (key === "ip") {
          sanitizedMetadata[key] = truncateIpForAudit(String(val));
        } else {
          sanitizedMetadata[key] = val;
        }
      }
    }
  }
  return {
    id: event.id,
    sequence: event.sequence,
    userId: event.userId,
    eventType: event.eventType,
    metadata: sanitizedMetadata,
    createdAt: event.createdAt
  };
}

// Validation schemas
const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const listAuditSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// 1. GET /api/admin/users — List all users (with org info)
router.get("/users", async (req: AuthedRequest, res: Response) => {
  const validation = listUsersSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid pagination parameters" });
  }
  const { page, limit } = validation.data;
  const skip = (page - 1) * limit;

  const [total, users] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      skip,
      take: limit,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        isSuperAdmin: true,
        isSuspended: true,
        deletedAt: true,
        failedLoginAttempts: true,
        lastLoginAt: true,
        lastLoginIp: true,
        createdAt: true,
        organizationMembers: {
          where: { status: "ACTIVE" },
          select: {
            org: {
              select: {
                id: true,
                name: true,
              }
            }
          }
        }
      }
    })
  ]);

  res.json({
    data: users.map(u => ({
      ...u,
      lastLoginIp: truncateIpForAudit(u.lastLoginIp ?? undefined),
    })),
    meta: { total, page, limit }
  });
});

// 2. POST /api/admin/users/:id/suspend — Suspend a user globally
router.post("/users/:id/suspend", async (req: AuthedRequest, res: Response) => {
  const targetId = req.params.id;

  // Rule 1: A super admin cannot suspend themselves
  if (req.userId === targetId) {
    return res.status(400).json({ error: "Self-suspension is blocked. You cannot suspend your own account." });
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { isSuperAdmin: true, isSuspended: true }
  });

  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }

  if (targetUser.isSuspended) {
    return res.status(400).json({ error: "User account is already suspended" });
  }

  // Rule 2: Prevent suspending the last active global administrator
  if (targetUser.isSuperAdmin) {
    const activeAdminsCount = await prisma.user.count({
      where: { isSuperAdmin: true, isSuspended: false }
    });
    if (activeAdminsCount <= 1) {
      return res.status(400).json({ error: "Operation denied. You cannot suspend the last active global administrator." });
    }
  }

  await prisma.$transaction(async (tx) => {
    // Suspend the user record
    await tx.user.update({
      where: { id: targetId },
      data: { isSuspended: true }
    });

    // Revoke all active sessions for this user (takes effect immediately on all auth gates)
    await tx.session.updateMany({
      where: { userId: targetId, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    // Revoke all refresh tokens for this user
    await tx.refreshToken.updateMany({
      where: { userId: targetId, revoked: false },
      data: { revoked: true }
    });
  });

  await recordAuditEvent(req.userId!, "USER_SUSPENDED", { targetUserId: targetId, ip: req.ip });

  res.json({ message: "User suspended successfully" });
});

// 3. POST /api/admin/users/:id/restore — Restore a suspended user
router.post("/users/:id/restore", async (req: AuthedRequest, res: Response) => {
  const targetId = req.params.id;

  const targetUser = await prisma.user.findUnique({
    where: { id: targetId },
    select: { isSuspended: true }
  });

  if (!targetUser) {
    return res.status(404).json({ error: "User not found" });
  }

  if (!targetUser.isSuspended) {
    return res.status(400).json({ error: "User account is not suspended" });
  }

  await prisma.user.update({
    where: { id: targetId },
    data: { isSuspended: false }
  });

  await recordAuditEvent(req.userId!, "USER_RESTORED", { targetUserId: targetId, ip: req.ip });

  res.json({ message: "User account restored successfully" });
});

// 4. GET /api/admin/audit — Global audit log (cross-tenant, sanitized)
router.get("/audit", async (req: AuthedRequest, res: Response) => {
  const validation = listAuditSchema.safeParse(req.query);
  if (!validation.success) {
    return res.status(400).json({ error: "Invalid pagination parameters" });
  }
  const { page, limit } = validation.data;
  const skip = (page - 1) * limit;

  const [total, events] = await Promise.all([
    prisma.auditEvent.count(),
    prisma.auditEvent.findMany({
      skip,
      take: limit,
      orderBy: { sequence: "desc" },
    })
  ]);

  res.json({
    data: events.map(sanitizeAuditEvent),
    meta: { total, page, limit }
  });
});

// 5. GET /api/admin/metrics — Global metrics (pure counts only)
router.get("/metrics", async (req: AuthedRequest, res: Response) => {
  const [
    totalUsers,
    activeUsers,
    suspendedUsers,
    totalOrganizations,
    totalVaultItems,
    activeSessions
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { isSuspended: false, deletedAt: null } }),
    prisma.user.count({ where: { isSuspended: true } }),
    prisma.organization.count(),
    prisma.vaultItem.count(),
    prisma.session.count({
      where: {
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    })
  ]);

  res.json({
    data: {
      totalUsers,
      activeUsers,
      suspendedUsers,
      totalOrganizations,
      totalVaultItems,
      activeSessions
    }
  });
});

export default router;