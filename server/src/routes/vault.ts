import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { recordAuditEvent } from "../lib/audit";

const router = Router();
router.use(requireAuth);

const itemSchema = z.object({
  type: z.enum(["LOGIN"]),
  ciphertext: z.string().min(1),
  iv: z.string().min(1),
  folderId: z.string().uuid().nullable().optional(),
  favorite: z.boolean().optional(),
  passwordChangedAt: z.string().datetime().optional(),
});

// List all items for the authenticated user. Client decrypts locally.
router.get("/items", async (req: AuthedRequest, res) => {
  const items = await prisma.vaultItem.findMany({
    where: { userId: req.userId },
    orderBy: { updatedAt: "desc" },
  });
  res.json(items);
});

router.post("/items", async (req: AuthedRequest, res) => {
  const parsed = itemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const item = await prisma.vaultItem.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_CREATED", { itemId: item.id, type: item.type });
  res.status(201).json(item);
});

router.put("/items/:id", async (req: AuthedRequest, res) => {
  const parsed = itemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const existing = await prisma.vaultItem.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const item = await prisma.vaultItem.update({
    where: { id: existing.id },
    data: parsed.data,
  });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_UPDATED", { itemId: item.id });
  res.json(item);
});

router.delete("/items/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.vaultItem.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.vaultItem.delete({ where: { id: existing.id } });
  await recordAuditEvent(req.userId!, "VAULT_ITEM_DELETED", { itemId: existing.id });
  res.status(204).send();
});

export default router;
