-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "clientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "priority" TEXT,
    "dueDate" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Task" ("clientId", "completedAt", "createdAt", "dueDate", "id", "priority", "status", "title") SELECT "clientId", "completedAt", "createdAt", "dueDate", "id", "priority", "status", "title" FROM "Task";
DROP TABLE "Task";
ALTER TABLE "new_Task" RENAME TO "Task";
CREATE INDEX "Task_clientId_idx" ON "Task"("clientId");
CREATE INDEX "Task_status_completedAt_idx" ON "Task"("status", "completedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
