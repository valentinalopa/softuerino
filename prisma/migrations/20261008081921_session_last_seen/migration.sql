-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "authMethod" TEXT,
    "idToken" TEXT,
    "refreshToken" TEXT,
    "ssoCheckedAt" DATETIME,
    "oidcSid" TEXT,
    "impersonatedUserId" TEXT,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Session_impersonatedUserId_fkey" FOREIGN KEY ("impersonatedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Session" ("authMethod", "createdAt", "expiresAt", "id", "idToken", "impersonatedUserId", "oidcSid", "refreshToken", "ssoCheckedAt", "token", "userId") SELECT "authMethod", "createdAt", "expiresAt", "id", "idToken", "impersonatedUserId", "oidcSid", "refreshToken", "ssoCheckedAt", "token", "userId" FROM "Session";
DROP TABLE "Session";
ALTER TABLE "new_Session" RENAME TO "Session";
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_oidcSid_idx" ON "Session"("oidcSid");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
