-- CreateTable
CREATE TABLE "EmailSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "security" TEXT NOT NULL DEFAULT 'starttls',
    "username" TEXT NOT NULL DEFAULT '',
    "passwordEncrypted" TEXT,
    "fromAddress" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT 'Softuerino',
    "appUrl" TEXT NOT NULL DEFAULT '',
    "updatedAt" DATETIME NOT NULL
);
