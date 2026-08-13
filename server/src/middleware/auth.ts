import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export interface AuthedRequest extends Request {
  userId?: string;
  sessionId?: string;
  userEmail?: string;
}

const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVITY_THROTTLE_MS = 60 * 1000; // 60 seconds

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    
    // Explicit Purpose Check: Reject partial MFA challenge tokens on general APIs
    if (payload.purpose === "mfa_challenge") {
      return res.status(401).json({ error: "Invalid token purpose: MFA challenge token cannot access application APIs" });
    }

    // Verify session state in database if sessionId is present in access token
    if (payload.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
        },
      });

      if (!session) {
        return res.status(401).json({ error: "Session revoked or not found" });
      }

      const dbUser = await prisma.user.findUnique({ where: { id: payload.sub } });
      if (dbUser?.isSuspended) {
        return res.status(401).json({ error: "User is suspended" });
      }

      const now = Date.now();

      // 1. Check absolute timeout
      if (session.expiresAt.getTime() < now) {
        return res.status(401).json({ error: "Session expired" });
      }

      // 2. Check idle timeout (30 minutes inactivity)
      const idleTimeMs = now - session.lastActiveAt.getTime();
      if (idleTimeMs > IDLE_TIMEOUT_MS) {
        return res.status(401).json({ error: "Session idle timeout exceeded" });
      }

      // 3. Throttled activity update (only write to DB if last update was > 60s ago)
      if (idleTimeMs > ACTIVITY_THROTTLE_MS) {
        void prisma.session.update({
          where: { id: session.id },
          data: { lastActiveAt: new Date() },
        }).catch(() => {});
      }

      req.sessionId = payload.sessionId;
    }

    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireGlobalAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    if (!payload.isSuperAdmin) {
      return res.status(403).json({ error: "Super-admin privileges required" });
    }
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
