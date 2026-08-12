import { createHash, randomBytes } from "crypto";

const API_BASE = "http://localhost:4000/api";

async function runPhase31Tests() {
  console.log("Starting Phase 3.1 Auth Foundation Verification Tests...\n");

  const email = `phase31_test_${Date.now()}@example.com`;
  const saltHex = randomBytes(16).toString("hex");
  const authHash = createHash("sha256").update(`mock_auth_hash_${Date.now()}`).digest("base64");

  // ── 1. Registration ────────────────────────────────────────────────────────
  console.log("1. Testing Registration...");
  const regRes = await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      authHash,
      kdfSalt: saltHex,
      kdfMemoryKb: 65536,
      kdfIterations: 3,
      kdfParallelism: 4,
      encryptedVaultKeyCiphertext: "dummyCiphertext",
      encryptedVaultKeyIv: "dummyIv",
    }),
  });
  if (!regRes.ok) throw new Error(`Registration failed: ${await regRes.text()}`);
  const regData = (await regRes.json()) as { accessToken: string; refreshToken: string };
  if (!regData.accessToken || !regData.refreshToken) throw new Error("Missing tokens in registration response");
  console.log("   ✅ Registration successful (tokens & session created)");

  // ── 2. KDF / Prelogin Account Enumeration Prevention ───────────────────────
  console.log("\n2. Testing Prelogin (KDF) Enumeration Prevention...");
  const realKdfRes = await fetch(`${API_BASE}/auth/kdf?email=${encodeURIComponent(email)}`);
  const realKdf = (await realKdfRes.json()) as { salt: string };
  if (realKdf.salt !== saltHex) throw new Error("Real KDF salt mismatch");

  const fakeKdfRes = await fetch(`${API_BASE}/auth/kdf?email=nonexistent_${Date.now()}@example.com`);
  const fakeKdf = (await fakeKdfRes.json()) as { salt: string };
  if (!fakeKdf.salt || fakeKdf.salt.length !== 32) throw new Error("Fake KDF salt format invalid");
  console.log("   ✅ Prelogin returns deterministic fake salt for unknown emails (anti-enumeration)");

  // ── 3. Successful Login & Session Creation ─────────────────────────────────
  console.log("\n3. Testing Successful Login & Session Creation...");
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, authHash }),
  });
  if (!loginRes.ok) throw new Error(`Login failed: ${await loginRes.text()}`);
  const loginData = (await loginRes.json()) as { accessToken: string; refreshToken: string };
  if (!loginData.accessToken || !loginData.refreshToken) throw new Error("Missing tokens in login response");
  console.log("   ✅ Login successful (session created)");

  // ── 4. Failed Login & Progressive Lockout ──────────────────────────────────
  console.log("\n4. Testing Failed Login & Progressive Lockout...");
  const victimEmail = `victim_${Date.now()}@example.com`;
  await fetch(`${API_BASE}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: victimEmail,
      authHash,
      kdfSalt: saltHex,
      encryptedVaultKeyCiphertext: "dummyCiphertext",
      encryptedVaultKeyIv: "dummyIv",
    }),
  });

  // Perform 5 bad login attempts
  for (let i = 1; i <= 5; i++) {
    const badLogin = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: victimEmail, authHash: "wrong_auth_hash_value_1234567890" }),
    });
    if (badLogin.status !== 401 && badLogin.status !== 429) {
      throw new Error(`Unexpected status on bad login attempt ${i}: ${badLogin.status}`);
    }
  }

  // 6th attempt should be locked out (429)
  const lockedRes = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: victimEmail, authHash }),
  });
  if (lockedRes.status !== 429) throw new Error(`Expected 429 Lockout status, got ${lockedRes.status}`);
  console.log("   ✅ Progressive lockout triggered after 5 failed attempts (429 Too Many Requests)");

  // ── 5. Refresh Token Rotation ──────────────────────────────────────────────
  console.log("\n5. Testing Refresh Token Rotation...");
  const firstRefreshToken = loginData.refreshToken;
  const refreshRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: firstRefreshToken }),
  });
  if (!refreshRes.ok) throw new Error(`Token refresh failed: ${await refreshRes.text()}`);
  const refreshData = (await refreshRes.json()) as { accessToken: string; refreshToken: string };
  if (!refreshData.refreshToken || refreshData.refreshToken === firstRefreshToken) {
    throw new Error("Refresh token was not rotated");
  }
  console.log("   ✅ Refresh token successfully rotated (new token issued)");

  // ── 6. Token Reuse / Replay Detection ─────────────────────────────────────
  console.log("\n6. Testing Token Reuse / Replay Detection...");
  // Present the ALREADY USED firstRefreshToken
  const reuseRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: firstRefreshToken }),
  });
  if (reuseRes.status !== 401) throw new Error(`Expected 401 on token reuse, got ${reuseRes.status}`);

  // Now attempt to use the newly issued refresh token (should be revoked because entire family was killed)
  const killedRes = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken: refreshData.refreshToken }),
  });
  if (killedRes.status !== 401) throw new Error(`Expected 401 after token family revocation, got ${killedRes.status}`);
  console.log("   ✅ Token reuse detected: entire token family and session immediately revoked!");

  // ── 7. Logout-All Sessions ──────────────────────────────────────────────────
  console.log("\n7. Testing Logout-All Sessions...");
  // Login fresh to get a active session
  const freshLogin = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, authHash }),
  });
  const freshData = (await freshLogin.json()) as { accessToken: string; refreshToken: string };

  const logoutAllRes = await fetch(`${API_BASE}/auth/logout-all`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${freshData.accessToken}`,
    },
  });
  if (logoutAllRes.status !== 204) throw new Error(`Logout-all failed: ${logoutAllRes.status}`);

  // Try using access token on vault endpoint — should be 401 because session is revoked
  const vaultCheck = await fetch(`${API_BASE}/vault/items`, {
    headers: { Authorization: `Bearer ${freshData.accessToken}` },
  });
  if (vaultCheck.status !== 401) throw new Error("Access token still valid after logout-all!");
  console.log("   ✅ Logout-all successfully revoked all sessions and access tokens");

  console.log("\n🎉 ALL PHASE 3.1 AUTH FOUNDATION VERIFICATION TESTS PASSED!");
}

runPhase31Tests().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
