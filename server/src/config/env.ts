import { z } from "zod";

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(`[CONFIG ERROR] ${message}`);
    this.name = "ConfigurationError";
  }
}

export const KNOWN_INSECURE_DEV_MFA_SECRET = "development_mfa_secret_key_32bytes_len!!";
export const KNOWN_INSECURE_DEV_KMS_KEY = "dev_kms_key_for_local_testing_only_32bytes!";

const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CLIENT_ORIGIN: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  MFA_ENCRYPTION_SECRET: z.string().optional(),
  API_URL: z.string().optional().default("http://127.0.0.1:4000"),
  REDIS_URL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),
  LOCAL_DEV_KMS_KEY: z.string().optional(),
  RP_ID: z.string().optional().default("localhost"),
  EXPECTED_ORIGIN: z.string().optional().default("http://localhost:3000"),
  STORAGE_BACKEND: z.enum(["local", "s3"]).optional().default("local"),
  COOKIE_SAME_SITE: z.enum(["strict", "lax", "none"]).optional().default("strict"),
});

export type EnvConfig = z.infer<typeof baseEnvSchema> & {
  MFA_ENCRYPTION_SECRET: string;
  LOCAL_DEV_KMS_KEY?: string;
};

/**
 * Validates environment variables according to the current execution mode.
 * Fails closed in production if required secrets are missing, insecure, or using dev fallbacks.
 */
export function validateEnv(rawEnv: Record<string, string | undefined> = process.env): EnvConfig {
  const parsed = baseEnvSchema.safeParse(rawEnv);
  if (!parsed.success) {
    const errorDetails = parsed.error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join("; ");
    throw new ConfigurationError(`Invalid environment configuration: ${errorDetails}`);
  }

  const env = parsed.data;

  // Strict checks for production mode
  if (env.NODE_ENV === "production") {
    if (!env.MFA_ENCRYPTION_SECRET) {
      throw new ConfigurationError(
        "MFA_ENCRYPTION_SECRET is mandatory in production mode. It must be a cryptographically random string of at least 32 characters."
      );
    }

    if (env.MFA_ENCRYPTION_SECRET === KNOWN_INSECURE_DEV_MFA_SECRET) {
      throw new ConfigurationError(
        "MFA_ENCRYPTION_SECRET cannot use the known static development key in production mode."
      );
    }

    if (env.MFA_ENCRYPTION_SECRET.length < 32) {
      throw new ConfigurationError(
        `MFA_ENCRYPTION_SECRET must be at least 32 characters in production (received ${env.MFA_ENCRYPTION_SECRET.length}).`
      );
    }

    if (env.JWT_ACCESS_SECRET.length < 32) {
      throw new ConfigurationError(
        `JWT_ACCESS_SECRET must be at least 32 characters in production (received ${env.JWT_ACCESS_SECRET.length}).`
      );
    }

    if (env.JWT_REFRESH_SECRET.length < 32) {
      throw new ConfigurationError(
        `JWT_REFRESH_SECRET must be at least 32 characters in production (received ${env.JWT_REFRESH_SECRET.length}).`
      );
    }

    if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET) {
      throw new ConfigurationError(
        "JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be distinct keys."
      );
    }

    if (rawEnv.LOCAL_DEV_KMS_KEY) {
      throw new ConfigurationError(
        "LOCAL_DEV_KMS_KEY is forbidden in production mode. Production must use real AWS KMS (AWS_REGION and AWS_KMS_KEY_ID)."
      );
    }
  }

  // Handle development / test fallback for MFA_ENCRYPTION_SECRET
  let effectiveMfaSecret = env.MFA_ENCRYPTION_SECRET;
  if (!effectiveMfaSecret) {
    if (env.NODE_ENV === "development") {
      console.warn(
        "[SECURITY WARNING] MFA_ENCRYPTION_SECRET is not configured in .env. Using development fallback key. DO NOT USE IN PRODUCTION."
      );
    }
    effectiveMfaSecret = KNOWN_INSECURE_DEV_MFA_SECRET;
  }

  // Handle development / test fallback for LOCAL_DEV_KMS_KEY
  let effectiveDevKmsKey: string | undefined = undefined;
  if (env.NODE_ENV !== "production") {
    if (rawEnv.LOCAL_DEV_KMS_KEY) {
      if (rawEnv.LOCAL_DEV_KMS_KEY.length < 32) {
        throw new ConfigurationError(
          `LOCAL_DEV_KMS_KEY must be at least 32 characters (received ${rawEnv.LOCAL_DEV_KMS_KEY.length}).`
        );
      }
      effectiveDevKmsKey = rawEnv.LOCAL_DEV_KMS_KEY;
    } else {
      effectiveDevKmsKey = KNOWN_INSECURE_DEV_KMS_KEY;
    }
  }

  return {
    ...env,
    MFA_ENCRYPTION_SECRET: effectiveMfaSecret,
    LOCAL_DEV_KMS_KEY: effectiveDevKmsKey,
  };
}

let cachedConfig: EnvConfig | null = null;

export function getEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv(process.env);
  }
  return cachedConfig;
}

// Reset cache for unit testing
export function resetEnvConfigForTesting(): void {
  cachedConfig = null;
}
