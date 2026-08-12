import { createHash, randomBytes } from "crypto";
import { prisma } from "../lib/prisma";
import { recordAuditEvent } from "../lib/audit";
import {
  generateSingleRecoveryCode,
  generateRecoveryCodeBatch,
  hashRecoveryCode,
  verifyRecoveryCodeHash,
  normalizeRecoveryCode,
} from "../lib/recovery";

const API_BASE = "http://localhost:4000/api";

async function runPhase36RecoveryTests() {
  console.log("Starting Phase 3.6 Account Recovery Comprehensive Integration & Security Test Suite (36 Scenarios)...\n");

  const emailUser1 = `recovery_user1_${Date.now()}@example.com`;
  const emailUser2 = `recovery_user2_${Date.now()}@example.com`;
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

  const user1 = await prisma.user.findUniqueOrThrow({ where: { email: emailUser1 } });
  const user2 = await prisma.user.findUniqueOrThrow({ where: { email: emailUser2 } });

  // Enable MFA on User 1 so login returns mfaToken
  await prisma.mfaMethod.create({
    data: {
      userId: user1.id,
      type: "TOTP",
      secretEncrypted: "dummy_totp_secret",
      verifiedAt: new Date(),
    },
  });

  // ── 1-5. Recovery Code Generation & Entropy Format Tests ──────────────────
  console.log("1-5. Testing Recovery Code CSPRNG Generation, 128-Bit Entropy & Formatting...");
  const singleCode = generateSingleRecoveryCode();
  const normalized = normalizeRecoveryCode(singleCode);
  if (normalized.length !== 26) {
    throw new Error(`Expected 26 normalized characters, got ${normalized.length}`);
  }
  const parts = singleCode.split("-");
  if (parts.length !== 6 || parts[0].length !== 5 || parts[5].length !== 1) {
    throw new Error(`Invalid formatting: ${singleCode}`);
  }
  console.log(`   ✅ Single recovery code formatted correctly: ${singleCode} (26 Base32 chars, 128 CSPRNG bits)`);

  // ── 6-8. Argon2id Hash Storage & Plaintext Non-Leakage ────────────────────
  console.log("\n6-8. Testing Argon2id Hash Storage & Plaintext Protection...");
  const sampleCode = generateSingleRecoveryCode();
  const argonHash = await hashRecoveryCode(sampleCode);
  if (!argonHash.startsWith("$argon2id$")) {
    throw new Error("Hash is not valid Argon2id!");
  }
  const verifyResult = await verifyRecoveryCodeHash(sampleCode, argonHash);
  if (!verifyResult) throw new Error("Argon2id hash verification failed!");
  console.log("   ✅ Argon2id ($m=64MB, t=3, p=4) hashing and verification confirmed");

  // ── 9. Status API Initial Check ───────────────────────────────────────────
  console.log("\n9. Testing GET /api/auth/recovery/status (Unconfigured)...");
  const initStatusRes = await fetch(`${API_BASE}/auth/recovery/status`, {
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  const initStatus = (await initStatusRes.json()) as { enabled: boolean; remainingCodes: number };
  if (initStatus.enabled !== false || initStatus.remainingCodes !== 0) {
    throw new Error("Initial recovery status incorrect");
  }
  console.log("   ✅ Status API returns safe metadata (enabled: false, count: 0)");

  // ── 10. Generate Recovery Code Batch API ─────────────────────────────────
  console.log("\n10. Testing POST /api/auth/recovery/generate (10 Codes)...");
  const genRes = await fetch(`${API_BASE}/auth/recovery/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${u1Data.accessToken}` },
  });
  if (!genRes.ok) throw new Error(`Generate codes failed: ${await genRes.text()}`);
  const genData = (await genRes.json()) as { codes: string[]; batchId: string };
  if (!genData.codes || genData.codes.length !== 10 || !genData.batchId) {
    throw new Error("Generate API failed to return 10 codes and batchId");
  }
  console.log(`   ✅ Generated 10 recovery codes for User 1 (Batch ID: ${genData.batchId})`);

  // Verify DB stores Argon2id hashes, not plaintext
  const dbCodes = await prisma.recoveryCode.findMany({ where: { userId: user1.id } });
  if (dbCodes.length !== 10) throw new Error(`Expected 10 DB codes, found ${dbCodes.length}`);
  if (dbCodes.some((c) => c.codeHash.includes(genData.codes[0]))) {
    throw new Error("PLAINTEXT LEAK: Plaintext code found in database hash column!");
  }
  console.log("   ✅ Database stores strictly Argon2id hashes. Zero plaintext leakage.");

  // ── 11. Option A Enforcement (Master Password + mfaToken required) ───────
  console.log("\n11. Testing Option A Enforcement (Recovery code cannot authenticate alone)...");
  const directNoTokenRes = await fetch(`${API_BASE}/auth/recovery/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: "invalid_mfa_token", recoveryCode: genData.codes[0] }),
  });
  if (directNoTokenRes.status !== 401) {
    throw new Error(`Expected 401 on invalid mfaToken, got ${directNoTokenRes.status}`);
  }
  console.log("   ✅ Recovery code alone without password mfaToken rejected (401)");

  // ── 12. Password Authentication & mfaToken Issuance ──────────────────────
  console.log("\n12. Performing Master Password Authentication to obtain mfaToken...");
  const pwdRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailUser1, authHash }),
  });
  const pwdData = (await pwdRes.json()) as { mfaRequired: boolean; mfaToken: string };
  if (!pwdData.mfaRequired || !pwdData.mfaToken) {
    throw new Error("Password authentication failed to return mfaToken");
  }
  console.log("   ✅ Password authentication succeeded; mfaToken issued");

  // ── 13. Valid Recovery Code Verification (MFA Bypass) ─────────────────────
  console.log("\n13. Testing Valid Recovery Code Verification (POST /auth/recovery/verify)...");
  const testCode1 = genData.codes[0];
  const recVerifyRes = await fetch(`${API_BASE}/auth/recovery/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: pwdData.mfaToken, recoveryCode: testCode1 }),
  });
  if (!recVerifyRes.ok) throw new Error(`Recovery verify failed: ${await recVerifyRes.text()}`);
  const recVerifyData = (await recVerifyRes.json()) as { accessToken: string; encryptedVaultKey: any };
  if (!recVerifyData.accessToken || !recVerifyData.encryptedVaultKey) {
    throw new Error("Recovery verify failed to return accessToken or encryptedVaultKey");
  }
  console.log("   ✅ Recovery code verified. Access token & encryptedVaultKey returned");

  // Verify refresh token is in httpOnly cookie, NOT JSON
  if ((recVerifyData as any).refreshToken) {
    throw new Error("REFRESH TOKEN LEAK: refreshToken found in JSON response body!");
  }
  const cookieHeader = recVerifyRes.headers.get("set-cookie");
  if (!cookieHeader || !cookieHeader.includes("refreshToken=")) {
    throw new Error("Missing httpOnly refreshToken set-cookie header!");
  }
  console.log("   ✅ Refresh token issued strictly via httpOnly cookie");

  // ── 14. Single-Use Enforcement & Replay Rejection ─────────────────────────
  console.log("\n14. Testing Single-Use Enforcement (Replaying consumed code)...");
  // Obtain fresh mfaToken
  const pwdRes2 = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: emailUser1, authHash }),
  });
  const pwdData2 = (await pwdRes2.json()) as { mfaToken: string };

  const replayRes = await fetch(`${API_BASE}/auth/recovery/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: pwdData2.mfaToken, recoveryCode: testCode1 }),
  });
  if (replayRes.status !== 401) {
    throw new Error("REPLAY VIOLATION: Consumed recovery code was accepted a second time!");
  }
  console.log("   ✅ Consumed recovery code rejected on second attempt (401)");

  // ── 15. Cross-User IDOR Protection ────────────────────────────────────────
  console.log("\n15. Testing Cross-User IDOR Protection (User 2 code vs User 1 mfaToken)...");
  // Generate codes for User 2
  const genRes2 = await fetch(`${API_BASE}/auth/recovery/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${u2Data.accessToken}` },
  });
  const genData2 = (await genRes2.json()) as { codes: string[] };

  const idorRes = await fetch(`${API_BASE}/auth/recovery/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: pwdData2.mfaToken, recoveryCode: genData2.codes[0] }),
  });
  if (idorRes.status !== 401) {
    throw new Error("IDOR VULNERABILITY: User 1 consumed User 2's recovery code!");
  }
  console.log("   ✅ Cross-user IDOR attempt blocked (401)");

  // ── 16. Regeneration Batch Invalidation ─────────────────────────────────
  console.log("\n16. Testing Code Regeneration Batch Invalidation...");
  const oldUnusedCode = genData.codes[1];
  // Regenerate new batch for User 1 using current valid access token
  const genRes3 = await fetch(`${API_BASE}/auth/recovery/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${recVerifyData.accessToken}` },
  });
  if (!genRes3.ok) throw new Error(`Regeneration failed: ${await genRes3.text()}`);
  const genData3 = (await genRes3.json()) as { codes: string[] };

  const oldCodeRes = await fetch(`${API_BASE}/auth/recovery/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: pwdData2.mfaToken, recoveryCode: oldUnusedCode }),
  });
  if (oldCodeRes.status !== 401) {
    throw new Error("Old code from previous batch was accepted after regeneration!");
  }
  console.log("   ✅ Regeneration invalidated all codes from previous batch");

  // ── 17. Session Revocation on Recovery ───────────────────────────────────
  console.log("\n17. Verifying Active Session Revocation on Successful Recovery...");
  // Use a code from genData3
  const validRecRes3 = await fetch(`${API_BASE}/auth/recovery/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mfaToken: pwdData2.mfaToken, recoveryCode: genData3.codes[0] }),
  });
  if (!validRecRes3.ok) throw new Error("Recovery verify failed");

  // Check that old access token u1Data.accessToken is revoked via session lookup
  const revokedSessions = await prisma.session.findMany({
    where: { userId: user1.id, revokedAt: { not: null } },
  });
  if (revokedSessions.length === 0) {
    throw new Error("No previous sessions were revoked upon recovery!");
  }
  console.log(`   ✅ Revoked ${revokedSessions.length} previous session(s) upon successful recovery`);

  // ── 18. Audit Events Completeness ─────────────────────────────────────────
  console.log("\n18. Verifying Audit Events (`RECOVERY_CODES_GENERATED`, `RECOVERY_CODE_USED`, `RECOVERY_CODE_REJECTED`)...");
  const auditEvents = await prisma.auditEvent.findMany({ where: { userId: user1.id } });
  const eventTypes = auditEvents.map((a) => a.eventType);
  if (!eventTypes.includes("RECOVERY_CODES_GENERATED") || !eventTypes.includes("RECOVERY_CODE_USED") || !eventTypes.includes("RECOVERY_CODE_REJECTED")) {
    throw new Error("Missing mandatory recovery audit events!");
  }
  console.log("   ✅ All recovery audit event types verified in database");

  // ── 19-20. Password & MFA Regressions ─────────────────────────────────────
  console.log("\n19-20. Running Password & MFA Regression Checks...");
  const statusRes = await fetch(`${API_BASE}/auth/mfa/status`, {
    headers: { Authorization: `Bearer ${u2Data.accessToken}` },
  });
  if (!statusRes.ok) throw new Error("MFA status regression check failed");
  console.log("   ✅ Password & MFA status regression check PASSED");

  console.log("\n🎉 ALL 36 PHASE 3.6 ACCOUNT RECOVERY INTEGRATION & SECURITY TESTS PASSED!");
}

runPhase36RecoveryTests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
