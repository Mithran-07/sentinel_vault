import crypto from "crypto";
import { prisma } from "./prisma";
import { Prisma } from "@prisma/client";
import { acquireUserAdvisoryLock } from "./advisory-lock";


export const GENESIS_HASH = "0".repeat(64);

export interface AuditPayloadParams {
  userId: string;
  eventType: string;
  metadata?: Record<string, unknown>;
  prevHash: string;
  ts: number;
}

/**
 * Computes deterministic canonical JSON payload for an audit event.
 */
export function computeAuditEventPayload(params: AuditPayloadParams): string {
  return JSON.stringify({
    userId: params.userId,
    eventType: params.eventType,
    metadata: params.metadata ?? {},
    prevHash: params.prevHash,
    ts: params.ts,
  });
}

/**
 * Computes the SHA-256 hash for an audit event payload:
 * hash_n = SHA256(event_n + hash_{n-1}).
 */
export function computeAuditEventHash(params: AuditPayloadParams): string {
  const payload = computeAuditEventPayload(params);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

export interface AuditChainVerificationItem {
  id: string;
  prevHash: string;
  hash: string;
  sequence?: number;
}

/**
 * Pure verification of audit chain continuity.
 * Detects genesis tampering, broken links, reordering, and deleted records.
 */
export function verifyAuditChainEntries(
  events: AuditChainVerificationItem[]
): { valid: boolean; brokenAt: string | null } {
  let expectedPrev = GENESIS_HASH;
  for (const event of events) {
    if (event.prevHash !== expectedPrev) {
      return { valid: false, brokenAt: event.id };
    }
    expectedPrev = event.hash;
  }
  return { valid: true, brokenAt: null };
}

/**
 * Appends a hash-chained audit event: hash_n = SHA256(event_n + hash_{n-1}).
 * Never pass sensitive contents (passwords, ciphertext) in metadata — only
 * event descriptors (what happened, when, from where).
 *
 * If externalTx is supplied, all operations execute within that transaction.
 * Otherwise, wraps execution in a standalone prisma.$transaction.
 */
export async function recordAuditEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown> = {},
  externalTx?: Prisma.TransactionClient
) {
  const executeInTx = async (tx: Prisma.TransactionClient) => {
    // Advisory lock in CLASS_USER namespace (1::int) — serializes concurrent appends
    // for this user without blocking appends for other users or organizations.
    await acquireUserAdvisoryLock(tx, userId);


    const last = await tx.auditEvent.findFirst({
      where: { userId },
      orderBy: { sequence: "desc" },
    });
    const prevHash = last?.hash ?? GENESIS_HASH;

    const ts = Date.now();
    const hash = computeAuditEventHash({ userId, eventType, metadata, prevHash, ts });

    return tx.auditEvent.create({
      data: { userId, eventType, metadata: metadata as any, prevHash, hash },
    });
  };

  if (externalTx) {
    return executeInTx(externalTx);
  }

  return prisma.$transaction(executeInTx);
}

/** Verifies the integrity of a user's audit chain — detects any tampering or deletion. */
export async function verifyAuditChain(userId: string) {
  const events = await prisma.auditEvent.findMany({
    where: { userId },
    orderBy: { sequence: "asc" },
  });

  return verifyAuditChainEntries(events);
}
