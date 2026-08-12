import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const tagSchema = z.object({
  name: z.string().min(1).max(50),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

// ── List tags ────────────────────────────────────────────────────────────────
router.get("/", async (req: AuthedRequest, res) => {
  const tags = await prisma.tag.findMany({
    where: { userId: req.userId },
    orderBy: { name: "asc" },
  });
  res.json(tags);
});

// ── Create tag ───────────────────────────────────────────────────────────────
router.post("/", async (req: AuthedRequest, res) => {
  const parsed = tagSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });

  const tag = await prisma.tag.create({
    data: { ...parsed.data, userId: req.userId! },
  });
  res.status(201).json(tag);
});

// ── Update tag ───────────────────────────────────────────────────────────────
router.put("/:id", async (req: AuthedRequest, res) => {
  const parsed = tagSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const existing = await prisma.tag.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  const tag = await prisma.tag.update({ where: { id: existing.id }, data: parsed.data });
  res.json(tag);
});

// ── Delete tag (removes all ItemTag associations) ────────────────────────────
router.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.tag.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });

  await prisma.tag.delete({ where: { id: existing.id } });
  res.status(204).send();
});

// ── Attach tag to item ───────────────────────────────────────────────────────
router.post("/items/:itemId/tags/:tagId", async (req: AuthedRequest, res) => {
  // Verify both item and tag belong to this user.
  const item = await prisma.vaultItem.findFirst({ where: { id: req.params.itemId, userId: req.userId } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const tag = await prisma.tag.findFirst({ where: { id: req.params.tagId, userId: req.userId } });
  if (!tag) return res.status(404).json({ error: "Tag not found" });

  await prisma.itemTag.upsert({
    where: { itemId_tagId: { itemId: item.id, tagId: tag.id } },
    create: { itemId: item.id, tagId: tag.id },
    update: {},
  });
  res.status(201).json({ itemId: item.id, tagId: tag.id });
});

// ── Detach tag from item ─────────────────────────────────────────────────────
router.delete("/items/:itemId/tags/:tagId", async (req: AuthedRequest, res) => {
  const item = await prisma.vaultItem.findFirst({ where: { id: req.params.itemId, userId: req.userId } });
  if (!item) return res.status(404).json({ error: "Item not found" });

  await prisma.itemTag.deleteMany({
    where: { itemId: item.id, tagId: req.params.tagId },
  });
  res.status(204).send();
});

export default router;
