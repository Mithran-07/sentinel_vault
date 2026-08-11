import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth, AuthedRequest } from "../middleware/auth";
import { verifyAuditChain } from "../lib/audit";

const router = Router();
router.use(requireAuth);

router.get("/", async (req: AuthedRequest, res) => {
  const events = await prisma.auditEvent.findMany({
    where: { userId: req.userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(events);
});

// Proves the hash chain hasn't been tampered with — the enterprise "tamper-resistant log" feature.
router.get("/verify", async (req: AuthedRequest, res) => {
  const result = await verifyAuditChain(req.userId!);
  res.json(result);
});

export default router;
