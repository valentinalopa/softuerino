-- CreateTable
CREATE TABLE "CompanyClosure" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeaveRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "hours" REAL,
    "startTime" TEXT,
    "endTime" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recoveryCreditId" TEXT,
    "closureId" TEXT,
    CONSTRAINT "LeaveRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeaveRequest_recoveryCreditId_fkey" FOREIGN KEY ("recoveryCreditId") REFERENCES "RecoveryCredit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LeaveRequest_closureId_fkey" FOREIGN KEY ("closureId") REFERENCES "CompanyClosure" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_LeaveRequest" ("createdAt", "endDate", "endTime", "hours", "id", "note", "recoveryCreditId", "startDate", "startTime", "status", "type", "userId") SELECT "createdAt", "endDate", "endTime", "hours", "id", "note", "recoveryCreditId", "startDate", "startTime", "status", "type", "userId" FROM "LeaveRequest";
DROP TABLE "LeaveRequest";
ALTER TABLE "new_LeaveRequest" RENAME TO "LeaveRequest";
CREATE INDEX "LeaveRequest_userId_idx" ON "LeaveRequest"("userId");
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");
CREATE INDEX "LeaveRequest_recoveryCreditId_idx" ON "LeaveRequest"("recoveryCreditId");
CREATE INDEX "LeaveRequest_closureId_idx" ON "LeaveRequest"("closureId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CompanyClosure_startDate_endDate_idx" ON "CompanyClosure"("startDate", "endDate");
