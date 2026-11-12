-- CreateTable
CREATE TABLE "LeaveBalanceStart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "month" DATETIME NOT NULL,
    "ferieHours" REAL NOT NULL,
    "rolHours" REAL NOT NULL,
    "ferieHoursPerYear" REAL NOT NULL,
    "rolHoursPerYear" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaveBalanceStart_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'membro',
    "employmentType" TEXT NOT NULL DEFAULT 'dipendente',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "oidcSubject" TEXT,
    "reportsTo" TEXT NOT NULL DEFAULT '',
    "leaveNotify" BOOLEAN NOT NULL DEFAULT false,
    "accountNotify" BOOLEAN NOT NULL DEFAULT false,
    "hoursReminder" BOOLEAN NOT NULL DEFAULT true,
    "hoursReminderSentFor" DATETIME,
    "deactivatedAt" DATETIME,
    "projectManager" BOOLEAN NOT NULL DEFAULT false,
    "dailyHours" REAL NOT NULL DEFAULT 4
);
INSERT INTO "new_User" ("accountNotify", "active", "createdAt", "deactivatedAt", "email", "employmentType", "hoursReminder", "hoursReminderSentFor", "id", "leaveNotify", "name", "oidcSubject", "passwordHash", "projectManager", "reportsTo", "role") SELECT "accountNotify", "active", "createdAt", "deactivatedAt", "email", "employmentType", "hoursReminder", "hoursReminderSentFor", "id", "leaveNotify", "name", "oidcSubject", "passwordHash", "projectManager", "reportsTo", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_oidcSubject_key" ON "User"("oidcSubject");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalanceStart_userId_month_key" ON "LeaveBalanceStart"("userId", "month");
