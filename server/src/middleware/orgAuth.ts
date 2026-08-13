import { Response, NextFunction } from "express";
import { prisma } from "../lib/prisma";
import { AuthedRequest } from "./auth";

export interface OrgAuthedRequest extends AuthedRequest {
  orgId?: string;
  orgMember?: any; // Will type properly later
}

export async function requireOrgOwnership(
  req: OrgAuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const orgId = req.params.id;
    if (!orgId) {
      return res.status(400).json({ error: "Missing organization ID" });
    }

    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: orgId,
          userId: req.userId,
        },
      },
    });

    if (!member) {
      return res.status(403).json({ error: "Forbidden: Not a member" });
    }

    if (member.status !== "ACTIVE") {
      return res.status(403).json({ error: "Forbidden: Membership is not active" });
    }

    if (member.role !== "OWNER") {
      return res.status(403).json({ error: "Forbidden: Requires OWNER role" });
    }

    // Attach orgId and member to request for downstream use
    req.orgId = orgId;
    req.orgMember = member;
    next();
  } catch (error) {
    console.error("requireOrgOwnership error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function requireOrgMembership(
  req: OrgAuthedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const orgId = req.params.id;
    if (!orgId) {
      return res.status(400).json({ error: "Missing organization ID" });
    }

    if (!req.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const member = await prisma.organizationMember.findUnique({
      where: {
        orgId_userId: {
          orgId: orgId,
          userId: req.userId,
        },
      },
    });

    if (!member) {
      return res.status(403).json({ error: "Forbidden: Not a member" });
    }

    if (member.status !== "ACTIVE") {
      return res.status(403).json({ error: "Forbidden: Membership is not active" });
    }

    // Attach orgId and member to request for downstream use
    req.orgId = orgId;
    req.orgMember = member;
    next();
  } catch (error) {
    console.error("requireOrgMembership error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}

export function requireOrgPermission(permission: string) {
  return async (req: OrgAuthedRequest, res: Response, next: NextFunction) => {
    try {
      const orgId = req.params.orgId || req.params.id;
      if (!orgId) {
        return res.status(400).json({ error: "Missing organization ID" });
      }
      if (!req.userId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const member = await prisma.organizationMember.findUnique({
        where: { orgId_userId: { orgId, userId: req.userId } },
      });
      if (!member || member.status !== "ACTIVE") {
        return res.status(403).json({ error: "Forbidden: Not an active member" });
      }
      // For Phase 4.8/4.9, if true RBAC is not fully linked, OWNER can do anything.
      // If we need strict checks, we'd check roles. For now this fulfills the signature.
      if (member.role !== "OWNER") {
        // Fallback: only owner can manage SSO
        return res.status(403).json({ error: "Forbidden: Requires OWNER role or specific permission" });
      }
      req.orgId = orgId;
      req.orgMember = member;
      next();
    } catch (error) {
      console.error("requireOrgPermission error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
}
