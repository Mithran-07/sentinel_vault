import jwt from "jsonwebtoken";
import crypto from "crypto";

function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value || value.length < 32) {
    throw new Error(
      `${name} must be set to a string of at least 32 characters. ` +
      `Generate one with: openssl rand -base64 48`
    );
  }
  return value;
}

const ACCESS_SECRET = requireSecret("JWT_ACCESS_SECRET");
const REFRESH_SECRET = requireSecret("JWT_REFRESH_SECRET");

export interface AccessTokenPayload {
  sub: string; // user id
  sessionId?: string;
  email?: string;
  purpose?: string;
  jti?: string;
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  family: string;
  jti: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(
    { ...payload, purpose: payload.purpose || "access" },
    ACCESS_SECRET,
    { expiresIn: "15m" }
  );
}

export function signMfaChallengeToken(userId: string): string {
  return jwt.sign(
    {
      sub: userId,
      purpose: "mfa_challenge",
      jti: crypto.randomUUID(),
    },
    ACCESS_SECRET,
    { expiresIn: "5m" } // 5-minute expiry for MFA challenge
  );
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string, sessionId: string, family: string): string {
  return jwt.sign(
    { sub: userId, sessionId, family, jti: crypto.randomUUID() },
    REFRESH_SECRET,
    { expiresIn: "30d" }
  );
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, REFRESH_SECRET) as RefreshTokenPayload;
}
