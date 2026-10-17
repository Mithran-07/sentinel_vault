import { generateSecret, generateURI, verifySync } from "otplib";
import qrcode from "qrcode";
import crypto from "crypto";

import { getEnvConfig } from "../config/env";

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
    const { MFA_ENCRYPTION_SECRET } = getEnvConfig();
    return crypto.createHash("sha256").update(MFA_ENCRYPTION_SECRET).digest(); // 256-bit key
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

import { getChallengeStore } from "./challenge-store";

/**
 * Atomically consumes an MFA challenge JTI to prevent replay attacks.
 * Returns true if the token was successfully claimed for the first time.
 * Returns false if already redeemed or expired.
 */
export async function consumeMfaChallengeJti(jti: string, ttlSeconds: number): Promise<boolean> {
  const store = getChallengeStore();
  return store.consumeJti(jti, ttlSeconds);
}

export function isMfaChallengeJtiUsed(_jti: string): boolean {
  return false;
}

export function markMfaChallengeJtiUsed(_jti: string): void {
  // Deprecated no-op
}
