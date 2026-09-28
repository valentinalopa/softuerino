-- CreateTable
CREATE TABLE "ImpersonationLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "adminId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    CONSTRAINT "ImpersonationLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ImpersonationLog_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImpersonationLog_sessionId_idx" ON "ImpersonationLog"("sessionId");

-- CreateIndex
CREATE INDEX "ImpersonationLog_startedAt_idx" ON "ImpersonationLog"("startedAt");

