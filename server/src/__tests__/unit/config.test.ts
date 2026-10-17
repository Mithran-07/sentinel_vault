import "dotenv/config";
import {
  validateEnv,
  ConfigurationError,
  KNOWN_INSECURE_DEV_MFA_SECRET,
  resetEnvConfigForTesting,
} from "../../config/env";
import { DevSecretProtectionProvider } from "../../lib/mfa";

describe("Environment Configuration & Startup Validation (Batch A)", () => {
  const validDevEnv = {
    NODE_ENV: "development",
    PORT: "4000",
    CLIENT_ORIGIN: "http://localhost:3000",
    DATABASE_URL: "postgresql://vault:vault@localhost:5432/vault?schema=public",
    JWT_ACCESS_SECRET: "development-jwt-access-secret-minimum-16-chars",
    JWT_REFRESH_SECRET: "development-jwt-refresh-secret-minimum-16-chars",
  };

  const validProdEnv = {
    NODE_ENV: "production",
    PORT: "4000",
    CLIENT_ORIGIN: "https://vault.example.com",
    DATABASE_URL: "postgresql://vault_user:secret@db.internal:5432/vault_prod?schema=public",
    JWT_ACCESS_SECRET: "a_secure_production_access_secret_with_32_chars_or_more!",
    JWT_REFRESH_SECRET: "a_secure_production_refresh_secret_with_32_chars_or_more!",
    MFA_ENCRYPTION_SECRET: "a_secure_production_mfa_secret_with_32_chars_or_more!",
  };

  describe("Development mode validation", () => {
    it("accepts valid development environment with fallback MFA secret", () => {
      const config = validateEnv(validDevEnv);
      expect(config.NODE_ENV).toBe("development");
      expect(config.PORT).toBe(4000);
      expect(config.MFA_ENCRYPTION_SECRET).toBe(KNOWN_INSECURE_DEV_MFA_SECRET);
    });

    it("accepts explicitly configured MFA_ENCRYPTION_SECRET in development", () => {
      const customSecret = "custom-local-secret-key-for-development-32";
      const config = validateEnv({
        ...validDevEnv,
        MFA_ENCRYPTION_SECRET: customSecret,
      });
      expect(config.MFA_ENCRYPTION_SECRET).toBe(customSecret);
    });

    it("fails when DATABASE_URL is missing", () => {
      const invalid = { ...validDevEnv, DATABASE_URL: "" };
      expect(() => validateEnv(invalid)).toThrow(ConfigurationError);
    });

    it("fails when JWT secrets are under 16 characters in dev", () => {
      const invalid = { ...validDevEnv, JWT_ACCESS_SECRET: "short" };
      expect(() => validateEnv(invalid)).toThrow(ConfigurationError);
    });
  });

  describe("Production mode safety & fail-closed behavior", () => {
    it("accepts complete and secure production configuration", () => {
      const config = validateEnv(validProdEnv);
      expect(config.NODE_ENV).toBe("production");
      expect(config.MFA_ENCRYPTION_SECRET).toBe(validProdEnv.MFA_ENCRYPTION_SECRET);
    });

    it("fails closed when MFA_ENCRYPTION_SECRET is omitted in production", () => {
      const { MFA_ENCRYPTION_SECRET, ...omitted } = validProdEnv;
      expect(() => validateEnv(omitted)).toThrow(
        /MFA_ENCRYPTION_SECRET is mandatory in production mode/
      );
    });

    it("fails closed when MFA_ENCRYPTION_SECRET is set to the known dev fallback key in production", () => {
      const insecure = {
        ...validProdEnv,
        MFA_ENCRYPTION_SECRET: KNOWN_INSECURE_DEV_MFA_SECRET,
      };
      expect(() => validateEnv(insecure)).toThrow(
        /cannot use the known static development key in production mode/
      );
    });

    it("fails closed when MFA_ENCRYPTION_SECRET is shorter than 32 characters in production", () => {
      const shortKey = {
        ...validProdEnv,
        MFA_ENCRYPTION_SECRET: "too_short_mfa_secret",
      };
      expect(() => validateEnv(shortKey)).toThrow(
        /MFA_ENCRYPTION_SECRET must be at least 32 characters in production/
      );
    });

    it("fails closed when JWT_ACCESS_SECRET is shorter than 32 characters in production", () => {
      const shortAccess = {
        ...validProdEnv,
        JWT_ACCESS_SECRET: "short_secret_under_32_chars!",
      };
      expect(() => validateEnv(shortAccess)).toThrow(
        /JWT_ACCESS_SECRET must be at least 32 characters in production/
      );
    });

    it("fails closed when JWT_REFRESH_SECRET equals JWT_ACCESS_SECRET in production", () => {
      const identical = {
        ...validProdEnv,
        JWT_REFRESH_SECRET: validProdEnv.JWT_ACCESS_SECRET,
      };
      expect(() => validateEnv(identical)).toThrow(
        /JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys/
      );
    });
  });

  describe("MFA secret encryption provider", () => {
    it("encrypts and decrypts a TOTP secret correctly", async () => {
      const provider = new DevSecretProtectionProvider();
      const testSecret = "JBSWY3DPEHPK3PXP";

      const encrypted = await provider.encryptSecret(testSecret);
      expect(encrypted.ciphertext).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.tag).toBeDefined();

      const decrypted = await provider.decryptSecret(encrypted);
      expect(decrypted).toBe(testSecret);
    });

    it("fails closed when ciphertext is tampered", async () => {
      const provider = new DevSecretProtectionProvider();
      const testSecret = "JBSWY3DPEHPK3PXP";

      const encrypted = await provider.encryptSecret(testSecret);
      // Tamper with base64 ciphertext
      const tamperedCiphertext = Buffer.from("corrupted-bytes-for-test").toString("base64");

      await expect(
        provider.decryptSecret({
          ...encrypted,
          ciphertext: tamperedCiphertext,
        })
      ).rejects.toThrow(/TOTP secret decryption failed/);
    });
  });
});
