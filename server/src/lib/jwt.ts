import jwt from "jsonwebtoken";

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
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ sub: userId }, REFRESH_SECRET, { expiresIn: "30d" });
}

export function verifyRefreshToken(token: string): { sub: string } {
  return jwt.verify(token, REFRESH_SECRET) as { sub: string };
}
