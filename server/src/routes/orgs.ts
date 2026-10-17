import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { requireOrgOwnership, requireOrgMembership, OrgAuthedRequest } from "../middleware/orgAuth";
import { recordAuditEvent } from "../lib/audit";
import { acquireUserAndOrgLocks } from "../lib/advisory-lock";
import * as crypto from "crypto";

import * as argon2 from "argon2";

const router = Router();

// Zod schemas
const createOrgSchema = z.object({
  name: z.string().min(1).max(255),
});

const inviteMemberSchema = z.object({
  email: z.string().email(),
});

const acceptInviteSchema = z.object({
  token: z.string(),
});

// Create organization
router.post("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = createOrgSchema.parse(req.body);

    const org = await prisma.$transaction(async (tx) => {
      const newOrg = await tx.organization.create({
        data: { name: parsed.name },
      });

      await tx.organizationMember.create({
        data: {
          orgId: newOrg.id,
          userId: req.userId!,
          role: "OWNER",
          status: "ACTIVE",
        },
      });

      return newOrg;
    });

    await recordAuditEvent(req.userId!, "ORG_CREATED", { orgId: org.id, name: org.name });

    res.status(201).json({ data: org });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// List organizations
router.get("/", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const members = await prisma.organizationMember.findMany({
      where: { userId: req.userId },
      include: { org: true },
    });
    
    // According to specs, suspended may appear, but removed should not be treated as active member.
    // Let's filter out REMOVED from the list completely.
    const activeOrSuspended = members.filter(m => m.status !== "REMOVED");

    const orgs = activeOrSuspended.map(m => ({
      ...m.org,
      myRole: m.role,
      myStatus: m.status,
    }));

    res.json({ data: orgs });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Accept invitation
router.post("/invitations/accept", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const parsed = acceptInviteSchema.parse(req.body);
    const token = parsed.token;
    
    // Hash token to find it
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    const invite = await prisma.organizationInvitation.findUnique({
      where: { tokenHash },
    });

    if (!invite) {
      return res.status(400).json({ error: "Invalid or expired invitation" });
    }

    if (invite.usedAt) {
      return res.status(400).json({ error: "Invitation already used" });
    }

    if (invite.expiresAt < new Date()) {
      return res.status(400).json({ error: "Invitation expired" });
    }
    
    // Verify user eligibility. User email must match invite email (unless we allow forwarding, but strict enterprise usually doesn't)
    // Wait, we don't have req.userEmail in the request, or do we? req.userEmail is set in auth middleware.
    if (req.userEmail !== invite.email) {
      return res.status(403).json({ error: "Invitation is for a different email address" });
    }

    await prisma.$transaction(async (tx) => {
      // Mark as used
      await tx.organizationInvitation.update({
        where: { id: invite.id },
        data: { usedAt: new Date() },
      });

      // Safely handle existing membership
      const existing = await tx.organizationMember.findUnique({
        where: { orgId_userId: { orgId: invite.orgId, userId: req.userId! } }
      });

      if (existing) {
        if (existing.status === "ACTIVE") {
          // Already active, do nothing
        } else {
          // Reactivate
          await tx.organizationMember.update({
            where: { id: existing.id },
            data: { status: "ACTIVE", role: "MEMBER" },
          });
        }
      } else {
        await tx.organizationMember.create({
          data: {
            orgId: invite.orgId,
            userId: req.userId!,
            role: "MEMBER",
            status: "ACTIVE",
          },
        });
      }
    });

    await recordAuditEvent(req.userId!, "ORG_MEMBER_INVITATION_ACCEPTED", { orgId: invite.orgId });

    res.json({ data: { success: true } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get organization details
router.get("/:id", requireAuth, requireOrgMembership, async (req: OrgAuthedRequest, res) => {
  try {
    const org = await prisma.organization.findUnique({
      where: { id: req.orgId },
    });
    res.json({ data: org });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update organization
router.patch("/:id", requireAuth, requireOrgOwnership, async (req: OrgAuthedRequest, res) => {
  try {
    const parsed = createOrgSchema.parse(req.body);
    const org = await prisma.organization.update({
      where: { id: req.orgId },
      data: { name: parsed.name },
    });
    
    await recordAuditEvent(req.userId!, "ORG_UPDATED", { orgId: org.id, name: org.name });
    res.json({ data: org });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get members
router.get("/:id/members", requireAuth, requireOrgMembership, async (req: OrgAuthedRequest, res) => {
  try {
    const members = await prisma.organizationMember.findMany({
      where: { orgId: req.orgId },
      include: {
        user: {
          select: { email: true }
        }
      }
    });
    const invitations = await prisma.organizationInvitation.findMany({
      where: { orgId: req.orgId, usedAt: null, expiresAt: { gt: new Date() } }
    });
    
    res.json({ data: { members, invitations } });
  } catch (err: any) {
    res.status(500).json({ error: "Internal server error" });
  }
});

// Invite member
router.post("/:id/invitations", requireAuth, requireOrgOwnership, async (req: OrgAuthedRequest, res) => {
  try {
    const parsed = inviteMemberSchema.parse(req.body);
    
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    
    const invite = await prisma.organizationInvitation.create({
      data: {
        orgId: req.orgId!,
        email: parsed.email,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      }
    });

    await recordAuditEvent(req.userId!, "ORG_MEMBER_INVITED", { orgId: req.orgId, email: parsed.email });

    // In a real app, send email here. For dev, return token.
    res.status(201).json({ data: { token } });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ error: "Invalid input", details: err.errors });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Update member status
router.patch("/:id/members/:memberId", requireAuth, requireOrgOwnership, async (req: OrgAuthedRequest, res) => {
  try {
    const { status } = req.body; // Expect ACTIVE or SUSPENDED
    
    if (status !== "ACTIVE" && status !== "SUSPENDED") {
      return res.status(400).json({ error: "Invalid status" });
    }

    const orgId = req.orgId!;
    const memberId = req.params.memberId;

    const updated = await prisma.$transaction(async (tx) => {
      // 1. Acquire transaction advisory locks in global hierarchical order:
      // USER lock (actor) -> ORG lock (organization)
      // This strictly matches deactivateUserAccount lock order and eliminates lock-order inversion deadlocks.
      await acquireUserAndOrgLocks(tx, req.userId!, orgId);

      // 2. Fetch target member under lock
      const member = await tx.organizationMember.findUnique({
        where: { id: memberId, orgId },
      });

      if (!member) {
        const error: any = new Error("Member not found");
        error.statusCode = 404;
        throw error;
      }

      // 3. Self-modification restriction
      if (member.userId === req.userId) {
        const error: any = new Error("Cannot modify own status");
        error.statusCode = 400;
        throw error;
      }

      // 4. Sole active owner protection:
      // If target member is currently an active OWNER and status is changing away from ACTIVE:
      if (member.role === "OWNER" && member.status === "ACTIVE" && status !== "ACTIVE") {
        const activeOwnerCount = await tx.organizationMember.count({
          where: { orgId, role: "OWNER", status: "ACTIVE" },
        });

        if (activeOwnerCount <= 1) {
          const error: any = new Error(
            "Cannot suspend the sole active owner of an organization. Transfer ownership or assign another owner first."
          );
          error.code = "CANNOT_SUSPEND_SOLE_ORG_OWNER";
          error.statusCode = 409;
          throw error;
        }
      }

      // 5. Update member status inside transaction
      const updatedMember = await tx.organizationMember.update({
        where: { id: member.id },
        data: { status },
      });

      // 6. Record audit event within transaction
      const eventType = status === "ACTIVE" ? "ORG_MEMBER_REACTIVATED" : "ORG_MEMBER_SUSPENDED";
      await recordAuditEvent(req.userId!, eventType, { orgId, targetUserId: member.userId }, tx);

      return updatedMember;
    });

    res.json({ data: updated });
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Remove member
router.delete("/:id/members/:memberId", requireAuth, requireOrgOwnership, async (req: OrgAuthedRequest, res) => {
  try {
    const orgId = req.orgId!;
    const memberId = req.params.memberId;

    await prisma.$transaction(async (tx) => {
      // 1. Acquire transaction advisory locks in global hierarchical order:
      // USER lock (actor) -> ORG lock (organization)
      // This strictly matches deactivateUserAccount lock order and eliminates lock-order inversion deadlocks.
      await acquireUserAndOrgLocks(tx, req.userId!, orgId);

      // 2. Fetch target member under lock
      const member = await tx.organizationMember.findUnique({
        where: { id: memberId, orgId },
      });

      if (!member) {
        const error: any = new Error("Member not found");
        error.statusCode = 404;
        throw error;
      }

      // 3. Self-removal restriction
      if (member.userId === req.userId) {
        const error: any = new Error("Cannot remove oneself");
        error.statusCode = 400;
        throw error;
      }

      // 4. Sole active owner protection:
      // If target member is currently an active OWNER:
      if (member.role === "OWNER" && member.status === "ACTIVE") {
        const activeOwnerCount = await tx.organizationMember.count({
          where: { orgId, role: "OWNER", status: "ACTIVE" },
        });

        if (activeOwnerCount <= 1) {
          const error: any = new Error(
            "Cannot remove the sole active owner of an organization. Transfer ownership or assign another owner first."
          );
          error.code = "CANNOT_REMOVE_SOLE_ORG_OWNER";
          error.statusCode = 409;
          throw error;
        }
      }

      // 5. Update member status to REMOVED inside transaction
      await tx.organizationMember.update({
        where: { id: member.id },
        data: { status: "REMOVED" },
      });

      // 6. Record audit event within transaction
      await recordAuditEvent(req.userId!, "ORG_MEMBER_REMOVED", { orgId, targetUserId: member.userId }, tx);
    });

    res.status(204).send();
  } catch (err: any) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message, code: err.code });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});


export default router;
