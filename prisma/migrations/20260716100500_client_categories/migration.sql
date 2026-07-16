-- Sostituisce il flag hasPed con le categorie di servizio del cliente
-- (CSV: comunicazione | it_design | produzione). I clienti che avevano il PED
-- attivo diventano "comunicazione".

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "categories" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Client" ("id", "name", "active", "categories", "createdAt")
SELECT "id", "name", "active",
       CASE WHEN "hasPed" THEN 'comunicazione' ELSE '' END,
       "createdAt"
FROM "Client";
DROP TABLE "Client";
ALTER TABLE "new_Client" RENAME TO "Client";
CREATE UNIQUE INDEX "Client_name_key" ON "Client"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
