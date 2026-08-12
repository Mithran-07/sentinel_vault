/**
 * Encrypted attachment upload/download.
 *
 * Zero-knowledge guarantee:
 *   - File bytes are encrypted client-side (AES-256-GCM) BEFORE upload.
 *   - The server receives, stores, and returns only opaque ciphertext.
 *   - Filename and MIME type are also encrypted client-side — the server
 *     stores only encrypted blobs for those fields.
 *   - storageKey is a random UUID — no semantic information is visible.
 *   - The server never calls decrypt on any attachment data.
 */

import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { storage } from "../lib/storage";
import { recordAuditEvent } from "../lib/audit";

const router = Router({ mergeParams: true });
router.use(requireAuth);

// 10 MB max per attachment (encrypted bytes, not plaintext).
const MAX_BYTES = 10 * 1024 * 1024;

// Multer stores the encrypted file bytes in memory before we pass to storage adapter.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
});

const attachmentMetaSchema = z.object({
  iv: z.string().min(1),
  filenameCiphertext: z.string().min(1),
  filenameIv: z.string().min(1),
});

// ── List attachments for an item ─────────────────────────────────────────────
router.get("/", async (req: AuthedRequest, res) => {
  const item = await prisma.vaultItem.findFirst({
    where: { id: req.params.itemId, userId: req.userId },
  });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const attachments = await prisma.attachment.findMany({
    where: { itemId: item.id },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      ciphertextSizeBytes: true,
      filenameCiphertext: true,
      filenameIv: true,
      createdAt: true,
      // storageKey is intentionally excluded — internal use only
    },
  });
  res.json(attachments);
});

// ── Upload encrypted attachment ───────────────────────────────────────────────
// Client must:
//   1. Encrypt file bytes with AES-256-GCM using the Vault Key → send as binary field `encryptedFile`
//   2. Send iv, filenameCiphertext, filenameIv as form fields
router.post("/", upload.single("encryptedFile"), async (req: AuthedRequest, res) => {
  const item = await prisma.vaultItem.findFirst({
    where: { id: req.params.itemId, userId: req.userId, deletedAt: null },
  });
  if (!item) return res.status(404).json({ error: "Item not found" });

  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const parsed = attachmentMetaSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Invalid metadata", details: parsed.error.flatten() });

  const storageKey = randomUUID();

  // Write opaque encrypted bytes to storage.
  await storage.put(storageKey, req.file.buffer);

  const attachment = await prisma.attachment.create({
    data: {
      itemId: item.id,
      storageKey,
      ciphertextSizeBytes: req.file.size,
      iv: parsed.data.iv,
      filenameCiphertext: parsed.data.filenameCiphertext,
      filenameIv: parsed.data.filenameIv,
    },
  });

  await recordAuditEvent(req.userId!, "ATTACHMENT_UPLOADED", { itemId: item.id, attachmentId: attachment.id });

  res.status(201).json({
    id: attachment.id,
    ciphertextSizeBytes: attachment.ciphertextSizeBytes,
    filenameCiphertext: attachment.filenameCiphertext,
    filenameIv: attachment.filenameIv,
    createdAt: attachment.createdAt,
  });
});

// ── Download encrypted attachment bytes ──────────────────────────────────────
// Client receives opaque ciphertext and decrypts locally using the Vault Key.
router.get("/:attachmentId", async (req: AuthedRequest, res) => {
  const item = await prisma.vaultItem.findFirst({
    where: { id: req.params.itemId, userId: req.userId },
  });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, itemId: item.id },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  const encryptedBytes = await storage.get(attachment.storageKey);

  // Return raw encrypted bytes. Content-Type is generic — actual type is encrypted.
  res.set("Content-Type", "application/octet-stream");
  res.set("Content-Length", encryptedBytes.length.toString());
  res.set("X-Attachment-IV", attachment.iv);
  res.set("X-Filename-Ciphertext", attachment.filenameCiphertext);
  res.set("X-Filename-IV", attachment.filenameIv);
  res.send(encryptedBytes);
});

// ── Delete attachment ────────────────────────────────────────────────────────
router.delete("/:attachmentId", async (req: AuthedRequest, res) => {
  const item = await prisma.vaultItem.findFirst({
    where: { id: req.params.itemId, userId: req.userId },
  });
  if (!item) return res.status(404).json({ error: "Item not found" });

  const attachment = await prisma.attachment.findFirst({
    where: { id: req.params.attachmentId, itemId: item.id },
  });
  if (!attachment) return res.status(404).json({ error: "Attachment not found" });

  await storage.delete(attachment.storageKey);
  await prisma.attachment.delete({ where: { id: attachment.id } });
  await recordAuditEvent(req.userId!, "ATTACHMENT_DELETED", { itemId: item.id, attachmentId: attachment.id });

  res.status(204).send();
});

export default router;
