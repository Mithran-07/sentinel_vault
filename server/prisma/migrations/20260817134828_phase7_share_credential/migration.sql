-- CreateTable
CREATE TABLE "SharedCredential" (
    "id" TEXT NOT NULL,
    "vaultItemId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "ciphertext" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SharedCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SharedCredential_id_idx" ON "SharedCredential"("id");

-- CreateIndex
CREATE INDEX "SharedCredential_creatorId_idx" ON "SharedCredential"("creatorId");

-- CreateIndex
CREATE INDEX "SharedCredential_vaultItemId_idx" ON "SharedCredential"("vaultItemId");

-- CreateIndex
CREATE INDEX "SharedCredential_expiresAt_idx" ON "SharedCredential"("expiresAt");

-- AddForeignKey
ALTER TABLE "SharedCredential" ADD CONSTRAINT "SharedCredential_vaultItemId_fkey" FOREIGN KEY ("vaultItemId") REFERENCES "VaultItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SharedCredential" ADD CONSTRAINT "SharedCredential_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
