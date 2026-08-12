import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import crypto from "crypto";

export interface EncryptedSecretPayload {
  ciphertext: string;
  iv: string;
  tag: string;
}

export interface SecretProtectionProvider {
  encryptSecret(plaintext: string): Promise<EncryptedSecretPayload>;
  decryptSecret(payload: EncryptedSecretPayload): Promise<string>;
}

/**
 * DevSecretProtectionProvider
 * Development implementation using AES-256-GCM with fresh 12-byte CSPRNG IV per encryption.
 * Production architecture requires a KMS/HSM-backed provider (e.g. AWS KMS / GCP KMS / HashiCorp Vault).
 */
export class DevSecretProtectionProvider implements SecretProtectionProvider {
  private getKey(): Buffer {
    const rawSecret = process.env.MFA_ENCRYPTION_SECRET || "development_mfa_secret_key_32bytes_len!!";
    return crypto.createHash("sha256").update(rawSecret).digest(); // 256-bit key
  }

  async encryptSecret(plaintext: string): Promise<EncryptedSecretPayload> {
    const iv = crypto.randomBytes(12); // Fresh 12-byte IV per encryption
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getKey(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString("base64"),
      iv: iv.toString("base64"),
      tag: tag.toString("base64"),
    };
  }

  async decryptSecret(payload: EncryptedSecretPayload): Promise<string> {
    try {
      const iv = Buffer.from(payload.iv, "base64");
      const tag = Buffer.from(payload.tag, "base64");
      const encrypted = Buffer.from(payload.ciphertext, "base64");

      const decipher = crypto.createDecipheriv("aes-256-gcm", this.getKey(), iv);
      decipher.setAuthTag(tag);
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      return decrypted.toString("utf8");
    } catch {
      // Fail closed on tampering or key mismatch
      throw new Error("TOTP secret decryption failed: payload authentication check failed");
    }
  }
}

export const secretProtection: SecretProtectionProvider = new DevSecretProtectionProvider();

export async function generateTotpSetup(email: string) {
  const secret = generateSecret();
  const issuer = "ZeroKnowledgeVault";
  const otpauthUrl = generateURI({ secret, issuer, label: email });
  const qrCodeDataUrl = await qrcode.toDataURL(otpauthUrl);

  return {
    secret,
    otpauthUrl,
    qrCodeDataUrl,
  };
}

export function verifyTotpCode(secret: string, code: string): boolean {
  try {
    const res = verifySync({ token: code.trim(), secret });
    return res && res.valid === true;
  } catch {
    return false;
  }
}

// Single-use set for MFA challenge JTI tracking (in-memory replay prevention)
const usedMfaChallengeJtis = new Set<string>();

export function isMfaChallengeJtiUsed(jti: string): boolean {
  return usedMfaChallengeJtis.has(jti);
}

export function markMfaChallengeJtiUsed(jti: string) {
  usedMfaChallengeJtis.add(jti);
  // Auto-cleanup after 10 minutes
  setTimeout(() => usedMfaChallengeJtis.delete(jti), 10 * 60 * 1000);
}
