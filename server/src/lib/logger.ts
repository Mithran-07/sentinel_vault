import { truncateIpForAudit } from "../routes/admin";

// List of sensitive key names that should always be redacted in logs
export const SENSITIVE_KEYS = new Set([
  "password",
  "masterpassword",
  "authhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "clientsecret",
  "vaultkey",
  "encryptedvaultkey",
  "ciphertext",
  "iv",
  "tag",
  "creditcard",
  "authorization",
  "cookie",
  "set-cookie",
  "codeverifier",
  "recoverycode",
  "x509certificate",
]);

// Regular expressions to detect and redact sensitive patterns in string values
const BEARER_TOKEN_REGEX = /Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi;
const JWT_TOKEN_REGEX = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+/g;
const ARGON2_HASH_REGEX = /\$argon2id\$v=\d+\$m=\d+,t=\d+,p=\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+/g;
const DATABASE_URL_REGEX = /postgres(?:ql)?:\/\/([^:]+):([^@]+)@/g;

/**
 * Redacts known sensitive substring patterns (tokens, hashes, connection strings) from a string.
 */
export function sanitizeString(input: string): string {
  if (!input || typeof input !== "string") return input;

  return input
    .replace(BEARER_TOKEN_REGEX, "Bearer [REDACTED]")
    .replace(JWT_TOKEN_REGEX, "[JWT REDACTED]")
    .replace(ARGON2_HASH_REGEX, "[ARGON2 HASH REDACTED]")
    .replace(DATABASE_URL_REGEX, "postgresql://$1:[REDACTED]@");
}

/**
 * Recursively sanitizes any value (object, array, error, string, primitive)
 * by redacting sensitive keys and regex patterns while preserving safe operational structure.
 */
export function sanitizeLogValue(val: unknown, seen: WeakSet<object> = new WeakSet()): unknown {
  if (val === null || val === undefined) {
    return val;
  }

  if (typeof val === "string") {
    return sanitizeString(val);
  }

  if (typeof val !== "object") {
    return val;
  }

  // Handle circular references gracefully
  if (seen.has(val)) {
    return "[CIRCULAR]";
  }
  seen.add(val);

  // Handle Error instances
  if (val instanceof Error) {
    const errorObj: Record<string, unknown> = {
      name: val.name,
      message: sanitizeString(val.message),
    };
    if ("code" in val && typeof (val as any).code === "string") {
      errorObj.code = (val as any).code;
    }
    if ("status" in val) {
      errorObj.status = (val as any).status;
    }
    if (val.stack) {
      errorObj.stack = sanitizeString(val.stack);
    }
    return errorObj;
  }

  // Handle Arrays
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeLogValue(item, seen));
  }

  // Handle Plain Objects
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(val)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SENSITIVE_KEYS.has(normalizedKey)) {
      sanitized[key] = "[REDACTED]";
    } else if (normalizedKey === "ip") {
      sanitized[key] = truncateIpForAudit(typeof value === "string" ? value : String(value));
    } else {
      sanitized[key] = sanitizeLogValue(value, seen);
    }
  }

  return sanitized;
}

export interface LoggerInterface {
  error(message: string, context?: unknown): void;
  warn(message: string, context?: unknown): void;
  info(message: string, context?: unknown): void;
  debug(message: string, context?: unknown): void;
  silent: boolean;
}

class SanitizedLogger implements LoggerInterface {
  public silent: boolean = false;

  private formatMessage(level: string, message: string, context?: unknown): string {
    const timestamp = new Date().toISOString();
    const cleanMsg = sanitizeString(message);
    const cleanCtx = context !== undefined ? sanitizeLogValue(context) : undefined;
    return cleanCtx !== undefined
      ? `[${timestamp}] [${level}] ${cleanMsg} ${JSON.stringify(cleanCtx)}`
      : `[${timestamp}] [${level}] ${cleanMsg}`;
  }

  error(message: string, context?: unknown): void {
    if (this.silent) return;
    const formatted = this.formatMessage("ERROR", message, context);
    console.error(formatted);
  }

  warn(message: string, context?: unknown): void {
    if (this.silent) return;
    const formatted = this.formatMessage("WARN", message, context);
    console.warn(formatted);
  }

  info(message: string, context?: unknown): void {
    if (this.silent) return;
    const formatted = this.formatMessage("INFO", message, context);
    console.log(formatted);
  }

  debug(message: string, context?: unknown): void {
    if (this.silent || process.env.NODE_ENV === "production") return;
    const formatted = this.formatMessage("DEBUG", message, context);
    console.debug(formatted);
  }
}

export const logger = new SanitizedLogger();
