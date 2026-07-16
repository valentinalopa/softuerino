-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hasPed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Client" ("active", "createdAt", "id", "name") SELECT "active", "createdAt", "id", "name" FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- I clienti che hanno già contenuti PED sono evidentemente "comunicazione":
-- il flag parte attivo per loro, spento per tutti gli altri.
UPDATE "Client" SET "hasPed" = true
WHERE "id" IN (SELECT DISTINCT "clientId" FROM "PedContent");
