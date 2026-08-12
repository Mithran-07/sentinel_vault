/**
 * StorageAdapter — abstraction layer for encrypted attachment storage.
 *
 * The server stores and retrieves opaque encrypted bytes only.
 * It never inspects file content, filename, or MIME type (those are
 * encrypted client-side and stored in the Attachment DB record).
 *
 * Swap LocalStorageAdapter for S3StorageAdapter in production by
 * setting STORAGE_BACKEND=s3 and the relevant S3_* env vars.
 */

import fs from "fs";
import path from "path";
import { Readable } from "stream";

export interface StorageAdapter {
  /** Write encrypted bytes to storage. Returns the storage key. */
  put(key: string, data: Buffer): Promise<void>;
  /** Read encrypted bytes from storage. */
  get(key: string): Promise<Buffer>;
  /** Delete encrypted bytes from storage. */
  delete(key: string): Promise<void>;
}

// ── Local filesystem adapter (development) ───────────────────────────────────
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

export class LocalStorageAdapter implements StorageAdapter {
  constructor() {
    // Ensure uploads directory exists.
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
  }

  async put(key: string, data: Buffer): Promise<void> {
    const filePath = path.join(UPLOADS_DIR, key);
    await fs.promises.writeFile(filePath, data);
  }

  async get(key: string): Promise<Buffer> {
    const filePath = path.join(UPLOADS_DIR, key);
    return fs.promises.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(UPLOADS_DIR, key);
    await fs.promises.unlink(filePath).catch(() => {}); // ignore missing file
  }
}

// ── S3-ready adapter stub (production) ──────────────────────────────────────
// Swap in by setting STORAGE_BACKEND=s3 and configuring:
//   S3_BUCKET, S3_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
//
// Implementation requires: npm install @aws-sdk/client-s3
export class S3StorageAdapter implements StorageAdapter {
  async put(_key: string, _data: Buffer): Promise<void> {
    throw new Error("S3StorageAdapter: set STORAGE_BACKEND=local or implement S3 integration");
  }
  async get(_key: string): Promise<Buffer> {
    throw new Error("S3StorageAdapter: set STORAGE_BACKEND=local or implement S3 integration");
  }
  async delete(_key: string): Promise<void> {
    throw new Error("S3StorageAdapter: set STORAGE_BACKEND=local or implement S3 integration");
  }
}

// ── Factory ──────────────────────────────────────────────────────────────────
export function createStorageAdapter(): StorageAdapter {
  const backend = process.env.STORAGE_BACKEND ?? "local";
  if (backend === "s3") return new S3StorageAdapter();
  return new LocalStorageAdapter();
}

export const storage = createStorageAdapter();
