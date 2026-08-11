"use client";

/**
 * Zero-knowledge crypto core.
 *
 * Everything in this file runs in the browser. The server NEVER receives the
 * master password, the Master Key, or the Vault Key in plaintext — only:
 *   - `authHash`  (derived FROM the Master Key, one-way, used only to verify identity)
 *   - `encryptedVaultKey` (Vault Key encrypted under the Master Key)
 *   - item ciphertexts (encrypted under the Vault Key)
 *
 * Key hierarchy (matches docs/02-cryptographic-architecture.md):
 *   Master Password + Salt --Argon2id--> Master Key (MK)
 *   MK --SHA-256 domain-separated--> Auth Hash (sent to server for login only)
 *   Vault Key (VK) --generated randomly, once, client-side--
 *   VK encrypted under MK --AES-256-GCM--> encryptedVaultKey (stored server-side)
 *   Vault items encrypted under VK --AES-256-GCM--> item ciphertexts (stored server-side)
 */

import { argon2id } from "hash-wasm";

export interface KdfParams {
  saltHex: string;
  memoryKb: number;
  iterations: number;
  parallelism: number;
}

const DEFAULT_KDF: Omit<KdfParams, "saltHex"> = {
  memoryKb: 65536, // 64 MB
  iterations: 3,
  parallelism: 4,
};

export function generateSaltHex(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bytesToHex(bytes);
}

export function defaultKdfParams(saltHex: string): KdfParams {
  return { saltHex, ...DEFAULT_KDF };
}

/** Derives the Master Key from the master password. Never leaves the client. */
export async function deriveMasterKey(masterPassword: string, kdf: KdfParams): Promise<Uint8Array> {
  const hashHex = await argon2id({
    password: masterPassword,
    salt: kdf.saltHex,
    memorySize: kdf.memoryKb,
    iterations: kdf.iterations,
    parallelism: kdf.parallelism,
    hashLength: 32,
    outputType: "hex",
  });
  return hexToBytes(hashHex);
}

/**
 * Derives the value sent to the server to authenticate. This is a one-way,
 * domain-separated function of the Master Key — the server can verify it but
 * cannot use it to recover the Master Key or the Vault Key.
 */
export async function deriveAuthHash(masterKey: Uint8Array): Promise<string> {
  const domainSeparated = concatBytes(masterKey, new TextEncoder().encode("vault-auth-v1"));
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(domainSeparated));
  return bytesToBase64(new Uint8Array(digest));
}

export function generateVaultKey(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

async function importAesKey(rawKey: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", toArrayBuffer(rawKey), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export interface EncryptedBlob {
  ciphertext: string; // base64
  iv: string; // base64
}

async function aesGcmEncrypt(plaintext: Uint8Array, rawKey: Uint8Array): Promise<EncryptedBlob> {
  const key = await importAesKey(rawKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertextBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, toArrayBuffer(plaintext));
  return {
    ciphertext: bytesToBase64(new Uint8Array(ciphertextBuf)),
    iv: bytesToBase64(iv),
  };
}

async function aesGcmDecrypt(blob: EncryptedBlob, rawKey: Uint8Array): Promise<Uint8Array> {
  const key = await importAesKey(rawKey);
  const iv = base64ToBytes(blob.iv);
  const ciphertext = base64ToBytes(blob.ciphertext);
  const plaintextBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: toArrayBuffer(iv) }, key, toArrayBuffer(ciphertext));
  return new Uint8Array(plaintextBuf);
}

/** Copies a Uint8Array into a plain ArrayBuffer-backed view (WebCrypto's BufferSource typing rejects SharedArrayBuffer-backed views). */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

/** Encrypts the randomly generated Vault Key under the Master Key. */
export async function encryptVaultKey(vaultKey: Uint8Array, masterKey: Uint8Array): Promise<EncryptedBlob> {
  return aesGcmEncrypt(vaultKey, masterKey);
}

/** Decrypts the Vault Key using the Master Key (derived fresh at login, never stored). */
export async function decryptVaultKey(blob: EncryptedBlob, masterKey: Uint8Array): Promise<Uint8Array> {
  return aesGcmDecrypt(blob, masterKey);
}

/** Encrypts an arbitrary JSON-serializable vault item payload under the Vault Key. */
export async function encryptItem<T>(data: T, vaultKey: Uint8Array): Promise<EncryptedBlob> {
  const plaintext = new TextEncoder().encode(JSON.stringify(data));
  return aesGcmEncrypt(plaintext, vaultKey);
}

/** Decrypts a vault item payload using the Vault Key. */
export async function decryptItem<T>(blob: EncryptedBlob, vaultKey: Uint8Array): Promise<T> {
  const plaintext = await aesGcmDecrypt(blob, vaultKey);
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}

// --- encoding helpers ---

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function concatBytes(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}
