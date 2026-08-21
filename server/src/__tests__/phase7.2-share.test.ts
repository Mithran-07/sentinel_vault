import { prisma } from "../lib/prisma";
import crypto from "crypto";

const API_BASE = "http://localhost:4000/api";

describe("Phase 7.2: Secure Time-Limited Sharing", () => {
  let u1Tokens: any;
  let u2Tokens: any;
  let u1Id: string;
  let u2Id: string;
  let u1VaultItemId: string;
  let u2VaultItemId: string;

  beforeAll(async () => {
    // Register User 1
    const pwd1 = "User1SharePass!123";
    const authHash1 = crypto.createHash("sha256").update(pwd1).digest("hex");
    const res1 = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `u1-share-${Date.now()}@test.com`,
        authHash: authHash1,
        kdfSalt: "salt1_1234567890123",
        encryptedVaultKeyCiphertext: "ctx1",
        encryptedVaultKeyIv: "iv1",
      }),
    });
    u1Tokens = await res1.json();
    if (!res1.ok) throw new Error("Failed to register User 1");
    u1Id = JSON.parse(Buffer.from(u1Tokens.accessToken.split('.')[1], 'base64').toString()).sub;

    // Register User 2
    const pwd2 = "User2SharePass!123";
    const authHash2 = crypto.createHash("sha256").update(pwd2).digest("hex");
    const res2 = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `u2-share-${Date.now()}@test.com`,
        authHash: authHash2,
        kdfSalt: "salt2_1234567890123",
        encryptedVaultKeyCiphertext: "ctx2",
        encryptedVaultKeyIv: "iv2",
      }),
    });
    u2Tokens = await res2.json();
    if (!res2.ok) throw new Error("Failed to register User 2");
    u2Id = JSON.parse(Buffer.from(u2Tokens.accessToken.split('.')[1], 'base64').toString()).sub;

    // Create an item for User 1
    const v1Res = await fetch(`${API_BASE}/vault/items`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        type: "LOGIN",
        ciphertext: "v1_c",
        iv: "v1_iv"
      })
    });
    const v1 = await v1Res.json() as any;
    u1VaultItemId = v1.id;

    // Create an item for User 2
    const v2Res = await fetch(`${API_BASE}/vault/items`, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        Authorization: `Bearer ${u2Tokens.accessToken}`
      },
      body: JSON.stringify({
        type: "LOGIN",
        ciphertext: "v2_c",
        iv: "v2_iv"
      })
    });
    const v2 = await v2Res.json() as any;
    u2VaultItemId = v2.id;
  });

  afterAll(async () => {
    // Cleanup will be handled by DB truncates in a general teardown if configured, 
    // but the randomized emails keep it safe from collisions.
  });

  it("creates a share for 5 minutes and retrieves it unauthenticated", async () => {
    const res = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "shared_c",
        iv: "shared_iv",
        expiresInMinutes: 5,
      })
    });

    expect(res.status).toBe(201);
    const body = await res.json() as any;
    expect(body.id).toBeDefined();

    const getRes = await fetch(`${API_BASE}/share/${body.id}`);
    expect(getRes.status).toBe(200);
    const getBody = await getRes.json() as any;
    expect(getBody.ciphertext).toBe("shared_c");
    expect(getBody.iv).toBe("shared_iv");
  });

  it("creates a share for 10 minutes", async () => {
    const res = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "shared_c2",
        iv: "shared_iv2",
        expiresInMinutes: 10,
      })
    });
    expect(res.status).toBe(201);
  });

  it("rejects share creation above 10 minutes", async () => {
    const res = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "shared_c3",
        iv: "shared_iv3",
        expiresInMinutes: 15,
      })
    });
    expect(res.status).toBe(400); // Zod validation fails
  });

  it("rejects cross-user share creation (IDOR protection)", async () => {
    const res = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}` // User 1 tries to share User 2's item
      },
      body: JSON.stringify({
        vaultItemId: u2VaultItemId,
        ciphertext: "stolen",
        iv: "iv",
        expiresInMinutes: 5,
      })
    });
    expect(res.status).toBe(404);
  });

  it("allows creator to revoke a share and returns 410 Gone", async () => {
    const create = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "revoke_me",
        iv: "iv",
        expiresInMinutes: 5,
      })
    });
    const createBody = await create.json() as any;
    const id = createBody.id;

    // Retrieve before revoke
    expect((await fetch(`${API_BASE}/share/${id}`)).status).toBe(200);

    // Revoke
    const revoke = await fetch(`${API_BASE}/share/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${u1Tokens.accessToken}`
      }
    });
    expect(revoke.status).toBe(200);

    // Retrieve after revoke
    const getAfter = await fetch(`${API_BASE}/share/${id}`);
    expect(getAfter.status).toBe(410);
    const getAfterBody = await getAfter.json() as any;
    expect(getAfterBody.error).toMatch(/revoked/i);
  });

  it("prevents another user from revoking the share", async () => {
    const create = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "dont_revoke",
        iv: "iv",
        expiresInMinutes: 5,
      })
    });
    const createBody = await create.json() as any;
    const id = createBody.id;

    const revoke = await fetch(`${API_BASE}/share/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${u2Tokens.accessToken}` // User 2 tries to revoke
      }
    });
    
    expect(revoke.status).toBe(404);
  });

  it("returns 410 Gone for expired shares", async () => {
    const create = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "expire_me",
        iv: "iv",
        expiresInMinutes: 5,
      })
    });
    const createBody = await create.json() as any;
    const id = createBody.id;

    // Manually backdate the share expiration in DB
    await prisma.sharedCredential.update({
      where: { id },
      data: { expiresAt: new Date(Date.now() - 1000) } // 1 second ago
    });

    const getAfter = await fetch(`${API_BASE}/share/${id}`);
    expect(getAfter.status).toBe(410);
    const getAfterBody = await getAfter.json() as any;
    expect(getAfterBody.error).toMatch(/expired/i);
  });

  it("generates correct audit events without leaking plaintext or secrets", async () => {
    // 1. Share
    const create = await fetch(`${API_BASE}/share`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${u1Tokens.accessToken}`
      },
      body: JSON.stringify({
        vaultItemId: u1VaultItemId,
        ciphertext: "audit_c",
        iv: "audit_iv",
        expiresInMinutes: 10,
      })
    });
    const createBody = await create.json() as any;
    const id = createBody.id;

    // 2. Access
    await fetch(`${API_BASE}/share/${id}`);

    // 3. Revoke
    await fetch(`${API_BASE}/share/${id}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${u1Tokens.accessToken}`
      }
    });

    // Check audits
    const events = await prisma.auditEvent.findMany({
      where: { userId: u1Id },
      orderBy: { createdAt: "desc" },
      take: 3
    });

    const types = events.map(e => e.eventType);
    expect(types).toContain("CREDENTIAL_SHARED");
    expect(types).toContain("SHARED_CREDENTIAL_ACCESSED");
    expect(types).toContain("SHARED_CREDENTIAL_REVOKED");

    for (const e of events) {
      const meta = e.metadata as any;
      expect(meta.shareId).toBe(id);
      
      // Ensure no sensitive data leaked
      const raw = JSON.stringify(meta);
      expect(raw).not.toContain("audit_c");
      expect(raw).not.toContain("audit_iv");
      expect(raw).not.toContain("secret"); // though server never sees it anyway
    }
  });

  it("handles non-existent shares safely", async () => {
    const getRes = await fetch(`${API_BASE}/share/00000000-0000-0000-0000-000000000000`);
    expect(getRes.status).toBe(404);
  });
});
