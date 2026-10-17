import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../lib/logger";
import { KmsConfigurationError } from "../lib/kms";

/**
 * Standard error response interface
 */
export interface ApiErrorResponse {
  error: string;
  details?: Array<{ field: string; message: string }>;
}

/**
 * Centralized, production-hardened Express error handler.
 * Classifies expected Zod, Prisma, and JWT errors.
 * Strictly prevents leaking stack traces, database schema internals, SQL queries,
 * credentials, ciphertexts, or encryption keys in API responses or logs.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction
): Response | void {
  // If response headers have already been transmitted, delegate to default Express handler
  if (res.headersSent) {
    return next(err);
  }

  // 1. Zod Request Schema Validation Errors
  if (err instanceof ZodError) {
    const details = err.errors.map((issue) => ({
      field: issue.path.join(".") || "root",
      message: issue.message,
    }));

    logger.warn(`Validation failure on ${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      ip: req.ip,
      validationIssues: details,
    });

    return res.status(400).json({
      error: "Validation failed",
      details,
    });
  }

  // 2. Body-Parser Malformed JSON Syntax Error
  if (err instanceof SyntaxError && "status" in err && (err as any).status === 400) {
    logger.warn(`Malformed JSON body on ${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    return res.status(400).json({
      error: "Malformed JSON in request body",
    });
  }

  // 3. JWT Authentication Errors
  if (typeof err === "object" && err !== null && "name" in err) {
    const errorName = (err as any).name;
    if (errorName === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired" });
    }
    if (errorName === "JsonWebTokenError") {
      return res.status(401).json({ error: "Invalid token" });
    }
    if (errorName === "NotBeforeError") {
      return res.status(401).json({ error: "Token not active" });
    }
  }

  // 4. Prisma Database Errors
  if (typeof err === "object" && err !== null && "code" in err && typeof (err as any).code === "string") {
    const code = (err as any).code;

    // P2002: Unique constraint violation (e.g. duplicate email on registration)
    if (code === "P2002") {
      logger.warn(`Prisma unique constraint violation on ${req.method} ${req.path}`, {
        code,
        target: (err as any).meta?.target,
      });
      return res.status(409).json({
        error: "A record with this value already exists",
      });
    }

    // P2025: Record to update/delete not found
    if (code === "P2025") {
      logger.warn(`Prisma record not found on ${req.method} ${req.path}`, { code });
      return res.status(404).json({
        error: "Resource not found",
      });
    }

    // P2003: Foreign key constraint failed
    if (code === "P2003") {
      logger.warn(`Prisma foreign key violation on ${req.method} ${req.path}`, { code });
      return res.status(400).json({
        error: "Referenced entity does not exist or relation constraint failed",
      });
    }

    // General Prisma client error
    logger.error(`Database error on ${req.method} ${req.path}`, {
      code,
      name: (err as any).name,
    });
    return res.status(500).json({
      error: "Database operation failed",
    });
  }

  // 5. Key Management / Cryptographic Configuration Error
  if (err instanceof KmsConfigurationError || (typeof err === "object" && err !== null && (err as any).name === "KmsConfigurationError")) {
    logger.error(`KMS configuration error on ${req.method} ${req.path}`, {
      errorName: "KmsConfigurationError",
      message: (err as any).message,
    });
    return res.status(500).json({
      error: "Key management service unavailable or misconfigured",
    });
  }

  // 6. Generic / Uncaught Server Exceptions
  logger.error(`Unhandled error on ${req.method} ${req.path}: ${(err as any)?.message || String(err)}`, {
    method: req.method,
    path: req.path,
    ip: req.ip,
    error: err,
  });

  return res.status(500).json({
    error: "Internal server error",
  });
}
