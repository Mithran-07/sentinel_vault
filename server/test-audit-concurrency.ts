import { PrismaClient } from "@prisma/client";
import { recordAuditEvent, verifyAuditChain } from "./src/lib/audit";

const prisma = new PrismaClient();

async function main() {
  const userId = "test-user-id-" + Date.now();

  // Create dummy user for test
  await prisma.user.create({
    data: {
      id: userId,
      email: `test-${Date.now()}@example.com`,
      authHash: "dummy",
      kdfSalt: "dummy",
      encryptedVaultKeyCiphertext: "dummy",
      encryptedVaultKeyIv: "dummy",
    }
  });

  console.log(`Created test user ${userId}. Launching 20 concurrent audit writes...`);

  // Fire 20 concurrent audit records
  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(recordAuditEvent(userId, "TEST_EVENT", { i }));
  }

  await Promise.all(promises);

  console.log("All writes completed. Verifying chain...");
  const result = await verifyAuditChain(userId);
  console.log("Verification result:", result);

  if (result.valid) {
    console.log("✅ SUCCESS: The audit chain is unbroken despite concurrent writes.");
  } else {
    console.log("❌ FAILURE: The audit chain forked or broke.");
  }

  // Cleanup
  await prisma.user.delete({ where: { id: userId } });
}

main().catch(console.error).finally(() => prisma.$disconnect());
