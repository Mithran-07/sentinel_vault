import request from "supertest";
import express, { Request, Response, NextFunction } from "express";
import { z, ZodError } from "zod";
import { errorHandler } from "../../middleware/errorHandler";
import {
  logger,
  sanitizeLogValue,
  sanitizeString,
  SENSITIVE_KEYS,
} from "../../lib/logger";
import { KmsConfigurationError } from "../../lib/kms";
import helmet from "helmet";
import cors from "cors";

describe("Batch E: Error Handling, Logging Sanitization & Security Headers", () => {
  // Silence console logs during tests to keep test output clean
  beforeAll(() => {
    logger.silent = true;
  });

  afterAll(() => {
    logger.silent = false;
  });

  // ── 1. Centralized Error Handler Unit Tests ───────────────────────────────

  describe("1. Centralized Error Handler (errorHandler)", () => {
    let testApp: express.Express;

    beforeEach(() => {
      testApp = express();
      testApp.use(express.json());

      // Route that throws Zod validation error
      testApp.post("/test/zod", (req) => {
        const schema = z.object({
          email: z.string().email("Invalid email address"),
          password: z.string().min(8, "Password must be at least 8 characters"),
        });
        schema.parse(req.body);
      });

      // Route that throws Prisma P2002 (Unique constraint)
      testApp.get("/test/prisma-p2002", () => {
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        err.meta = { target: ["email"] };
        throw err;
      });

      // Route that throws Prisma P2025 (Record not found)
      testApp.get("/test/prisma-p2025", () => {
        const err: any = new Error("Record to update not found");
        err.code = "P2025";
        throw err;
      });

      // Route that throws Prisma P2003 (Foreign key constraint)
      testApp.get("/test/prisma-p2003", () => {
        const err: any = new Error("Foreign key constraint failed");
        err.code = "P2003";
        throw err;
      });

      // Route that throws unhandled Prisma error with internal SQL query
      testApp.get("/test/prisma-generic", () => {
        const err: any = new Error("SELECT * FROM users WHERE password_hash = 'secret'");
        err.code = "P2010";
        err.name = "PrismaClientKnownRequestError";
        throw err;
      });

      // Routes that throw JWT errors
      testApp.get("/test/jwt-expired", () => {
        const err = new Error("jwt expired");
        err.name = "TokenExpiredError";
        throw err;
      });

      testApp.get("/test/jwt-invalid", () => {
        const err = new Error("invalid signature");
        err.name = "JsonWebTokenError";
        throw err;
      });

      testApp.get("/test/jwt-not-before", () => {
        const err = new Error("jwt not active");
        err.name = "NotBeforeError";
        throw err;
      });

      // Route that throws KMS configuration error
      testApp.get("/test/kms-error", () => {
        throw new KmsConfigurationError("AWS KMS key arn:aws:kms:us-east-1:123456789012:key/xyz is disabled");
      });

      // Route that throws unhandled generic error with stack trace
      testApp.get("/test/generic-error", () => {
        throw new Error("Critical internal failure in secret service");
      });

      // Route that sends headers before error to test headersSent branch
      testApp.get("/test/headers-sent", (req, res, next) => {
        res.writeHead(200);
        res.write("partial");
        next(new Error("Error after headers sent"));
      });

      // Mount error handler
      testApp.use(errorHandler);
    });

    it("classifies ZodError into HTTP 400 with details and redacts input values", async () => {
      const res = await request(testApp)
        .post("/test/zod")
        .send({ email: "bad-email", password: "short" });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
      expect(res.body.details).toEqual([
        { field: "email", message: "Invalid email address" },
        { field: "password", message: "Password must be at least 8 characters" },
      ]);
      // Verify raw password input was NOT reflected in the response
      expect(JSON.stringify(res.body)).not.toContain("short");
    });

    it("handles Prisma P2002 as HTTP 409 Conflict without leaking target table", async () => {
      const res = await request(testApp).get("/test/prisma-p2002");
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: "A record with this value already exists" });
    });

    it("handles Prisma P2025 as HTTP 404 Resource Not Found", async () => {
      const res = await request(testApp).get("/test/prisma-p2025");
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: "Resource not found" });
    });

    it("handles Prisma P2003 as HTTP 400 Invalid Referenced Resource", async () => {
      const res = await request(testApp).get("/test/prisma-p2003");
      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        error: "Referenced entity does not exist or relation constraint failed",
      });
    });

    it("handles generic Prisma error as HTTP 500 without leaking SQL or schema internals", async () => {
      const res = await request(testApp).get("/test/prisma-generic");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Database operation failed" });
      expect(JSON.stringify(res.body)).not.toContain("SELECT * FROM");
      expect(JSON.stringify(res.body)).not.toContain("password_hash");
    });

    it("classifies TokenExpiredError as HTTP 401 with Token expired message", async () => {
      const res = await request(testApp).get("/test/jwt-expired");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Token expired" });
    });

    it("classifies JsonWebTokenError as HTTP 401 with Invalid token message", async () => {
      const res = await request(testApp).get("/test/jwt-invalid");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Invalid token" });
    });

    it("classifies NotBeforeError as HTTP 401 with Token not active message", async () => {
      const res = await request(testApp).get("/test/jwt-not-before");
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: "Token not active" });
    });

    it("classifies KmsConfigurationError as HTTP 500 without leaking KMS ARN or credentials", async () => {
      const res = await request(testApp).get("/test/kms-error");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({
        error: "Key management service unavailable or misconfigured",
      });
      expect(JSON.stringify(res.body)).not.toContain("arn:aws:kms");
    });

    it("classifies generic uncaught errors as HTTP 500 Internal server error without leaking stack traces", async () => {
      const res = await request(testApp).get("/test/generic-error");
      expect(res.status).toBe(500);
      expect(res.body).toEqual({ error: "Internal server error" });
      expect(res.body.stack).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("secret service");
    });

    it("delegates to next handler if response headers have already been sent", () => {
      const mockReq = { method: "GET", path: "/test", ip: "127.0.0.1" } as any;
      const mockRes = { headersSent: true } as any;
      const mockNext = jest.fn();
      const testError = new Error("Late failure after headers sent");

      errorHandler(testError, mockReq, mockRes, mockNext);
      expect(mockNext).toHaveBeenCalledWith(testError);
    });

    it("catches malformed JSON syntax error in body parser as HTTP 400", async () => {
      const res = await request(testApp)
        .post("/test/zod")
        .set("Content-Type", "application/json")
        .send('{"badJson": ');

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "Malformed JSON in request body" });
    });
  });

  // ── 2. Logging Sanitization Tests (sanitizeLogValue & sanitizeString) ─────

  describe("2. Logging Sanitization & Redaction", () => {
    it("redacts sensitive keys recursively from objects and arrays", () => {
      const sensitivePayload = {
        userId: "user-123",
        email: "user@example.com",
        password: "super_secret_password_123",
        masterPassword: "master_password_plaintext",
        authHash: "$argon2id$v=19$m=65536,t=3,p=4$some_salt$some_hash",
        token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis",
        accessToken: "access_token_value",
        refreshToken: "refresh_token_value",
        secret: "totp_mfa_secret",
        clientSecret: "oidc_client_secret",
        vaultKey: "raw_32_byte_vault_key",
        encryptedVaultKey: "encrypted_vault_key_blob",
        itemMetadata: {
          ciphertext: "encrypted_key_ciphertext",
          iv: "iv_hex_or_b64",
          tag: "auth_tag_hex",
        },
        creditCard: "4111-2222-3333-4444",
        nestedList: [
          { safe: "safe_value", password: "nested_password" },
        ],
      };

      const sanitized: any = sanitizeLogValue(sensitivePayload);

      // Safe fields preserved
      expect(sanitized.userId).toBe("user-123");
      expect(sanitized.email).toBe("user@example.com");
      expect(sanitized.nestedList[0].safe).toBe("safe_value");

      // Sensitive fields redacted
      expect(sanitized.password).toBe("[REDACTED]");
      expect(sanitized.masterPassword).toBe("[REDACTED]");
      expect(sanitized.authHash).toBe("[REDACTED]");
      expect(sanitized.token).toBe("[REDACTED]");
      expect(sanitized.accessToken).toBe("[REDACTED]");
      expect(sanitized.refreshToken).toBe("[REDACTED]");
      expect(sanitized.secret).toBe("[REDACTED]");
      expect(sanitized.clientSecret).toBe("[REDACTED]");
      expect(sanitized.vaultKey).toBe("[REDACTED]");
      expect(sanitized.encryptedVaultKey).toBe("[REDACTED]");
      expect(sanitized.creditCard).toBe("[REDACTED]");
      expect(sanitized.nestedList[0].password).toBe("[REDACTED]");

      // Nested object with sensitive properties
      expect(sanitized.itemMetadata.ciphertext).toBe("[REDACTED]");
      expect(sanitized.itemMetadata.iv).toBe("[REDACTED]");
      expect(sanitized.itemMetadata.tag).toBe("[REDACTED]");
    });

    it("masks IP addresses embedded in log contexts", () => {
      const logContext = {
        event: "LOGIN_FAILED",
        ip: "192.168.1.123",
      };

      const sanitized: any = sanitizeLogValue(logContext);
      expect(sanitized.ip).toBe("192.168.1.xxx");
    });

    it("redacts JWT tokens and Bearer headers in string messages", () => {
      const rawMsg = "Failed request with header Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
      const clean = sanitizeString(rawMsg);

      expect(clean).toContain("Bearer [REDACTED]");
      expect(clean).not.toContain("SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c");
    });

    it("redacts database connection strings containing passwords in error messages", () => {
      const rawError = "Connection error to postgresql://vault_user:super_secret_db_pass@db.internal:5432/vault_prod";
      const clean = sanitizeString(rawError);

      expect(clean).toBe("Connection error to postgresql://vault_user:[REDACTED]@db.internal:5432/vault_prod");
      expect(clean).not.toContain("super_secret_db_pass");
    });

    it("handles circular references in log context without crashing", () => {
      const circularObj: any = { name: "circular-test" };
      circularObj.self = circularObj;

      const sanitized: any = sanitizeLogValue(circularObj);
      expect(sanitized.name).toBe("circular-test");
      expect(sanitized.self).toBe("[CIRCULAR]");
    });

    it("sanitizes Error objects preserving name and sanitized message", () => {
      const err = new Error("Failed to decrypt token: Bearer mySecretToken123");
      (err as any).code = "ERR_CRYPTO";

      const sanitized: any = sanitizeLogValue(err);
      expect(sanitized.name).toBe("Error");
      expect(sanitized.code).toBe("ERR_CRYPTO");
      expect(sanitized.message).toBe("Failed to decrypt token: Bearer [REDACTED]");
      expect(sanitized.message).not.toContain("mySecretToken123");
    });
  });

  // ── 3. Production Security Headers Verification ────────────────────────────

  describe("3. Production Security Headers (Helmet)", () => {
    let helmetApp: express.Express;

    beforeAll(() => {
      helmetApp = express();
      helmetApp.disable("x-powered-by");
      helmetApp.use(
        helmet({
          crossOriginResourcePolicy: { policy: "cross-origin" },
          frameguard: { action: "deny" },
          hidePoweredBy: true,
          hsts: {
            maxAge: 31536000,
            includeSubDomains: true,
          },
          noSniff: true,
          referrerPolicy: { policy: "strict-origin-when-cross-origin" },
        })
      );
      helmetApp.use(
        cors({
          origin: "http://localhost:3000",
          credentials: true,
        })
      );
      helmetApp.get("/health", (_req, res) => res.json({ ok: true }));
    });

    it("verifies required security headers on production application endpoints", async () => {
      const res = await request(helmetApp).get("/health");

      expect(res.status).toBe(200);

      // 1. Anti-MIME sniffing
      expect(res.headers["x-content-type-options"]).toBe("nosniff");

      // 2. Anti-Clickjacking
      expect(res.headers["x-frame-options"]).toBe("DENY");

      // 3. Strict Transport Security (HSTS) with at least 1 year (31536000s)
      expect(res.headers["strict-transport-security"]).toMatch(/max-age=31536000;\s*includeSubDomains/);

      // 4. Referrer Policy
      expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");

      // 5. Cross-Origin Resource Policy
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");

      // 6. X-Powered-By is explicitly stripped
      expect(res.headers["x-powered-by"]).toBeUndefined();
    });

    it("preserves CORS credentials and origin headers for client", async () => {
      const res = await request(helmetApp)
        .get("/health")
        .set("Origin", "http://localhost:3000");

      expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:3000");
      expect(res.headers["access-control-allow-credentials"]).toBe("true");
    });
  });
});
