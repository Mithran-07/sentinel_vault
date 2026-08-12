-- AlterTable
ALTER TABLE "Session" ADD COLUMN     "deviceType" TEXT DEFAULT 'desktop',
ADD COLUMN     "isSuspicious" BOOLEAN NOT NULL DEFAULT false;
