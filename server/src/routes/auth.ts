import { Router } from "express";
import argon2 from "argon2";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";
import { recordAuditEvent } from "../lib/audit";

const router = Router();

// NOTE: `authHash` here is NOT the master password. It is a value the client
// derives client-side from the Master Key (see docs/02-cryptographic-architecture.md,
// "Separate Authentication from Encryption"). The server hashes it again with
// Argon2id before storage so a DB leak alone never exposes anything usable
// to reconstruct the vault encryption key.

const registerSchema = z.object({
  email: z.string().email(),
  authHash: z.string().min(20),
  kdfSalt: z.string().min(16),
  kdfMemoryKb: z.number().int().positive().optional(),
  kdfIterations: z.number().int().positive().optional(),
  kdfParallelism: z.number().int().positive().optional(),
  encryptedVaultKeyCiphertext: z.string().min(1),
  encryptedVaultKeyIv: z.string().min(1),
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input", details: parsed.error.flatten() });
  }
  const data = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    return res.status(409).json({ error: "Account already exists" });
  }

  const serverAuthHash = await argon2.hash(data.authHash, { type: argon2.argon2id });

  const user = await prisma.user.create({
    data: {
      email: data.email,
      authHash: serverAuthHash,
      kdfSalt: data.kdfSalt,
      kdfMemoryKb: data.kdfMemoryKb ?? 65536,
      kdfIterations: data.kdfIterations ?? 3,
      kdfParallelism: data.kdfParallelism ?? 4,
      encryptedVaultKeyCiphertext: data.encryptedVaultKeyCiphertext,
      encryptedVaultKeyIv: data.encryptedVaultKeyIv,
    },
  });

  await recordAuditEvent(user.id, "ACCOUNT_CREATED", { email: user.email });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  res.status(201).json({ accessToken, refreshToken });
});

// Prelogin: client needs the KDF salt/params to derive the same Master Key
// before it can compute the authHash to send to /login. Mirrors Bitwarden's
// /accounts/prelogin endpoint. Returns generic defaults for unknown emails
// so this can't be used to enumerate accounts by response shape alone.
router.get("/kdf", async (req, res) => {
  const email = String(req.query.email || "");
  const user = email ? await prisma.user.findUnique({ where: { email } }) : null;

  if (!user) {
    // Deterministic-looking but non-existent params, so timing/shape doesn't leak existence.
    return res.json({ salt: generateFakeSalt(email), memoryKb: 65536, iterations: 3, parallelism: 4 });
  }
  res.json({
    salt: user.kdfSalt,
    memoryKb: user.kdfMemoryKb,
    iterations: user.kdfIterations,
    parallelism: user.kdfParallelism,
  });
});

function generateFakeSalt(seed: string): string {
  return crypto.createHash("sha256").update(seed).digest("hex").slice(0, 32);
}

const loginSchema = z.object({
  email: z.string().email(),
  authHash: z.string().min(20),
});

router.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid input" });
  }
  const { email, authHash } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Constant-shape response whether or not the user exists, to avoid user enumeration.
  const dummyHash = "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHQ$c29tZWhhc2g";
  const ok = await argon2.verify(user?.authHash ?? dummyHash, authHash).catch(() => false);

  if (!user || !ok) {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  await recordAuditEvent(user.id, "LOGIN_SUCCESS", { ip: req.ip });

  const accessToken = signAccessToken({ sub: user.id, email: user.email });
  const refreshToken = signRefreshToken(user.id);
  await storeRefreshToken(user.id, refreshToken);

  res.json({
    accessToken,
    refreshToken,
    kdf: {
      salt: user.kdfSalt,
      memoryKb: user.kdfMemoryKb,
      iterations: user.kdfIterations,
      parallelism: user.kdfParallelism,
    },
    encryptedVaultKey: {
      ciphertext: user.encryptedVaultKeyCiphertext,
      iv: user.encryptedVaultKeyIv,
    },
  });
});

router.post("/refresh", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (!refreshToken) return res.status(400).json({ error: "Missing refresh token" });

  try {
    const { sub } = verifyRefreshToken(refreshToken);
    const tokenHash = hashToken(refreshToken);
    const stored = await prisma.refreshToken.findFirst({
      where: { userId: sub, tokenHash, revoked: false, expiresAt: { gt: new Date() } },
    });
    if (!stored) return res.status(401).json({ error: "Refresh token revoked or expired" });

    const user = await prisma.user.findUniqueOrThrow({ where: { id: sub } });
    const accessToken = signAccessToken({ sub: user.id, email: user.email });
    res.json({ accessToken });
  } catch {
    return res.status(401).json({ error: "Invalid refresh token" });
  }
});

router.post("/logout", async (req, res) => {
  const { refreshToken } = req.body ?? {};
  if (refreshToken) {
    const tokenHash = hashToken(refreshToken);
    await prisma.refreshToken.updateMany({
      where: { tokenHash },
      data: { revoked: true },
    });
  }
  res.status(204).send();
});

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function storeRefreshToken(userId: string, refreshToken: string) {
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

export default router;
