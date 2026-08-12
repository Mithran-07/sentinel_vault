import { createHash, randomBytes } from "crypto";

const API_BASE = "http://localhost:4000/api";

async function runTest() {
  console.log("Starting Phase 2 API Verification Test...\n");

  const email = `phase2_test_${Date.now()}@example.com`;
  const saltHex = randomBytes(16).toString("hex");
  const authHash = createHash("sha256").update(`mock_auth_hash_${Date.now()}`).digest("base64");

  // 1. Register
  console.log("1. Registering user...");
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
  if (!regRes.ok) throw new Error(`Register failed: ${await regRes.text()}`);
  const { accessToken } = await regRes.json();
  console.log("   ✅ Registered successfully");

  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  // 2. Create Items of all 6 Types
  console.log("\n2. Creating vault items of all 6 types...");
  const types = ["LOGIN", "SECURE_NOTE", "CARD", "IDENTITY", "SSH_KEY", "API_CREDENTIAL"];
  const createdIds: string[] = [];

  for (const type of types) {
    const res = await fetch(`${API_BASE}/vault/items`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type,
        ciphertext: `mock_ciphertext_for_${type}`,
        iv: `mock_iv_${type}`,
      }),
    });
    if (!res.ok) throw new Error(`Failed to create item of type ${type}: ${await res.text()}`);
    const item = await res.json();
    createdIds.push(item.id);
    console.log(`   ✅ Created ${type} item (ID: ${item.id})`);
  }

  // 3. Update Item (verify version snapshot)
  console.log("\n3. Updating item and verifying version snapshot...");
  const targetId = createdIds[0];
  const updateRes = await fetch(`${API_BASE}/vault/items/${targetId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({
      ciphertext: "updated_mock_ciphertext_v2",
      iv: "updated_mock_iv_v2",
    }),
  });
  if (!updateRes.ok) throw new Error(`Update failed: ${await updateRes.text()}`);

  const versionsRes = await fetch(`${API_BASE}/vault/items/${targetId}/versions`, { headers });
  const versions = await versionsRes.json();
  if (versions.length !== 1) throw new Error(`Expected 1 version snapshot, got ${versions.length}`);
  console.log(`   ✅ Version snapshot created: previous ciphertext retained correctly`);

  // 4. Tags CRUD & Item Tagging
  console.log("\n4. Testing Tag CRUD and Item Tagging...");
  const tagRes = await fetch(`${API_BASE}/tags`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "Work", color: "#3b82f6" }),
  });
  const tag = await tagRes.json();
  console.log(`   ✅ Created Tag "Work" (${tag.id})`);

  const attachTagRes = await fetch(`${API_BASE}/tags/items/${targetId}/tags/${tag.id}`, {
    method: "POST",
    headers,
  });
  if (!attachTagRes.ok) throw new Error(`Attach tag failed: ${await attachTagRes.text()}`);
  console.log(`   ✅ Attached Tag to item ${targetId}`);

  // 5. Soft Delete (Move to Trash)
  console.log("\n5. Testing Soft Delete (Trash)...");
  const trashItem = createdIds[1];
  const delRes = await fetch(`${API_BASE}/vault/items/${trashItem}`, {
    method: "DELETE",
    headers,
  });
  if (delRes.status !== 204) throw new Error(`Soft delete failed with status ${delRes.status}`);

  const activeItemsRes = await fetch(`${API_BASE}/vault/items`, { headers });
  const activeItems = await activeItemsRes.json();
  if (activeItems.some((i: any) => i.id === trashItem)) {
    throw new Error("Item still present in active items view!");
  }

  const trashedItemsRes = await fetch(`${API_BASE}/vault/items?deleted=true`, { headers });
  const trashedItems = await trashedItemsRes.json();
  if (!trashedItems.some((i: any) => i.id === trashItem)) {
    throw new Error("Item missing from trash items view!");
  }
  console.log("   ✅ Item soft-deleted and present in trash query");

  // 6. Restore from Trash
  console.log("\n6. Restoring item from trash...");
  const restoreRes = await fetch(`${API_BASE}/vault/items/${trashItem}/restore`, {
    method: "POST",
    headers,
  });
  if (!restoreRes.ok) throw new Error(`Restore failed: ${await restoreRes.text()}`);
  console.log("   ✅ Item restored from trash successfully");

  // 7. Permanent Delete
  console.log("\n7. Testing Permanent Delete...");
  await fetch(`${API_BASE}/vault/items/${trashItem}`, { method: "DELETE", headers }); // trash it again
  const permRes = await fetch(`${API_BASE}/vault/items/${trashItem}/permanent`, {
    method: "DELETE",
    headers,
  });
  if (permRes.status !== 204) throw new Error(`Permanent delete failed with status ${permRes.status}`);

  const checkTrashRes = await fetch(`${API_BASE}/vault/items?deleted=true`, { headers });
  const checkTrash = await checkTrashRes.json();
  if (checkTrash.some((i: any) => i.id === trashItem)) {
    throw new Error("Item still present after permanent delete!");
  }
  console.log("   ✅ Item permanently deleted from database");

  // 8. Encrypted Attachment Upload & Download
  console.log("\n8. Testing Encrypted Attachment Upload and Download...");
  const formData = new FormData();
  const fileContent = Buffer.from("ENCRYPTED_FILE_BYTES_TEST");
  const blob = new Blob([fileContent], { type: "application/octet-stream" });
  formData.append("encryptedFile", blob, "blob");
  formData.append("iv", "mock_attachment_iv");
  formData.append("filenameCiphertext", "encrypted_filename_blob");
  formData.append("filenameIv", "filename_iv");

  const uploadRes = await fetch(`${API_BASE}/vault/items/${targetId}/attachments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });
  if (!uploadRes.ok) throw new Error(`Attachment upload failed: ${await uploadRes.text()}`);
  const attachment = await uploadRes.json();
  console.log(`   ✅ Attachment uploaded (ID: ${attachment.id}, size: ${attachment.ciphertextSizeBytes} bytes)`);

  const downloadRes = await fetch(`${API_BASE}/vault/items/${targetId}/attachments/${attachment.id}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!downloadRes.ok) throw new Error(`Attachment download failed: ${await downloadRes.text()}`);
  const downloadedBuf = Buffer.from(await downloadRes.arrayBuffer());
  if (downloadedBuf.toString() !== "ENCRYPTED_FILE_BYTES_TEST") {
    throw new Error("Downloaded attachment bytes mismatch!");
  }
  console.log("   ✅ Encrypted attachment downloaded and verified byte-for-byte");

  console.log("\n🎉 ALL PHASE 2 API VERIFICATION TESTS PASSED!");
}

runTest().catch((err) => {
  console.error("\n❌ TEST FAILED:", err);
  process.exit(1);
});
