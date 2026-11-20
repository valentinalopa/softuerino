-- AlterTable
ALTER TABLE "LeaveRequest" ADD COLUMN "decidedById" TEXT REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD COLUMN "decidedAt" DATETIME;

-- CreateIndex
CREATE INDEX "LeaveRequest_decidedById_idx" ON "LeaveRequest"("decidedById");
