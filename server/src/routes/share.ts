import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { recordAuditEvent } from "../lib/audit";
import rateLimit from "express-rate-limit";
import { logger } from "../lib/logger";

const router = Router();

// Rate limiter for public endpoint to prevent brute-forcing share IDs
const publicShareLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: { error: "Too many requests from this IP, please try again after 15 minutes" }
});

const shareSchema = z.object({
  vaultItemId: z.string().uuid(),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  expiresInMinutes: z.union([z.literal(5), z.literal(10)])
});

// CREATE SHARE (Authenticated)
router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = shareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid request body" });
    }

    const { vaultItemId, ciphertext, iv, expiresInMinutes } = parsed.data;

    // Verify ownership
    const item = await prisma.vaultItem.findFirst({
      where: { id: vaultItemId, userId: req.userId }
    });

    if (!item) {
      return res.status(404).json({ error: "Vault item not found" });
    }

    const expiresAt = new Date(Date.now() + expiresInMinutes * 60 * 1000);

    const share = await prisma.sharedCredential.create({
      data: {
        vaultItemId,
        creatorId: req.userId!,
        ciphertext,
        iv,
        expiresAt
      }
    });

    await recordAuditEvent(req.userId!, "CREDENTIAL_SHARED", {
      shareId: share.id,
      vaultItemId,
      expiresInMinutes,
      ip: req.ip
    });

    return res.status(201).json({ id: share.id, expiresAt: share.expiresAt });
  } catch (error) {
    logger.error("Failed to create share:", error);
    return res.status(500).json({ error: "Failed to create share" });
  }
});

// GET SHARE (Public)
router.get("/:id", publicShareLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Zod validation on ID to prevent weird inputs
    const idSchema = z.string().uuid();
    if (!idSchema.safeParse(id).success) {
      return res.status(404).json({ error: "Share not found or expired" });
    }

    const share = await prisma.sharedCredential.findUnique({
      where: { id }
    });

    if (!share) {
      return res.status(404).json({ error: "Share not found or expired" });
    }

    if (share.revokedAt !== null) {
      return res.status(410).json({ error: "Share revoked" });
    }

    if (share.expiresAt.getTime() <= Date.now()) {
      return res.status(410).json({ error: "Share expired" });
    }

    await recordAuditEvent(share.creatorId, "SHARED_CREDENTIAL_ACCESSED", {
      shareId: share.id,
      ip: req.ip
    });

    return res.json({
      ciphertext: share.ciphertext,
      iv: share.iv,
      createdAt: share.createdAt,
      expiresAt: share.expiresAt
    });
  } catch (error) {
    logger.error("Failed to retrieve share:", error);
    return res.status(500).json({ error: "Failed to retrieve share" });
  }
});

// REVOKE SHARE (Authenticated)
router.delete("/:id", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const { id } = req.params;

    const share = await prisma.sharedCredential.findFirst({
      where: { id, creatorId: req.userId }
    });

    if (!share) {
      return res.status(404).json({ error: "Share not found" });
    }

    if (share.revokedAt !== null) {
      return res.status(400).json({ error: "Share already revoked" });
    }

    await prisma.sharedCredential.update({
      where: { id },
      data: { revokedAt: new Date() }
    });

    await recordAuditEvent(req.userId!, "SHARED_CREDENTIAL_REVOKED", {
      shareId: share.id,
      ip: req.ip
    });

    return res.json({ success: true });
  } catch (error) {
    logger.error("Failed to revoke share:", error);
    return res.status(500).json({ error: "Failed to revoke share" });
  }
});

export const shareRouter = router;
