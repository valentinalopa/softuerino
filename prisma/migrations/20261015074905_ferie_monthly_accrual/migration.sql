-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeaveBalanceAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "amount" REAL NOT NULL,
    "setAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LeaveBalanceAdjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
-- Ferie a maturazione mensile: le rettifiche già salvate valevano "residuo −
-- monte annuale (26) + goduto"; il residuo scritto era maturato − goduto a
-- quella data, quindi ora valgono "residuo + goduto" e da lì maturano i mesi
-- successivi. setAt = ultimo salvataggio della rettifica.
INSERT INTO "new_LeaveBalanceAdjustment" ("amount", "id", "kind", "setAt", "updatedAt", "userId", "year") SELECT CASE WHEN "kind" = 'ferie' THEN "amount" + 26 ELSE "amount" END, "id", "kind", "updatedAt", "updatedAt", "userId", "year" FROM "LeaveBalanceAdjustment";
DROP TABLE "LeaveBalanceAdjustment";
ALTER TABLE "new_LeaveBalanceAdjustment" RENAME TO "LeaveBalanceAdjustment";
CREATE UNIQUE INDEX "LeaveBalanceAdjustment_userId_year_kind_key" ON "LeaveBalanceAdjustment"("userId", "year", "kind");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
