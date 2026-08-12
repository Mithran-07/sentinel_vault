import crypto from "crypto";
import { UAParser } from "ua-parser-js";
import { prisma } from "./prisma";

export type DeviceType = "desktop" | "mobile" | "tablet";

/**
 * Classify User-Agent into desktop, mobile, or tablet.
 */
export function parseDeviceType(userAgentStr?: string): DeviceType {
  if (!userAgentStr) return "desktop";

  const parser = new UAParser(userAgentStr);
  const deviceType = parser.getDevice().type;

  if (deviceType === "mobile") return "mobile";
  if (deviceType === "tablet") return "tablet";
  return "desktop";
}

/**
 * Generate privacy-conscious, non-invasive device fingerprint hash.
 * SHA256(userId + userAgent + clientPlatform)
 */
export function generateDeviceFingerprint(
  userId: string,
  userAgentStr?: string,
  clientPlatform?: string
): string {
  const ua = userAgentStr || "unknown_ua";
  const platform = clientPlatform || "unknown_platform";
  return crypto
    .createHash("sha256")
    .update(`${userId}:${ua}:${platform}`)
    .digest("hex");
}

/**
 * Evaluates whether a login attempt is from an unrecognized/suspicious device.
 * Compares incoming browser, OS, and deviceFingerprint against user's past non-revoked session history.
 * Returns true if no matching browser/OS or fingerprint is found in user's past sessions.
 */
export function evaluateSuspiciousDevice(
  userId: string,
  browser: string,
  os: string,
  deviceFingerprint: string
): Promise<boolean> {
  return (async () => {
    // Fetch user's existing sessions
    const existingSessions = await prisma.session.findMany({
      where: { userId },
      select: { browser: true, os: true, deviceFingerprint: true },
    });

    // If this is the user's first session ever, it is not suspicious (it's the initial device setup)
    if (existingSessions.length === 0) {
      return false;
    }

    // Check if user has an existing session matching this browser & OS, or fingerprint
    const recognized = existingSessions.some((s) => {
      const matchFingerprint = s.deviceFingerprint === deviceFingerprint;
      const matchBrowserOs =
        s.browser &&
        s.os &&
        s.browser.toLowerCase() === browser.toLowerCase() &&
        s.os.toLowerCase() === os.toLowerCase();
      return matchFingerprint || matchBrowserOs;
    });

    return !recognized;
  })();
}
