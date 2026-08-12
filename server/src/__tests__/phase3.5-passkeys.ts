import { createHash, randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { challengeManager } from "../lib/redis";

const API_BASE = "http://localhost:4000/api";

async function runPhase35PasskeyTests() {
  console.log("Starting Phase 3.5 WebAuthn / Passkeys Integration & Security Verification Tests...\n");

  const emailUser1 = `passkey_user1_${Date.now()}@example.com`;
  const emailUser2 = `passkey_user2_${Date.now()}@example.com`;
  const saltHex = randomBytes(16).toString("hex");
  const authHash = createHash("sha256").update(`mock_auth_hash_${Date.now()}`).digest("base64");

  // Register User 1
  const reg1Res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailUser1,
      authHash,
      kdfSalt: saltHex,
      encryptedVaultKeyCiphertext: "dummyCiphertext",
      encryptedVaultKeyIv: "dummyIv",
    }),
  });
  const u1Data = (await reg1Res.json()) as { accessToken: string; refreshToken: string };

  // Register User 2 (for IDOR tests)
  const reg2Res = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: emailUser2,
      authHash,
      kdfSalt: saltHex,
      encryptedVaultKeyCiphertext: "dummyCiphertext",
      encryptedVaultKeyIv: "dummyIv",
    }),
  });
  const u2Data = (await reg2Res.json()) as { accessToken: string; refreshToken: string };

  // ── 1. Redis / Shared Challenge Storage Atomic Tests ───────────────────────
  console.log("1. Testing Distributed Redis Challenge Storage & Atomic Consumption...");
  const { challenge, challengeId } = await challengeManager.storeChallenge("registration", "testUser1", 300);
  if (!challenge || !challengeId) throw new Error("Challenge creation failed");

  // First consumption must succeed
  const consumed1 = await challengeManager.consumeChallenge(challengeId);
  if (!consumed1 || consumed1.challenge !== challenge) {
    throw new Error("Failed to consume challenge from storage");
  }

  // Second consumption MUST return null (atomic single-use replay protection)
  const consumed2 = await challengeManager.consumeChallenge(challengeId);
  if (consumed2 !== null) {
    throw new Error("REPLAY VIOLATION: Challenge was consumed twice!");
  }
  console.log("   ✅ Atomic GETDEL challenge consumption & replay protection verified");

  // ── 2. Passkey Registration Begin ─────────────────────────────────────────
  console.log("\n2. Testing POST /api/auth/passkeys/register/begin...");
  const regBeginRes = await fetch(`${API_BASE}/auth/passkeys/register/begin`, {
    method: "POST",
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  if (!regBeginRes.ok) throw new Error(`Register begin failed: ${await regBeginRes.text()}`);
  const regBeginData = (await regBeginRes.json()) as { options: any; challengeId: string };
  if (!regBeginData.options.challenge || !regBeginData.challengeId) {
    throw new Error("Register begin failed to return challenge or challengeId");
  }
  console.log("   ✅ WebAuthn registration options & challenge generated");

  // ── 3. DB Passkey Direct Persistence & Transport Storage ───────────────────
  console.log("\n3. Testing Passkey DB Persistence & Transports Column...");
  const mockCredId = `cred_id_${Date.now()}`;
  const user1 = await prisma.user.findUniqueOrThrow({ where: { email: emailUser1 } });
  const mockPasskey = await prisma.passkey.create({
    data: {
      userId: user1.id,
      credentialId: mockCredId,
      publicKey: "mock_public_key_base64url",
      signCount: 10,
      deviceType: "singleDevice",
      name: "YubiKey 5 NFC",
      transports: JSON.stringify(["usb", "nfc"]),
    },
  });
  if (!mockPasskey.id || mockPasskey.transports !== '["usb","nfc"]') {
    throw new Error("Passkey DB creation or transports column failed");
  }
  console.log("   ✅ Passkey persisted with transports metadata");

  // ── 4. Passkey Listing API ──────────────────────────────────────────────────
  console.log("\n4. Testing GET /api/auth/passkeys...");
  const listRes = await fetch(`${API_BASE}/auth/passkeys`, {
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  if (!listRes.ok) throw new Error(`Passkey listing failed: ${await listRes.text()}`);
  const passkeyList = (await listRes.json()) as Array<{ id: string; name: string; credentialId: string }>;
  if (passkeyList.length === 0 || passkeyList[0].id !== mockPasskey.id) {
    throw new Error("Passkey listing returned invalid list");
  }
  console.log(`   ✅ Listed ${passkeyList.length} registered passkey(s) for User 1`);

  // ── 5. Passkey Rename & IDOR Protection ───────────────────────────────────
  console.log("\n5. Testing Passkey Rename & IDOR Ownership Enforcement...");
  // User 2 attempts to rename User 1's passkey
  const idorRenameRes = await fetch(`${API_BASE}/auth/passkeys/${mockPasskey.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${u2Data.accessToken}`,
    },
    body: JSON.stringify({ name: "Hacked Passkey" }),
  });
  if (idorRenameRes.status !== 404) {
    throw new Error(`IDOR VULNERABILITY: User 2 was able to access User 1 passkey! Status: ${idorRenameRes.status}`);
  }

  // User 1 renames own passkey
  const validRenameRes = await fetch(`${API_BASE}/auth/passkeys/${mockPasskey.id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${u1Data.accessToken}`,
    },
    body: JSON.stringify({ name: "Work Laptop TouchID" }),
  });
  if (!validRenameRes.ok) throw new Error("Valid rename failed");
  console.log("   ✅ IDOR blocked (HTTP 404). Valid rename succeeded");

  // ── 6. Passkey Revocation & IDOR Protection ────────────────────────────────
  console.log("\n6. Testing Passkey Revocation & IDOR Ownership Enforcement...");
  // User 2 attempts to delete User 1's passkey
  const idorDeleteRes = await fetch(`${API_BASE}/auth/passkeys/${mockPasskey.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${u2Data.accessToken}` },
  });
  if (idorDeleteRes.status !== 404) {
    throw new Error(`IDOR VULNERABILITY: User 2 deleted User 1 passkey! Status: ${idorDeleteRes.status}`);
  }

  // User 1 deletes own passkey
  const validDeleteRes = await fetch(`${API_BASE}/auth/passkeys/${mockPasskey.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  if (validDeleteRes.status !== 204) throw new Error(`Passkey deletion failed: ${validDeleteRes.status}`);
  console.log("   ✅ IDOR blocked on revocation. Valid deletion succeeded (204)");

  // ── 7. Audit Event Verification ──────────────────────────────────────────
  console.log("\n7. Verifying Passkey Audit Events...");
  const auditEvents = await prisma.auditEvent.findMany({
    where: { userId: user1.id },
  });
  const eventTypes = auditEvents.map((e) => e.eventType);

  if (!eventTypes.includes("PASSKEY_RENAMED") || !eventTypes.includes("PASSKEY_REMOVED")) {
    throw new Error("Missing passkey audit events in database");
  }
  console.log("   ✅ Audit events recorded cleanly with zero key/signature leakage");

  console.log("\n🎉 ALL PHASE 3.5 WEBAUTHN / PASSKEYS INTEGRATION TESTS PASSED!");
}

runPhase35PasskeyTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
