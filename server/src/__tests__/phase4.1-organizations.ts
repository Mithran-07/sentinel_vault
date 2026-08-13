import { createHash, randomBytes } from "crypto";
import request from "supertest";
import { prisma } from "../lib/prisma";
import { verifyAuditChain } from "../lib/audit";

const API_BASE = "http://127.0.0.1:4000";

describe("Phase 4.1 Organizations Integration Tests", () => {
  // Helpers
  async function registerUser(email: string) {
    const saltHex = randomBytes(16).toString("hex");
    const authHash = createHash("sha256").update(`mock_auth_hash_${Date.now()}`).digest("base64");
    const res = await request(API_BASE).post("/api/auth/register").send({
      email,
      authHash,
      kdfSalt: saltHex,
      kdfMemoryKb: 65536,
      kdfIterations: 3,
      kdfParallelism: 4,
      encryptedVaultKeyCiphertext: "dummyCiphertext",
      encryptedVaultKeyIv: "dummyIv",
    });
    if (!res.ok) throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
    return { accessToken: res.body.accessToken, userId: (await prisma.user.findUnique({ where: { email } }))!.id, email, authHash };
  }

  let userA: any;
  let userB: any;
  let userC: any;

  beforeAll(async () => {
    userA = await registerUser(`userA_${Date.now()}@example.com`);
    userB = await registerUser(`userB_${Date.now()}@example.com`);
    userC = await registerUser(`userC_${Date.now()}@example.com`);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("1. Organization creation & 5. Member creation (creator becomes OWNER)", async () => {
    const res = await request(API_BASE)
      .post("/api/orgs")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "Org A" });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe("Org A");

    const orgId = res.body.data.id;
    userA.orgId = orgId;

    const members = await prisma.organizationMember.findMany({ where: { orgId } });
    expect(members).toHaveLength(1);
    expect(members[0].userId).toBe(userA.userId);
    expect(members[0].role).toBe("OWNER");
    expect(members[0].status).toBe("ACTIVE");
  });

  it("2. Organization retrieval", async () => {
    const res = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Org A");
  });

  it("3. Organization update", async () => {
    const res = await request(API_BASE)
      .patch(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ name: "Org A Updated" });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe("Org A Updated");
  });

  it("4. Organization listing", async () => {
    const res = await request(API_BASE)
      .get("/api/orgs")
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe("Org A Updated");
    expect(res.body.data[0].myRole).toBe("OWNER");
  });

  let inviteToken: string;
  let inviteTokenHash: string;

  it("6. Invitation generation & 7. Invitation token hashing", async () => {
    const res = await request(API_BASE)
      .post(`/api/orgs/${userA.orgId}/invitations`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ email: userB.email });
    
    expect(res.status).toBe(201);
    inviteToken = res.body.data.token;
    expect(inviteToken).toBeDefined();

    const invite = await prisma.organizationInvitation.findFirst({
      where: { orgId: userA.orgId, email: userB.email }
    });
    expect(invite).toBeDefined();
    inviteTokenHash = invite!.tokenHash;
    expect(inviteTokenHash).not.toBe(inviteToken); // Hashed != Plaintext
  });

  it("8. Invitation expiration", async () => {
    // Generate an expired invite
    const oldToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(oldToken).digest("hex");
    await prisma.organizationInvitation.create({
      data: {
        orgId: userA.orgId,
        email: userB.email,
        tokenHash,
        expiresAt: new Date(Date.now() - 10000), // expired
      }
    });

    const res = await request(API_BASE)
      .post("/api/orgs/invitations/accept")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ token: oldToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invitation expired");
  });

  it("10. Invitation acceptance & 12. Member listing", async () => {
    const res = await request(API_BASE)
      .post("/api/orgs/invitations/accept")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ token: inviteToken });
    expect(res.status).toBe(200);

    const membersRes = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}/members`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(membersRes.status).toBe(200);
    expect(membersRes.body.data.members).toHaveLength(2);
  });

  it("9. Invitation single-use enforcement", async () => {
    const res = await request(API_BASE)
      .post("/api/orgs/invitations/accept")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ token: inviteToken });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Invitation already used");
  });

  it("11. Duplicate/existing membership handling on re-invite+accept", async () => {
    // Invite userB again
    const inviteRes = await request(API_BASE)
      .post(`/api/orgs/${userA.orgId}/invitations`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ email: userB.email });
    
    const newToken = inviteRes.body.data.token;
    
    const acceptRes = await request(API_BASE)
      .post("/api/orgs/invitations/accept")
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ token: newToken });
    expect(acceptRes.status).toBe(200); // Handled safely

    const membersRes = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}/members`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(membersRes.body.data.members.filter((m: any) => m.userId === userB.userId)).toHaveLength(1);
  });

  it("18. Cross-organization IDOR rejection", async () => {
    const res = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userC.accessToken}`);
    expect(res.status).toBe(403);
  });

  it("19. Non-owner attempting owner-only operation", async () => {
    const resInvite = await request(API_BASE)
      .post(`/api/orgs/${userA.orgId}/invitations`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ email: userC.email });
    expect(resInvite.status).toBe(403);

    const resUpdate = await request(API_BASE)
      .patch(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`)
      .send({ name: "Hacked" });
    expect(resUpdate.status).toBe(403);
  });

  it("13. Member suspension & 16. Suspended member access rejection", async () => {
    const memberObj = await prisma.organizationMember.findFirst({ where: { userId: userB.userId, orgId: userA.orgId } });
    
    const resSuspend = await request(API_BASE)
      .patch(`/api/orgs/${userA.orgId}/members/${memberObj!.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ status: "SUSPENDED" });
    expect(resSuspend.status).toBe(200);

    const resAccess = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(resAccess.status).toBe(403);
  });

  it("14. Member reactivation", async () => {
    const memberObj = await prisma.organizationMember.findFirst({ where: { userId: userB.userId, orgId: userA.orgId } });
    
    const resReactivate = await request(API_BASE)
      .patch(`/api/orgs/${userA.orgId}/members/${memberObj!.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ status: "ACTIVE" });
    expect(resReactivate.status).toBe(200);

    const resAccess = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(resAccess.status).toBe(200);
  });

  it("15. Member removal & 17. Removed member access rejection", async () => {
    const memberObj = await prisma.organizationMember.findFirst({ where: { userId: userB.userId, orgId: userA.orgId } });
    
    const resRemove = await request(API_BASE)
      .delete(`/api/orgs/${userA.orgId}/members/${memberObj!.id}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    expect(resRemove.status).toBe(204);

    const resAccess = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userB.accessToken}`);
    expect(resAccess.status).toBe(403);
  });

  it("20. Personal vault remains accessible only to owner", async () => {
    // Even after org manipulation, userA's vault works
    const resVault = await request(API_BASE)
      .post("/api/vault/items")
      .set("Authorization", `Bearer ${userA.accessToken}`)
      .send({ type: "LOGIN", ciphertext: "my_secret", iv: "my_iv" });
    expect(resVault.status).toBe(201);
  });

  it("21. Organization operations never expose vault plaintext & 25. Zero-knowledge preservation", async () => {
    const resList = await request(API_BASE)
      .get(`/api/orgs/${userA.orgId}`)
      .set("Authorization", `Bearer ${userA.accessToken}`);
    
    const resStr = JSON.stringify(resList.body);
    expect(resStr).not.toMatch(/my_secret/);
    expect(resStr).not.toMatch(/dummyCiphertext/);
  });

  it("22. Audit events generated for org operations & 23. No secrets in audit & 24. Audit chain integrity", async () => {
    const events = await prisma.auditEvent.findMany({
      where: { userId: userA.userId },
      orderBy: { sequence: "asc" }
    });
    
    expect(events.length).toBeGreaterThan(0);
    
    const eventTypes = events.map(e => e.eventType);
    expect(eventTypes).toContain("ORG_CREATED");
    expect(eventTypes).toContain("ORG_MEMBER_INVITED");
    
    // Check for secrets
    const eventsStr = JSON.stringify(events);
    expect(eventsStr).not.toMatch(inviteToken);
    expect(eventsStr).not.toMatch(/dummyCiphertext/);

    const integrity = await verifyAuditChain(userA.userId);
    expect(integrity.valid).toBe(true);
  });
});
