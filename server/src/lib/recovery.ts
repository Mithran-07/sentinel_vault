import crypto from "crypto";
import argon2 from "argon2";

// Crockford Base32 / Unambiguous Alphanumeric Alphabet (32 characters)
// Omits 0, O, 1, I to prevent transcription errors
const BASE32_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

/**
 * Generates a single recovery code:
 * - 128 random bits (16 CSPRNG bytes)
 * - Encoded into 26 Crockford Base32 characters
 * - Formatted as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X (5 blocks of 5 + 1 trailing char)
 */
export function generateSingleRecoveryCode(): string {
  const bytes = crypto.randomBytes(16); // 128 CSPRNG random bits
  let binaryStr = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryStr += bytes[i].toString(2).padStart(8, "0");
  }

  let codeStr = "";
  // 128 bits = 25 groups of 5 bits + 3 leftover bits (26 characters total)
  for (let i = 0; i < 26; i++) {
    const chunk = binaryStr.slice(i * 5, (i + 1) * 5).padEnd(5, "0");
    const val = parseInt(chunk, 2);
    codeStr += BASE32_ALPHABET[val % 32];
  }

  // Format as XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-X
  return `${codeStr.slice(0, 5)}-${codeStr.slice(5, 10)}-${codeStr.slice(10, 15)}-${codeStr.slice(15, 20)}-${codeStr.slice(20, 25)}-${codeStr.slice(25)}`;
}

/**
 * Normalizes user input recovery code (removes dashes, spaces, converts to uppercase)
 */
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

/**
 * Generates a batch of 10 recovery codes
 */
export function generateRecoveryCodeBatch(count = 10): string[] {
  const set = new Set<string>();
  while (set.size < count) {
    set.add(generateSingleRecoveryCode());
  }
  return Array.from(set);
}

/**
 * Hashes a recovery code using Argon2id
 * Parameters: memoryCost = 64MB (65536 KB), timeCost = 3, parallelism = 4
 */
export async function hashRecoveryCode(code: string): Promise<string> {
  const normalized = normalizeRecoveryCode(code);
  return argon2.hash(normalized, {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  });
}

/**
 * Verifies a submitted recovery code against an Argon2id hash
 */
export async function verifyRecoveryCodeHash(code: string, hash: string): Promise<boolean> {
  const normalized = normalizeRecoveryCode(code);
  try {
    return await argon2.verify(hash, normalized);
  } catch {
    return false;
  }
}
