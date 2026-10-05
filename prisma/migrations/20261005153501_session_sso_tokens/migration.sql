-- AlterTable
ALTER TABLE "Session" ADD COLUMN "idToken" TEXT;
ALTER TABLE "Session" ADD COLUMN "refreshToken" TEXT;
ALTER TABLE "Session" ADD COLUMN "ssoCheckedAt" DATETIME;
