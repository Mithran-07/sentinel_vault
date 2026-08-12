import { createHash, randomBytes } from "crypto";
import { generateSync } from "otplib";
import { prisma } from "../lib/prisma";

const API_BASE = "http://localhost:4000/api";

async function runPhase34MfaTests() {
  console.log("Starting Phase 3.4 MFA / TOTP Integration & Security Verification Tests...\n");

  const email = `mfa_test_${Date.now()}@example.com`;
  const saltHex = randomBytes(16).toString("hex");
  const authHash = createHash("sha256").update(`mock_auth_hash_${Date.now()}`).digest("base64");

  // Register account
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      authHash,
      kdfSalt: saltHex,
      encryptedVaultKeyCiphertext: "dummyCiphertext",
      encryptedVaultKeyIv: "dummyIv",
    }),
  });
  const userTokens = (await regRes.json()) as { accessToken: string; refreshToken: string };

  // ── 1. MFA Disabled by Default ─────────────────────────────────────────────
  console.log("1. Testing MFA Status (Disabled by Default)...");
  const statusRes1 = await fetch(`${API_BASE}/auth/mfa/status`, {
    headers: { Authorization: `Bearer ${userTokens.accessToken}` },
  });
  const status1 = (await statusRes1.json()) as { mfaEnabled: boolean; type: string | null };
  if (status1.mfaEnabled !== false || status1.type !== null) {
    throw new Error("Expected MFA to be disabled by default");
  }
  console.log("   ✅ MFA is disabled by default for new accounts");

  // ── 2. Login without MFA ───────────────────────────────────────────────────
  console.log("\n2. Testing Password Login without MFA...");
  const loginRes1 = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, authHash }),
  });
  const loginData1 = (await loginRes1.json()) as { accessToken?: string; mfaRequired?: boolean };
  if (loginData1.mfaRequired || !loginData1.accessToken) {
    throw new Error("Login without MFA failed to issue direct access token");
  }
  console.log("   ✅ Direct session creation successful when MFA is disabled");

  // ── 3. Initiate TOTP Enrollment ────────────────────────────────────────────
  console.log("\n3. Testing TOTP Setup Initiation...");
  const setupRes = await fetch(`${API_BASE}/auth/mfa/totp/setup`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userTokens.accessToken}` },
  });
  const setupData = (await setupRes.json()) as { secret: string; otpauthUrl: string; qrCodeDataUrl: string };
  if (!setupData.secret || !setupData.qrCodeDataUrl) {
    throw new Error("Setup did not return secret or QR data URL");
  }
  console.log("   ✅ Setup returned secret & Base64 QR code URL");

  // ── 4. Unverified Setup Does Not Enable MFA ────────────────────────────────
  console.log("\n4. Verifying Unverified Setup Does Not Enable MFA...");
  const statusRes2 = await fetch(`${API_BASE}/auth/mfa/status`, {
    headers: { Authorization: `Bearer ${userTokens.accessToken}` },
  });
  const status2 = (await statusRes2.json()) as { mfaEnabled: boolean };
  if (status2.mfaEnabled) {
    throw new Error("Unverified setup prematurely enabled MFA!");
  }
  console.log("   ✅ MFA remains un-enabled until initial TOTP verification proof");

  // ── 5. Invalid Code Rejection during Setup Verify ─────────────────────────
  console.log("\n5. Testing Invalid TOTP Code Rejection during Setup Verify...");
  const badVerifyRes = await fetch(`${API_BASE}/auth/mfa/totp/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userTokens.accessToken}`,
    },
    body: JSON.stringify({ code: "000000" }),
  });
  if (badVerifyRes.status !== 401) {
    throw new Error(`Expected 401 on bad TOTP code, got ${badVerifyRes.status}`);
  }
  console.log("   ✅ Invalid TOTP code rejected (401)");

  // ── 6. Valid Code Finalizes MFA Enrollment ────────────────────────────────
  console.log("\n6. Testing Valid TOTP Verification & MFA Activation...");
  const validCode = generateSync({ secret: setupData.secret });
  const validVerifyRes = await fetch(`${API_BASE}/auth/mfa/totp/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${userTokens.accessToken}`,
    },
    body: JSON.stringify({ code: validCode }),
  });
  if (!validVerifyRes.ok) {
    throw new Error(`Valid verify failed: ${await validVerifyRes.text()}`);
  }

  const statusRes3 = await fetch(`${API_BASE}/auth/mfa/status`, {
    headers: { Authorization: `Bearer ${userTokens.accessToken}` },
  });
  const status3 = (await statusRes3.json()) as { mfaEnabled: boolean; type: string };
  if (!status3.mfaEnabled || status3.type !== "TOTP") {
    throw new Error("MFA state was not marked as enabled after valid verify");
  }

  // Check status payload for secret leakage
  if (JSON.stringify(status3).includes(setupData.secret)) {
    throw new Error("SECURITY LEAK: TOTP secret exposed in status payload!");
  }
  console.log("   ✅ Valid TOTP code confirmed. MFA is now ACTIVE (zero secret leakage)");

  // ── 7. Login WITH MFA Enabled (2-Step Challenge) ──────────────────────────
  console.log("\n7. Testing 2-Step Login with MFA Enabled...");
  const mfaLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, authHash }),
  });
  const mfaLoginData = (await mfaLoginRes.json()) as { mfaRequired?: boolean; mfaToken?: string; accessToken?: string };

  if (!mfaLoginData.mfaRequired || !mfaLoginData.mfaToken) {
    throw new Error("Login failed to require MFA challenge");
  }
  if (mfaLoginData.accessToken) {
    throw new Error("SECURITY VIOLATION: Full access token issued before MFA challenge completion!");
  }
  console.log("   ✅ Login returned 2-step MFA challenge token (full session blocked)");

  // ── 8. MFA Challenge Token Purpose & Scope Security Check ─────────────────
  console.log("\n8. Testing MFA Challenge Token Scope Security...");
  // Attempt to call protected vault API using partial mfaToken
  const bypassCheck = await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${mfaLoginData.mfaToken}` },
  });
  if (bypassCheck.status !== 401) {
    throw new Error(`SECURITY VIOLATION: MFA challenge token accessed vault API! Status: ${bypassCheck.status}`);
  }
  console.log("   ✅ MFA challenge token strictly rejected on application APIs (purpose: 'mfa_challenge')");

  // ── 9. Complete MFA 2-Step Challenge Authentication ───────────────────────
  console.log("\n9. Completing 2-Step MFA Authentication...");
  const currentCode = generateSync({ secret: setupData.secret });
  const authRes = await fetch(`${API_BASE}/auth/mfa/totp/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mfaToken: mfaLoginData.mfaToken,
      code: currentCode,
    }),
  });
  if (!authRes.ok) throw new Error(`MFA authenticate failed: ${await authRes.text()}`);
  const authData = (await authRes.json()) as { accessToken: string; refreshToken: string };
  if (!authData.accessToken) throw new Error("Missing access token after 2-step MFA auth");
  console.log("   ✅ 2-Step MFA challenge completed. Full session tokens issued");

  // ── 10. MFA Challenge Token Replay Prevention ─────────────────────────────
  console.log("\n10. Testing MFA Challenge Token Replay Prevention...");
  const replayRes = await fetch(`${API_BASE}/auth/mfa/totp/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mfaToken: mfaLoginData.mfaToken,
      code: currentCode,
    }),
  });
  if (replayRes.status !== 401) {
    throw new Error(`SECURITY VIOLATION: Replayed MFA challenge token accepted! Status: ${replayRes.status}`);
  }
  console.log("   ✅ Challenge token replay blocked (401)");

  // ── 11. Disable MFA (Requires TOTP Proof & Revokes Other Sessions) ─────────
  console.log("\n11. Testing Disable MFA...");
  // Create second session to verify it gets revoked on MFA disable
  const secondLoginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, authHash }),
  });
  const secondMfaToken = ((await secondLoginRes.json()) as { mfaToken: string }).mfaToken;
  const secondCode = generateSync({ secret: setupData.secret });
  const secondAuthRes = await fetch(`${API_BASE}/auth/mfa/totp/authenticate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: secondMfaToken, code: secondCode }),
  });
  const secondAccess = ((await secondAuthRes.json()) as { accessToken: string }).accessToken;

  // Disable MFA from first session using current TOTP code
  const disableCode = generateSync({ secret: setupData.secret });
  const disableRes = await fetch(`${API_BASE}/auth/mfa/totp/disable`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authData.accessToken}`,
    },
    body: JSON.stringify({ code: disableCode }),
  });
  if (!disableRes.ok) throw new Error(`Disable MFA failed: ${await disableRes.text()}`);

  // Confirm second session was revoked
  const secondSessionCheck = await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${secondAccess}` },
  });
  if (secondSessionCheck.status !== 401) {
    throw new Error("Second session was not revoked upon MFA disable!");
  }
  console.log("   ✅ MFA disabled. Other active sessions automatically revoked for security");

  // ── 12. Audit Trail Verification ──────────────────────────────────────────
  console.log("\n12. Verifying Audit Events...");
  const userRecord = await prisma.user.findUnique({ where: { email } });
  const auditEvents = await prisma.auditEvent.findMany({
    where: { userId: userRecord!.id },
    orderBy: { sequence: "asc" },
  });

  const eventTypes = auditEvents.map((e) => e.eventType);
  const requiredEvents = [
    "MFA_ENROLLMENT_STARTED",
    "MFA_ENROLLED",
    "MFA_CHALLENGE_CREATED",
    "MFA_VERIFICATION_SUCCESS",
    "MFA_DISABLED",
  ];
  for (const reqEv of requiredEvents) {
    if (!eventTypes.includes(reqEv)) {
      throw new Error(`Missing required MFA audit event: ${reqEv}`);
    }
  }

  // Ensure ZERO TOTP secrets exist in audit metadata
  for (const ev of auditEvents) {
    const metaStr = JSON.stringify(ev.metadata || {});
    if (metaStr.includes(setupData.secret)) {
      throw new Error(`SECURITY LEAK: TOTP secret found in audit log event ${ev.eventType}!`);
    }
  }
  console.log("   ✅ All MFA audit events recorded cleanly (zero secret leakage)");

  console.log("\n🎉 ALL PHASE 3.4 MFA / TOTP INTEGRATION & SECURITY TESTS PASSED!");
}

runPhase34MfaTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
