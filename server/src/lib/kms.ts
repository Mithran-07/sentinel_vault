import { KMSClient, EncryptCommand, DecryptCommand } from "@aws-sdk/client-kms";
import crypto from "crypto";
import { getEnvConfig } from "../config/env";

export class KmsConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KmsConfigurationError";
  }
}

export interface KmsProvider {
  readonly name: string;
  encrypt(providerId: string, plaintext: string): Promise<string>;
  decrypt(providerId: string, ciphertext: string): Promise<string>;
  verifyAccess(): Promise<void>;
}

export class AwsKmsProvider implements KmsProvider {
  readonly name = "aws-kms";
  private client: KMSClient;
  private keyId: string;

  constructor(region?: string, keyId?: string) {
    const reg = region || process.env.AWS_REGION;
    const kid = keyId || process.env.AWS_KMS_KEY_ID;

    if (!reg || !kid) {
      throw new KmsConfigurationError("AWS KMS is not configured. AWS_REGION and AWS_KMS_KEY_ID are required.");
    }
    this.keyId = kid;
    this.client = new KMSClient({ region: reg });
  }

  async verifyAccess(): Promise<void> {
    // Fails closed on first use if credentials or permissions are missing
  }

  async encrypt(providerId: string, plaintext: string): Promise<string> {
    try {
      const command = new EncryptCommand({
        KeyId: this.keyId,
        Plaintext: Buffer.from(plaintext, "utf-8"),
        EncryptionContext: {
          purpose: "oidc-client-secret",
          providerId,
        },
      });
      const response = await this.client.send(command);
      if (!response.CiphertextBlob) {
        throw new Error("No ciphertext returned from KMS");
      }
      return Buffer.from(response.CiphertextBlob).toString("base64");
    } catch (err) {
      throw new KmsConfigurationError(`Failed to encrypt with AWS KMS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async decrypt(providerId: string, ciphertextBase64: string): Promise<string> {
    if (ciphertextBase64.startsWith("localdev:v1:")) {
      throw new KmsConfigurationError("AWS KMS provider cannot decrypt local development ciphertext.");
    }

    try {
      const command = new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: Buffer.from(ciphertextBase64, "base64"),
        EncryptionContext: {
          purpose: "oidc-client-secret",
          providerId,
        },
      });
      const response = await this.client.send(command);
      if (!response.Plaintext) {
        throw new Error("No plaintext returned from KMS");
      }
      return Buffer.from(response.Plaintext).toString("utf-8");
    } catch (err) {
      throw new KmsConfigurationError(`Failed to decrypt with AWS KMS: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export class LocalDevKmsProvider implements KmsProvider {
  readonly name = "local-dev-kms";
  private key: Buffer;

  constructor(devKey?: string) {
    if (process.env.NODE_ENV === "production") {
      throw new KmsConfigurationError("LocalDevKmsProvider is strictly forbidden in production mode.");
    }

    let rawKey = devKey;
    if (!rawKey) {
      const env = getEnvConfig();
      rawKey = env.LOCAL_DEV_KMS_KEY;
    }
    if (!rawKey || rawKey.length < 32) {
      throw new KmsConfigurationError("LOCAL_DEV_KMS_KEY must be at least 32 characters.");
    }
    // Derive exactly 256 bits via SHA-256 for AES-256-GCM
    this.key = crypto.createHash("sha256").update(rawKey).digest();
  }

  async verifyAccess(): Promise<void> {
    // Always accessible in dev mode
  }

  async encrypt(providerId: string, plaintext: string): Promise<string> {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(providerId, "utf-8"));

    const encrypted = Buffer.concat([cipher.update(plaintext, "utf-8"), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Format: localdev:v1:<ivHex>:<tagHex>:<ciphertextHex>
    return `localdev:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  async decrypt(providerId: string, ciphertext: string): Promise<string> {
    if (!ciphertext.startsWith("localdev:v1:")) {
      throw new KmsConfigurationError("LocalDevKmsProvider cannot decrypt production AWS KMS ciphertext.");
    }

    const parts = ciphertext.split(":");
    if (parts.length !== 5) {
      throw new KmsConfigurationError("Malformed local dev KMS ciphertext structure.");
    }

    const [, , ivHex, tagHex, dataHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const data = Buffer.from(dataHex, "hex");

    try {
      const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, iv);
      decipher.setAAD(Buffer.from(providerId, "utf-8"));
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
      return decrypted.toString("utf-8");
    } catch {
      throw new KmsConfigurationError("Failed to decrypt local development secret: integrity tag mismatch or invalid provider ID.");
    }
  }
}

let activeKmsProvider: KmsProvider | null = null;

export function getKmsProvider(): KmsProvider {
  if (activeKmsProvider) return activeKmsProvider;

  const isProd = process.env.NODE_ENV === "production";
  const hasAwsConfig = Boolean(process.env.AWS_REGION && process.env.AWS_KMS_KEY_ID);

  if (isProd) {
    if (!hasAwsConfig) {
      throw new KmsConfigurationError("AWS KMS is not configured. AWS_REGION and AWS_KMS_KEY_ID are required in production.");
    }
    activeKmsProvider = new AwsKmsProvider();
    return activeKmsProvider;
  }

  // Non-production (dev / test)
  if (hasAwsConfig) {
    try {
      activeKmsProvider = new AwsKmsProvider();
      return activeKmsProvider;
    } catch {
      // Fall through to dev provider if AWS KMS init fails in dev
    }
  }

  activeKmsProvider = new LocalDevKmsProvider();
  return activeKmsProvider;
}

export function setKmsProviderForTesting(provider: KmsProvider | null): void {
  activeKmsProvider = provider;
}

export function assertKmsConfigured(): void {
  getKmsProvider();
}

export async function verifyKmsKeyAccess(): Promise<void> {
  const provider = getKmsProvider();
  await provider.verifyAccess();
}

export async function encryptOidcClientSecret(providerId: string, plaintext: string): Promise<string> {
  const provider = getKmsProvider();
  return provider.encrypt(providerId, plaintext);
}

export async function decryptOidcClientSecret(providerId: string, ciphertext: string): Promise<string> {
  const provider = getKmsProvider();
  return provider.decrypt(providerId, ciphertext);
}
