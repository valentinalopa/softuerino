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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_User" ("active", "createdAt", "email", "employmentType", "id", "name", "passwordHash", "role") SELECT "active", "createdAt", "email", "employmentType", "id", "name", "passwordHash", "role" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Rinomina il ruolo "dipendente" in "membro" sui dati esistenti, per non
-- confonderlo con l'employmentType (dipendente | partita_iva).
UPDATE "User" SET "role" = 'membro' WHERE "role" = 'dipendente';
