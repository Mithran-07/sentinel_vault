import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";

const router = Router();
router.use(requireAuth);

const folderSchema = z.object({
  nameCiphertext: z.string().min(1),
  nameIv: z.string().min(1),
});

router.get("/", async (req: AuthedRequest, res) => {
  const folders = await prisma.folder.findMany({ where: { userId: req.userId } });
  res.json(folders);
});

router.post("/", async (req: AuthedRequest, res) => {
  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid input" });

  const folder = await prisma.folder.create({ data: { ...parsed.data, userId: req.userId! } });
  res.status(201).json(folder);
});

router.delete("/:id", async (req: AuthedRequest, res) => {
  const existing = await prisma.folder.findFirst({ where: { id: req.params.id, userId: req.userId } });
  if (!existing) return res.status(404).json({ error: "Not found" });
  await prisma.folder.delete({ where: { id: existing.id } });
  res.status(204).send();
});

export default router;
