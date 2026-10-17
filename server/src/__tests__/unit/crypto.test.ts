import crypto from "crypto";
import argon2 from "argon2";
import {
  DevSecretProtectionProvider,
  EncryptedSecretPayload,
} from "../../lib/mfa";
import {
  LocalDevKmsProvider,
  KmsConfigurationError,
} from "../../lib/kms";
import {
  generateSingleRecoveryCode,
  normalizeRecoveryCode,
  generateRecoveryCodeBatch,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
} from "../../lib/recovery";
import { resetEnvConfigForTesting } from "../../config/env";

describe("Batch D: Cryptographic Primitives & Pure Unit Tests", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: "development",
      DATABASE_URL: "postgresql://vault:vault@127.0.0.1:5432/vault?schema=public",
      JWT_ACCESS_SECRET: "access_secret_32_characters_long_for_test",
      JWT_REFRESH_SECRET: "refresh_secret_32_characters_long_for_test",
      MFA_ENCRYPTION_SECRET: "mfa_secret_32_characters_long_for_test!",
      LOCAL_DEV_KMS_KEY: "dev_kms_key_for_local_testing_only_32bytes!",
    };
    resetEnvConfigForTesting();
  });

  afterAll(() => {
    process.env = originalEnv;
    resetEnvConfigForTesting();
  });

  // ── 1. AES-256-GCM Encryption / Decryption Round Trips ─────────────────────

  describe("1. AES-256-GCM Round Trips", () => {
    it("DevSecretProtectionProvider successfully encrypts and decrypts secrets", async () => {
      const provider = new DevSecretProtectionProvider();
      const testSecrets = [
        "JBSWY3DPEHPK3PXP",
        "", // empty string
        "UTF-8 test: 🔐 ゼロ知識 暗号化 vault secret 123!@#",
        "A".repeat(4096), // large secret payload
      ];

      for (const secret of testSecrets) {
        const encrypted = await provider.encryptSecret(secret);
        expect(encrypted.ciphertext).toBeDefined();
        expect(encrypted.iv).toBeDefined();
        expect(encrypted.tag).toBeDefined();

        const decrypted = await provider.decryptSecret(encrypted);
        expect(decrypted).toBe(secret);
      }
    });

    it("LocalDevKmsProvider successfully encrypts and decrypts with AAD binding", async () => {
      const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
      const plaintext = "super_confidential_oidc_secret_abc123";
      const providerId = "provider-github-sso";

      const ciphertext = await provider.encrypt(providerId, plaintext);
      expect(ciphertext.startsWith("localdev:v1:")).toBe(true);

      const decrypted = await provider.decrypt(providerId, ciphertext);
      expect(decrypted).toBe(plaintext);
    });
  });

  // ── 2. CSPRNG Randomness & Fresh IV Verification ──────────────────────────

  describe("2. CSPRNG Randomness & IV Generation", () => {
    it("generates a fresh 12-byte (96-bit) IV for each encryption operation", async () => {
      const provider = new DevSecretProtectionProvider();
      const secret = "IDENTICAL_SECRET_PAYLOAD";

      const enc1 = await provider.encryptSecret(secret);
      const enc2 = await provider.encryptSecret(secret);
      const enc3 = await provider.encryptSecret(secret);

      // IVs must be 12 bytes (16 chars in base64)
      const iv1Bytes = Buffer.from(enc1.iv, "base64");
      const iv2Bytes = Buffer.from(enc2.iv, "base64");
      const iv3Bytes = Buffer.from(enc3.iv, "base64");

      expect(iv1Bytes.length).toBe(12);
      expect(iv2Bytes.length).toBe(12);
      expect(iv3Bytes.length).toBe(12);

      // Fresh IV ensures non-identical ciphertexts for identical plaintexts
      expect(enc1.iv).not.toBe(enc2.iv);
      expect(enc2.iv).not.toBe(enc3.iv);
      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(enc2.ciphertext).not.toBe(enc3.ciphertext);
    });

    it("verifies production encryption invokes cryptographically secure random source", async () => {
      const randomBytesSpy = jest.spyOn(crypto, "randomBytes");
      const provider = new DevSecretProtectionProvider();

      await provider.encryptSecret("test-secret");
      expect(randomBytesSpy).toHaveBeenCalledWith(12);

      randomBytesSpy.mockRestore();
    });
  });

  // ── 3. Tampered Ciphertext, Auth Tags, and IVs ──────────────────────────────

  describe("3. Tamper Resistance (Ciphertext, Auth Tag, IV)", () => {
    it("DevSecretProtectionProvider rejects tampered ciphertext byte", async () => {
      const provider = new DevSecretProtectionProvider();
      const encrypted = await provider.encryptSecret("sensitive_mfa_totp_seed");

      // Corrupt a byte in the raw ciphertext buffer
      const cipherBuf = Buffer.from(encrypted.ciphertext, "base64");
      cipherBuf[0] ^= 0x01; // flip single bit
      const tampered: EncryptedSecretPayload = {
        ...encrypted,
        ciphertext: cipherBuf.toString("base64"),
      };

      await expect(provider.decryptSecret(tampered)).rejects.toThrow(
        "TOTP secret decryption failed: payload authentication check failed"
      );
    });

    it("DevSecretProtectionProvider rejects tampered authentication tag", async () => {
      const provider = new DevSecretProtectionProvider();
      const encrypted = await provider.encryptSecret("sensitive_mfa_totp_seed");

      const tagBuf = Buffer.from(encrypted.tag, "base64");
      tagBuf[tagBuf.length - 1] ^= 0xff;
      const tampered: EncryptedSecretPayload = {
        ...encrypted,
        tag: tagBuf.toString("base64"),
      };

      await expect(provider.decryptSecret(tampered)).rejects.toThrow(
        "TOTP secret decryption failed: payload authentication check failed"
      );
    });

    it("DevSecretProtectionProvider rejects tampered IV", async () => {
      const provider = new DevSecretProtectionProvider();
      const encrypted = await provider.encryptSecret("sensitive_mfa_totp_seed");

      const ivBuf = Buffer.from(encrypted.iv, "base64");
      ivBuf[0] ^= 0x42;
      const tampered: EncryptedSecretPayload = {
        ...encrypted,
        iv: ivBuf.toString("base64"),
      };

      await expect(provider.decryptSecret(tampered)).rejects.toThrow(
        "TOTP secret decryption failed: payload authentication check failed"
      );
    });

    it("LocalDevKmsProvider rejects tampered ciphertext, auth tag, and IV", async () => {
      const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
      const raw = await provider.encrypt("test-provider", "secret_value");

      const parts = raw.split(":");
      expect(parts.length).toBe(5);
      const [, , ivHex, tagHex, dataHex] = parts;

      // Tampered data
      const badData = dataHex.slice(0, -2) + (dataHex.slice(-2) === "00" ? "ff" : "00");
      await expect(
        provider.decrypt("test-provider", `localdev:v1:${ivHex}:${tagHex}:${badData}`)
      ).rejects.toThrow(KmsConfigurationError);

      // Tampered tag
      const badTag = tagHex.slice(0, -2) + (tagHex.slice(-2) === "00" ? "ff" : "00");
      await expect(
        provider.decrypt("test-provider", `localdev:v1:${ivHex}:${badTag}:${dataHex}`)
      ).rejects.toThrow(KmsConfigurationError);

      // Tampered IV
      const badIv = ivHex.slice(0, -2) + (ivHex.slice(-2) === "00" ? "ff" : "00");
      await expect(
        provider.decrypt("test-provider", `localdev:v1:${badIv}:${tagHex}:${dataHex}`)
      ).rejects.toThrow(KmsConfigurationError);
    });

    it("LocalDevKmsProvider rejects AAD mismatch (tampered provider binding)", async () => {
      const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");
      const ciphertext = await provider.encrypt("legit-provider-id", "top_secret_data");

      await expect(provider.decrypt("attacker-provider-id", ciphertext)).rejects.toThrow(
        /integrity tag mismatch or invalid provider ID/i
      );
    });
  });

  // ── 4. Truncated or Malformed Ciphertext ───────────────────────────────────

  describe("4. Truncated or Malformed Ciphertext", () => {
    it("DevSecretProtectionProvider rejects truncated and empty payloads", async () => {
      const provider = new DevSecretProtectionProvider();

      // Empty payload strings
      await expect(
        provider.decryptSecret({ ciphertext: "", iv: "", tag: "" })
      ).rejects.toThrow("TOTP secret decryption failed: payload authentication check failed");

      // Valid IV/tag but truncated ciphertext
      const valid = await provider.encryptSecret("hello");
      const truncated: EncryptedSecretPayload = {
        ...valid,
        ciphertext: valid.ciphertext.slice(0, 2),
      };
      await expect(provider.decryptSecret(truncated)).rejects.toThrow(
        "TOTP secret decryption failed: payload authentication check failed"
      );
    });

    it("LocalDevKmsProvider rejects malformed and truncated ciphertext formats", async () => {
      const provider = new LocalDevKmsProvider("dev_kms_key_for_local_testing_only_32bytes!");

      // Corrupt format strings
      await expect(provider.decrypt("provider-1", "not_a_valid_ciphertext")).rejects.toThrow(
        KmsConfigurationError
      );
      await expect(provider.decrypt("provider-1", "localdev:v1:only:three:parts:extra")).rejects.toThrow(
        /Malformed local dev KMS ciphertext structure/i
      );
      await expect(provider.decrypt("provider-1", "localdev:v2:12:34:56")).rejects.toThrow(
        KmsConfigurationError
      );
      await expect(provider.decrypt("provider-1", "")).rejects.toThrow(
        KmsConfigurationError
      );
    });
  });

  // ── 5. Wrong-Key and Wrong-Password Failure Behavior ────────────────────────

  describe("5. Wrong-Key Rejection", () => {
    it("DevSecretProtectionProvider fails decryption when key changes", async () => {
      // 1. Encrypt with initial secret
      process.env.MFA_ENCRYPTION_SECRET = "initial_secret_key_32_characters_long!";
      resetEnvConfigForTesting();
      const provider1 = new DevSecretProtectionProvider();
      const payload = await provider1.encryptSecret("user_mfa_seed");

      // 2. Attempt decrypt with completely different secret
      process.env.MFA_ENCRYPTION_SECRET = "different_secret_key_32_characters!";
      resetEnvConfigForTesting();
      const provider2 = new DevSecretProtectionProvider();

      await expect(provider2.decryptSecret(payload)).rejects.toThrow(
        "TOTP secret decryption failed: payload authentication check failed"
      );
    });

    it("LocalDevKmsProvider fails decryption when key differs", async () => {
      const keyA = "key_alpha_thirty_two_characters_long!!";
      const keyB = "key_bravo_thirty_two_characters_long!!";

      const providerA = new LocalDevKmsProvider(keyA);
      const providerB = new LocalDevKmsProvider(keyB);

      const ciphertext = await providerA.encrypt("test-provider", "secret_payload");
      await expect(providerB.decrypt("test-provider", ciphertext)).rejects.toThrow(
        KmsConfigurationError
      );
    });
  });

  // ── 6. Argon2id Parameter Validation & Deterministic Derivation ────────────

  describe("6. Argon2id Parameter Validation & Derivation", () => {
    it("hashRecoveryCode produces compliant Argon2id hashes with 64MB memory, 3 iterations, 4 threads", async () => {
      const code = generateSingleRecoveryCode();
      const hash = await hashRecoveryCode(code);

      // Format must start with $argon2id$v=19$m=65536,t=3,p=4$
      expect(hash.startsWith("$argon2id$v=19$m=65536,t=3,p=4$")).toBe(true);

      // Verification of the code must succeed
      const isValid = await verifyRecoveryCodeHash(code, hash);
      expect(isValid).toBe(true);

      // Wrong code must fail verification
      const isWrongValid = await verifyRecoveryCodeHash("22222-22222-22222-22222-22222-2", hash);
      expect(isWrongValid).toBe(false);
    });

    it("recovery codes use 128 CSPRNG bits and unambiguous Crockford Base32 alphabet", () => {
      const randomBytesSpy = jest.spyOn(crypto, "randomBytes");
      const code = generateSingleRecoveryCode();

      // Verified 16 bytes = 128 CSPRNG bits requested
      expect(randomBytesSpy).toHaveBeenCalledWith(16);
      randomBytesSpy.mockRestore();

      // Format check: 5 blocks of 5 chars + 1 trailing char (26 chars total, separated by 5 dashes)
      const codeRegex = /^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]$/;
      expect(code).toMatch(codeRegex);

      // Excludes ambiguous characters (0, O, 1, I)
      expect(code).not.toMatch(/[01OI]/);
    });

    it("normalizeRecoveryCode handles lowercase, whitespace, and formatting dashes", () => {
      const original = "23456-789AB-CDEFH-JKLMN-PQRST-U";
      const userInputs = [
        "23456-789AB-CDEFH-JKLMN-PQRST-U",
        "23456 789ab cdefh jklmn pqrst u",
        "  23456789ABCDEFHJKLMNPQRSTU  ",
        "23456-789ab-cdefh-jklmn-pqrst-u",
      ];

      const expected = "23456789ABCDEFHJKLMNPQRSTU";
      for (const input of userInputs) {
        expect(normalizeRecoveryCode(input)).toBe(expected);
      }
    });

    it("generateRecoveryCodeBatch generates required count of distinct codes", () => {
      const batch = generateRecoveryCodeBatch(10);
      expect(batch.length).toBe(10);

      const uniqueCodes = new Set(batch);
      expect(uniqueCodes.size).toBe(10);
    });

    it("deterministic Argon2id derivation with fixed inputs produces identical outputs", async () => {
      const fixedPassword = "deterministic-test-password-12345";
      const fixedSalt = Buffer.from("0123456789abcdef0123456789abcdef", "hex"); // 16 bytes fixed salt

      const hash1 = await argon2.hash(fixedPassword, {
        type: argon2.argon2id,
        salt: fixedSalt,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        raw: true,
      });

      const hash2 = await argon2.hash(fixedPassword, {
        type: argon2.argon2id,
        salt: fixedSalt,
        memoryCost: 65536,
        timeCost: 3,
        parallelism: 4,
        raw: true,
      });

      // Byte-for-byte deterministic equality
      expect(Buffer.compare(hash1, hash2)).toBe(0);
      expect(hash1.length).toBe(32); // 256 bits derived key
    });
  });
});
