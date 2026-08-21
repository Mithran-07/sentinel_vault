import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { recordAuditEvent } from "../lib/audit";

const router = Router();
router.use(requireAuth);

// All 6 Phase 2 vault item types. Type is stored unencrypted for server-side
// filtering. All secret content lives inside the ciphertext blob.
const VAULT_ITEM_TYPES = ["LOGIN", "SECURE_NOTE", "CARD", "IDENTITY", "SSH_KEY", "API_CREDENTIAL"] as const;

const itemSchema = z.object({
  type: z.enum(VAULT_ITEM_TYPES),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  walletId: z.string().uuid().optional(),
  folderId: z.string().uuid().nullable().optional(),
  favorite: z.boolean().optional(),
  passwordChangedAt: z.string().datetime().optional(),
});

// ── List items ──────────────────────────────────────────────────────────────
// Supports:
//   ?since=ISO   — sync: return only items updated after this timestamp
//   ?deleted=true — return trashed items instead of active items
//   ?walletId=UUID — filter by specific wallet
// Client decrypts all ciphertext locally — server never reads item contents.
router.get("/items", async (req: AuthedRequest, res) => {
  const since = req.query.since ? new Date(req.query.since as string) : undefined;
  const deleted = req.query.deleted === "true";
  const walletId = req.query.walletId as string | undefined;

  const where: Record<string, unknown> = { userId: req.userId };

  if (walletId) {
    const wallet = await prisma.wallet.findFirst({ where: { id: walletId, userId: req.userId } });
    if (!wallet) return res.status(403).json({ error: "Access denied to requested wallet" });
    where.walletId = walletId;
  }

  if (deleted) {
    where.deletedAt = { not: null };
  } else {
    where.deletedAt = null;
  }

  if (since) {
    where.updatedAt = { gt: since };
  }

  const items = await prisma.vaultItem.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    include: {
      tags: { include: { tag: true } },
      attachments: { select: { id: true, filenameCiphertext: true, filenameIv: true, ciphertextSizeBytes: true, createdAt: true } },
    },
  });
  res.json(items);
});

// ── Create item ─────────────────────────────────────────────────────────────
router.post("/items", async (req: AuthedRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  let targetWalletId = parsed.data.walletId;
  if (targetWalletId) {
    const wallet = await prisma.wallet.findFirst({ where: { id: targetWalletId, userId: req.userId } });
    if (!wallet) return res.status(403).json({ error: "Access denied to target wallet" });
  } else {
    const defaultWallet = await prisma.wallet.findFirst({
      where: { userId: req.userId, isDefault: true }
    });
    if (!defaultWallet) return res.status(500).json({ error: "No default wallet found" });
    targetWalletId = defaultWallet.id;
  }

  const item = await prisma.vaultItem.create({
    data: { ...parsed.data, userId: req.userId!, walletId: targetWalletId },
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_CREATED", { itemId: item.id, type: item.type, walletId: targetWalletId });
  res.status(201).json(item);
});

// ── Update item (auto-snapshots previous version) ───────────────────────────
router.put("/items/:id", async (req: AuthedRequest, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: null },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  if (parsed.data.walletId && parsed.data.walletId !== existing.walletId) {
    const targetWallet = await prisma.wallet.findFirst({ where: { id: parsed.data.walletId, userId: req.userId } });
    if (!targetWallet) return res.status(403).json({ error: "Access denied to target wallet" });
  }

  // Snapshot the current version before overwriting.
  await prisma.vaultItemVersion.create({
    data: {
      itemId: existing.id,
      ciphertext: existing.ciphertext,
      iv: existing.iv,
    },
  });

  const item = await prisma.vaultItem.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_UPDATED", { itemId: item.id, walletId: item.walletId });
  res.json(item);
});

// ── Soft delete (move to trash) ─────────────────────────────────────────────
router.delete("/items/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: null },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.vaultItem.update({
    where: { id: existing.id },
    data: { deletedAt: new Date() },
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_TRASHED", { itemId: existing.id });
  res.status(204).send();
});

// ── Restore from trash ──────────────────────────────────────────────────────
router.post("/items/:id/restore", async (req: AuthedRequest, res) => {
  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } },
  });
  if (!existing) return res.status(404).json({ error: "Not found in trash" });

  const item = await prisma.vaultItem.update({
    where: { id: existing.id },
    data: { deletedAt: null },
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_RESTORED", { itemId: item.id });
  res.json(item);
});

// ── Permanent delete (only works for trashed items) ─────────────────────────
router.delete("/items/:id/permanent", async (req: AuthedRequest, res) => {
  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: { not: null } },
  });
  if (!existing) return res.status(404).json({ error: "Not found in trash — soft-delete first" });

  await prisma.vaultItem.delete({ where: { id: existing.id } });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_PERMANENTLY_DELETED", { itemId: existing.id });
  res.status(204).send();
});

// ── Version history ─────────────────────────────────────────────────────────
router.get("/items/:id/versions", async (req: AuthedRequest, res) => {
  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.userId },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const versions = await prisma.vaultItemVersion.findMany({
    where: { itemId: existing.id },
    orderBy: { createdAt: "desc" },
  });
  res.json(versions);
});

// ── Restore a prior version ─────────────────────────────────────────────────
router.post("/items/:id/versions/:versionId/restore", async (req: AuthedRequest, res) => {
  const existing = await prisma.vaultItem.findFirst({
    where: { id: req.params.id, userId: req.userId, deletedAt: null },
  });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const version = await prisma.vaultItemVersion.findFirst({
    where: { id: req.params.versionId, itemId: existing.id },
  });
  if (!version) return res.status(404).json({ error: "Version not found" });

  // Snapshot current state before restoring.
  await prisma.vaultItemVersion.create({
    data: { itemId: existing.id, ciphertext: existing.ciphertext, iv: existing.iv },
  });

  const item = await prisma.vaultItem.update({
    where: { id: existing.id },
    data: { ciphertext: version.ciphertext, iv: version.iv },
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_VERSION_RESTORED", { itemId: item.id, versionId: version.id });
  res.json(item);
});

export default router;
