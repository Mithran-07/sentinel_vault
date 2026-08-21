-- AlterTable
ALTER TABLE "VaultItem" ADD COLUMN     "walletId" TEXT;

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'INTERNAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VaultItem" ADD CONSTRAINT "VaultItem_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── DATA BACKFILL ────────────────────────────────────────────────────────────
-- 1. Create a default Personal wallet for every existing user
INSERT INTO "Wallet" ("id", "userId", "name", "isDefault", "type", "createdAt", "updatedAt")
SELECT gen_random_uuid(), "id", 'Personal', true, 'INTERNAL', now(), now()
FROM "User";

-- 2. Assign all existing VaultItems to their owner's default Personal wallet
UPDATE "VaultItem" vi
SET "walletId" = w."id"
FROM "Wallet" w
WHERE vi."userId" = w."userId" AND w."isDefault" = true;
