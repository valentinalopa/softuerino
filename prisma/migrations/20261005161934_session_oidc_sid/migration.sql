-- AlterTable
ALTER TABLE "Session" ADD COLUMN "oidcSid" TEXT;

-- CreateIndex
CREATE INDEX "Session_oidcSid_idx" ON "Session"("oidcSid");
