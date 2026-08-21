/*
  Warnings:

  - Made the column `walletId` on table `VaultItem` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "VaultItem" ALTER COLUMN "walletId" SET NOT NULL;
