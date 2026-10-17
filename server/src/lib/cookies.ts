import { Response, CookieOptions } from "express";

/**
 * Returns standardized options for the HttpOnly refresh token cookie.
 * In cross-site production deployments (e.g. Vercel frontend on *.vercel.app
 * and Render backend on *.onrender.com), set COOKIE_SAME_SITE="none" in your
 * Render environment variables so browsers include the cookie on cross-site fetch calls.
 * For same-site custom domain deployments (e.g. app.domain.com and api.domain.com),
 * keep the default COOKIE_SAME_SITE="strict" or "lax".
 */
export function getRefreshCookieOptions(): CookieOptions {
  const isProd = process.env.NODE_ENV === "production";
  const configuredSameSite = process.env.COOKIE_SAME_SITE?.toLowerCase();

  let sameSite: "strict" | "lax" | "none" = "strict";
  if (configuredSameSite === "none" || configuredSameSite === "lax" || configuredSameSite === "strict") {
    sameSite = configuredSameSite;
  }

  return {
    httpOnly: true,
    secure: isProd || sameSite === "none",
    sameSite,
    path: "/api/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
}

export function setRefreshCookie(res: Response, token: string): void {
  res.cookie("refreshToken", token, getRefreshCookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  const options = getRefreshCookieOptions();
  res.clearCookie("refreshToken", {
    path: options.path,
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
  });
}
