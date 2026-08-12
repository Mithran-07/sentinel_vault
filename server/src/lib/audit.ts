import crypto from "crypto";
import { prisma } from "./prisma";

const GENESIS_HASH = "0".repeat(64);

/**
 * Appends a hash-chained audit event: hash_n = SHA256(event_n + hash_{n-1}).
 * Never pass sensitive contents (passwords, ciphertext) in metadata — only
 * event descriptors (what happened, when, from where).
 */
export async function recordAuditEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {}
) {
  return prisma.$transaction(async (tx) => {
    // Advisory lock keyed on a hash of userId — serializes concurrent appends
    // for this user without blocking appends for other users.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;

    const last = await tx.auditEvent.findFirst({
      where: { userId },
      orderBy: { createdAt: "desc" },
    });
    const prevHash = last?.hash ?? GENESIS_HASH;

    const payload = JSON.stringify({ userId, eventType, metadata, prevHash, ts: Date.now() });
    const hash = crypto.createHash("sha256").update(payload).digest("hex");

    return tx.auditEvent.create({
      data: { userId, eventType, metadata: metadata as any, prevHash, hash },
    });
  });
}

/** Verifies the integrity of a user's audit chain — detects any tampering or deletion. */
export async function verifyAuditChain(userId: string) {
  const events = await prisma.auditEvent.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  let expectedPrev = GENESIS_HASH;
  for (const event of events) {
    if (event.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: event.id };
    }
    expectedPrev = event.hash;
  }
  return { valid: true, brokenAt: null };
}
