import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { prisma } from "../lib/prisma";

export interface AuthedRequest extends Request {
  userId?: string;
  sessionId?: string;
  userEmail?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = verifyAccessToken(header.slice(7));
    
    // Verify session state if sessionId is present in token
    if (payload.sessionId) {
      const session = await prisma.session.findFirst({
        where: {
          id: payload.sessionId,
          userId: payload.sub,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
      });

      if (!session) {
        return res.status(401).json({ error: "Session revoked or expired" });
      }

      // Touch lastActiveAt asynchronously
      void prisma.session.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
      }).catch(() => {});

      req.sessionId = payload.sessionId;
    }

    req.userId = payload.sub;
    req.userEmail = payload.email;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
