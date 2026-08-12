import { createHash, randomBytes } from "crypto";
import { prisma } from "../lib/prisma";

const API_BASE = "http://localhost:4000/api";

async function runPhase32Tests() {
  console.log("Starting Phase 3.2 Session Management Verification Tests...\n");

  const emailUser1 = `user1_${Date.now()}@example.com`;
  const emailUser2 = `user2_${Date.now()}@example.com`;
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

  // Register User 2 (for IDOR check)
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

  // ── 1. Session Listing ──────────────────────────────────────────────────────
  console.log("1. Testing GET /api/auth/sessions...");
  const listRes = await fetch(`${API_BASE}/auth/sessions`, {
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  if (!listRes.ok) throw new Error(`GET /auth/sessions failed: ${await listRes.text()}`);
  const sessions = (await listRes.json()) as Array<{
    id: string;
    browser: string;
    os: string;
    ipAddress: string;
    isCurrent: boolean;
    tokenHash?: string;
    authHash?: string;
  }>;

  if (sessions.length === 0) throw new Error("Expected at least 1 active session");
  const currentSession = sessions.find((s) => s.isCurrent);
  if (!currentSession) throw new Error("Expected 1 session marked as isCurrent");

  // Security Check: Ensure NO secrets or token hashes in payload
  if (currentSession.tokenHash || currentSession.authHash) {
    throw new Error("SECURITY LEAK: Secret or token hash exposed in session listing!");
  }
  console.log(`   ✅ Listed ${sessions.length} session(s) safely (isCurrent marked, no secret leakage)`);

  // ── 2. User Isolation & IDOR Protection ────────────────────────────────────
  console.log("\n2. Testing User Isolation & IDOR Protection...");
  const u2SessionId = currentSession.id; // User 1's session ID

  // User 2 attempts to delete User 1's session ID
  const idorRes = await fetch(`${API_BASE}/auth/sessions/${u2SessionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${u2Data.accessToken}` },
  });
  if (idorRes.status !== 404) {
    throw new Error(`IDOR VULNERABILITY DETECTED! Expected 404, got ${idorRes.status}`);
  }
  console.log("   ✅ IDOR blocked: User 2 cannot access or revoke User 1's session (HTTP 404 returned)");

  // ── 3. Additional Session Creation (Simulate Second Login) ─────────────────
  console.log("\n3. Testing Second Login (Multiple Active Sessions)...");
  const secondLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailUser1, authHash }),
  });
  const secondLoginData = (await secondLoginRes.json()) as { accessToken: string };

  const list2Res = await fetch(`${API_BASE}/auth/sessions`, {
    headers: { Authorization: `Bearer ${secondLoginData.accessToken}` },
  });
  const sessions2 = (await list2Res.json()) as Array<{ id: string; isCurrent: boolean }>;
  if (sessions2.length < 2) throw new Error("Expected 2 active sessions for User 1");
  console.log(`   ✅ User 1 now has ${sessions2.length} active sessions`);

  // ── 4. Individual Session Revocation ───────────────────────────────────────
  console.log("\n4. Testing Individual Session Revocation...");
  const firstSessionToRevoke = sessions2.find((s) => !s.isCurrent)!;
  const revokeRes = await fetch(`${API_BASE}/auth/sessions/${firstSessionToRevoke.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${secondLoginData.accessToken}` },
  });
  if (revokeRes.status !== 204) throw new Error(`Revocation failed: ${revokeRes.status}`);

  // Confirm revoked session access token is immediately rejected by requireAuth
  const revokedCheck = await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  if (revokedCheck.status !== 401) {
    throw new Error(`Revoked session token was NOT rejected! Status: ${revokedCheck.status}`);
  }
  console.log("   ✅ Individual session revoked. Access token associated with revoked session immediately rejected (401)");

  // ── 5. Session Idle Timeout Enforcement (30 Minutes) ───────────────────────
  console.log("\n5. Testing 30-Minute Idle Timeout Enforcement...");
  // Simulate idle timeout by setting lastActiveAt to 31 minutes ago in DB for User 2's session
  const u2ListRes = await fetch(`${API_BASE}/auth/sessions`, {
    headers: { Authorization: `Bearer ${u2Data.accessToken}` },
  });
  const u2Sessions = (await u2ListRes.json()) as Array<{ id: string }>;
  const u2SessionIdTarget = u2Sessions[0].id;

  const thirtyOneMinsAgo = new Date(Date.now() - 31 * 60 * 1000);
  await prisma.session.update({
    where: { id: u2SessionIdTarget },
    data: { lastActiveAt: thirtyOneMinsAgo },
  });

  const idleCheck = await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${u2Data.accessToken}` },
  });
  if (idleCheck.status !== 401) {
    throw new Error(`Idle session (>30m) was NOT rejected! Status: ${idleCheck.status}`);
  }
  const idleErr = (await idleCheck.json()) as { error: string };
  if (!idleErr.error.includes("idle")) {
    throw new Error(`Expected idle timeout error message, got: ${idleErr.error}`);
  }
  console.log("   ✅ Session idle for 31 minutes successfully rejected by middleware (401)");

  // ── 6. Absolute Session Timeout Enforcement (30 Days) ─────────────────────
  console.log("\n6. Testing 30-Day Absolute Timeout Enforcement...");
  // Create a new login and set expiresAt in the past
  const freshLogin = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailUser1, authHash }),
  });
  const freshData = (await freshLogin.json()) as { accessToken: string };

  const freshList = await fetch(`${API_BASE}/auth/sessions`, {
    headers: { Authorization: `Bearer ${freshData.accessToken}` },
  });
  const freshSessions = (await freshList.json()) as Array<{ id: string; isCurrent: boolean }>;
  const currentFreshId = freshSessions.find((s) => s.isCurrent)!.id;

  // Set expiresAt to 1 minute ago in DB
  await prisma.session.update({
    where: { id: currentFreshId },
    data: { expiresAt: new Date(Date.now() - 60000) },
  });

  const expiredCheck = await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${freshData.accessToken}` },
  });
  if (expiredCheck.status !== 401) {
    throw new Error(`Expired session was NOT rejected! Status: ${expiredCheck.status}`);
  }
  console.log("   ✅ Absolute timeout enforced: expired session rejected (401)");

  // ── 7. Activity DB Write Throttling Check (60 Seconds) ────────────────────
  console.log("\n7. Testing DB Write Throttling for lastActiveAt (60s)...");
  // Login fresh again
  const throttleLogin = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailUser1, authHash }),
  });
  const throttleData = (await throttleLogin.json()) as { accessToken: string };

  const initialSessions = await prisma.session.findMany({ where: { userId: (await prisma.user.findUnique({ where: { email: emailUser1 } }))!.id, revokedAt: null } });
  const activeSessionBefore = initialSessions[initialSessions.length - 1];

  // Send request immediately
  await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${throttleData.accessToken}` },
  });

  const activeSessionAfter = await prisma.session.findUnique({ where: { id: activeSessionBefore.id } });

  // Timestamp should NOT have changed because less than 60 seconds passed
  if (activeSessionBefore.lastActiveAt.getTime() !== activeSessionAfter!.lastActiveAt.getTime()) {
    throw new Error("DB write throttling failed: lastActiveAt was updated on request <60s old!");
  }
  console.log("   ✅ Activity DB write throttling verified: lastActiveAt was NOT written to DB for requests <60s old");

  console.log("\n🎉 ALL PHASE 3.2 SESSION MANAGEMENT TESTS PASSED!");
}

runPhase32Tests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
