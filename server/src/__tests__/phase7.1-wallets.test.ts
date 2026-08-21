import { prisma } from "../lib/prisma";
import crypto from "crypto";

const API_BASE = "http://localhost:4000/api";

describe("Phase 7.1 Wallet API Security & Functionality", () => {
  let user1Tokens: { accessToken: string };
  let user2Tokens: { accessToken: string };
  let user1Id: string;
  let user2Id: string;
  let u1DefaultWalletId: string;
  let u2DefaultWalletId: string;
  let customWalletId: string;
  let itemId: string;

  beforeAll(async () => {
    // Register User 1
    const pwd1 = "User1WalletPass!123";
    const authHash1 = crypto.createHash("sha256").update(pwd1).digest("hex");
    const res1 = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `u1-wallet-${Date.now()}@test.com`,
        authHash: authHash1,
        kdfSalt: "salt1_1234567890123",
        encryptedVaultKeyCiphertext: "ctx1",
        encryptedVaultKeyIv: "iv1",
      }),
    });
    user1Tokens = await res1.json() as any;
    if (!res1.ok) throw new Error("Failed to register User 1: " + JSON.stringify(user1Tokens));
    user1Id = JSON.parse(Buffer.from(user1Tokens.accessToken.split('.')[1], 'base64').toString()).sub;

    // Register User 2
    const pwd2 = "User2WalletPass!123";
    const authHash2 = crypto.createHash("sha256").update(pwd2).digest("hex");
    const res2 = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `u2-wallet-${Date.now()}@test.com`,
        authHash: authHash2,
        kdfSalt: "salt2_1234567890123",
        encryptedVaultKeyCiphertext: "ctx2",
        encryptedVaultKeyIv: "iv2",
      }),
    });
    user2Tokens = await res2.json() as any;
    if (!res2.ok) throw new Error("Failed to register User 2: " + JSON.stringify(user2Tokens));
    user2Id = JSON.parse(Buffer.from(user2Tokens.accessToken.split('.')[1], 'base64').toString()).sub;
  });

  it("1. Users receive a default Personal wallet on registration", async () => {
    const res = await fetch(`${API_BASE}/wallets`, {
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    const wallets = await res.json() as any;
    expect(res.status).toBe(200);
    expect(wallets.length).toBe(1);
    expect(wallets[0].name).toBe("Personal");
    expect(wallets[0].isDefault).toBe(true);
    u1DefaultWalletId = wallets[0].id;

    const res2 = await fetch(`${API_BASE}/wallets`, {
      headers: { Authorization: `Bearer ${user2Tokens.accessToken}` },
    });
    const wallets2 = await res2.json() as any;
    u2DefaultWalletId = wallets2[0].id;
  });

  it("2. User can create a new wallet", async () => {
    const res = await fetch(`${API_BASE}/wallets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Tokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Work Wallet", type: "INTERNAL" }),
    });
    const wallet = await res.json() as any;
    expect(res.status).toBe(201);
    expect(wallet.name).toBe("Work Wallet");
    expect(wallet.isDefault).toBe(false);
    customWalletId = wallet.id;
  });

  it("3. User can list only their own wallets", async () => {
    const res = await fetch(`${API_BASE}/wallets`, {
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    const wallets = await res.json() as any;
    expect(wallets.length).toBe(2);
    expect(wallets.every((w: any) => w.userId === user1Id)).toBe(true);
  });

  it("4. Cross-user IDOR: User 2 cannot access User 1's wallet", async () => {
    // Try to update User 1's wallet using User 2's token
    const res = await fetch(`${API_BASE}/wallets/${customWalletId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user2Tokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Hacked Wallet" }),
    });
    expect(res.status).toBe(404); // Returns 404 since where clause doesn't match
  });

  it("5. User can update their own wallet", async () => {
    const res = await fetch(`${API_BASE}/wallets/${customWalletId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Tokens.accessToken}`,
      },
      body: JSON.stringify({ name: "Updated Work Wallet" }),
    });
    const wallet = await res.json() as any;
    expect(res.status).toBe(200);
    expect(wallet.name).toBe("Updated Work Wallet");
  });

  it("6. VaultItems are created in the default wallet if walletId is omitted", async () => {
    const res = await fetch(`${API_BASE}/vault/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Tokens.accessToken}`,
      },
      body: JSON.stringify({
        type: "LOGIN",
        ciphertext: "ctx",
        iv: "iv",
      }),
    });
    const item = await res.json() as any;
    expect(res.status).toBe(201);
    expect(item.walletId).toBe(u1DefaultWalletId);
    itemId = item.id;
  });

  it("7. VaultItems can be created in a specific wallet", async () => {
    const res = await fetch(`${API_BASE}/vault/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Tokens.accessToken}`,
      },
      body: JSON.stringify({
        type: "SECURE_NOTE",
        ciphertext: "ctx2",
        iv: "iv2",
        walletId: customWalletId,
      }),
    });
    const item = await res.json() as any;
    expect(res.status).toBe(201);
    expect(item.walletId).toBe(customWalletId);
  });

  it("8. Cross-user IDOR: Cannot create an item in another user's wallet", async () => {
    const res = await fetch(`${API_BASE}/vault/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Tokens.accessToken}`,
      },
      body: JSON.stringify({
        type: "LOGIN",
        ciphertext: "ctx3",
        iv: "iv3",
        walletId: u2DefaultWalletId, // User 2's wallet!
      }),
    });
    expect(res.status).toBe(403);
  });

  it("9. GET /vault/items supports filtering by walletId", async () => {
    const res = await fetch(`${API_BASE}/vault/items?walletId=${customWalletId}`, {
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    const items = await res.json() as any;
    expect(res.status).toBe(200);
    expect(items.length).toBe(1);
    expect(items[0].walletId).toBe(customWalletId);
  });

  it("10. Cross-user IDOR: Cannot filter by another user's walletId", async () => {
    const res = await fetch(`${API_BASE}/vault/items?walletId=${u2DefaultWalletId}`, {
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    expect(res.status).toBe(403);
  });

  it("11. Cross-user IDOR: Cannot move item to another user's wallet", async () => {
    const res = await fetch(`${API_BASE}/vault/items/${itemId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${user1Tokens.accessToken}`,
      },
      body: JSON.stringify({ walletId: u2DefaultWalletId }),
    });
    expect(res.status).toBe(403);
  });

  it("12. Wallet deletion is rejected if it contains items", async () => {
    const res = await fetch(`${API_BASE}/wallets/${customWalletId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    expect(res.status).toBe(409);
    const err = await res.json() as any;
    expect(err.error).toMatch(/Cannot delete wallet containing items/i);
  });

  it("13. Default wallet deletion is rejected even if empty", async () => {
    // User 2's default wallet is empty
    const res = await fetch(`${API_BASE}/wallets/${u2DefaultWalletId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user2Tokens.accessToken}` },
    });
    expect(res.status).toBe(409);
    const err = await res.json() as any;
    expect(err.error).toMatch(/Cannot delete the default wallet/i);
  });

  it("14. Wallet deletion succeeds after items are moved out or deleted", async () => {
    // First find the item in customWalletId
    const resList = await fetch(`${API_BASE}/vault/items?walletId=${customWalletId}`, {
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    const items = await resList.json() as any;
    const itemToDelete = items[0].id;

    // Soft delete it
    await fetch(`${API_BASE}/vault/items/${itemToDelete}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });

    // Delete it permanently
    await fetch(`${API_BASE}/vault/items/${itemToDelete}/permanent`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });

    // Now delete the wallet
    const resDelete = await fetch(`${API_BASE}/wallets/${customWalletId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${user1Tokens.accessToken}` },
    });
    expect(resDelete.status).toBe(204);
  });
});
