-- CreateTable
CREATE TABLE "ClientLogger" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "clientId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "ClientLogger_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ClientLogger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categories" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "parentId" TEXT,
    CONSTRAINT "Client_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Client" ("active", "categories", "createdAt", "id", "name") SELECT "active", "categories", "createdAt", "id", "name" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");
CREATE INDEX "Client_parentId_idx" ON "Client"("parentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ClientLogger_userId_idx" ON "ClientLogger"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientLogger_clientId_userId_key" ON "ClientLogger"("clientId", "userId");
