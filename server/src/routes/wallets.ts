import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { recordAuditEvent } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const walletSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["INTERNAL", "EXTERNAL"]).optional(),
});

// ── List wallets ────────────────────────────────────────────────────────────
router.get("/", async (req: AuthedRequest, res) => {
  const wallets = await prisma.wallet.findMany({
    where: { userId: req.userId },
    include: {
      _count: {
        select: { vaultItems: { where: { deletedAt: null } } },
      },
    },
    orderBy: { createdAt: "asc" },
  });
  res.json(wallets);
});

// ── Create wallet ───────────────────────────────────────────────────────────
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = walletSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const wallet = await prisma.wallet.create({
    data: {
      userId: req.userId!,
      name: parsed.data.name,
      type: parsed.data.type || "INTERNAL",
      isDefault: false, // only the initial one is default
    },
  });

  await recordAuditEvent(req.userId!, "WALLET_CREATED", { walletId: wallet.id, name: wallet.name });
  res.status(201).json(wallet);
});

// ── Update wallet ───────────────────────────────────────────────────────────
router.put("/:id", async (req: AuthedRequest, res) => {
  const parsed = walletSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const existing = await prisma.wallet.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) return res.status(404).json({ error: "Wallet not found" });

  const wallet = await prisma.wallet.update({
    where: { id: existing.id },
    data: parsed.data,
  });

  await recordAuditEvent(req.userId!, "WALLET_UPDATED", { walletId: wallet.id });
  res.json(wallet);
});

// ── Delete wallet ───────────────────────────────────────────────────────────
router.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.wallet.findFirst({
    where: { id: req.params.id, userId: req.userId },
    include: {
      _count: { select: { vaultItems: true } },
    },
  });
  
  if (!existing) return res.status(404).json({ error: "Wallet not found" });
  if (existing.isDefault) return res.status(409).json({ error: "Cannot delete the default wallet" });
  if (existing._count.vaultItems > 0) return res.status(409).json({ error: "Cannot delete wallet containing items. Reassign them first." });

  await prisma.wallet.delete({ where: { id: existing.id } });
  
  await recordAuditEvent(req.userId!, "WALLET_DELETED", { walletId: existing.id });
  res.status(204).send();
});

export default router;
