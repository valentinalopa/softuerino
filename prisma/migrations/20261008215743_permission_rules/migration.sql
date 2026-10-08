-- Permessi per ruolo (generali) e per reparto, richieste di nuovi utenti.
CREATE TABLE "PermissionSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "rules" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- I reparti con permessi diversi dai predefiniti diventano reparti
-- personalizzati con le stesse scelte (responsabili sul proprio reparto).
ALTER TABLE "Department" ADD COLUMN "permissions" TEXT;
UPDATE "Department" SET "permissions" = json_object(
  'licenze_vedere', json_object('membro', 'no', 'responsabile', CASE WHEN instr("managerPermissions", 'licenze') > 0 THEN 'reparto' ELSE 'no' END),
  'licenze_gestire', json_object('membro', 'no', 'responsabile', CASE WHEN instr("managerPermissions", 'licenze') > 0 THEN 'reparto' ELSE 'no' END),
  'presenze_ore', json_object('membro', 'no', 'responsabile', CASE WHEN instr("managerPermissions", 'presenze_ore') > 0 THEN 'reparto' ELSE 'no' END),
  'richieste', json_object('membro', 'no', 'responsabile', CASE WHEN instr("managerPermissions", 'richieste') > 0 OR instr("managerPermissions", 'approvare') > 0 THEN 'reparto' ELSE 'no' END),
  'approvare', json_object('membro', 'no', 'responsabile', CASE WHEN instr("managerPermissions", 'approvare') > 0 THEN 'reparto' ELSE 'no' END),
  'utenti', json_object('membro', 'no', 'responsabile', CASE WHEN instr("managerPermissions", 'nuovi_membri') > 0 THEN 'tutti' ELSE 'no' END),
  'clienti', json_object('membro', 'no', 'responsabile', 'no')
)
WHERE "managerPermissions" <> 'licenze,presenze_ore';
ALTER TABLE "Department" DROP COLUMN "managerPermissions";

ALTER TABLE "User" ADD COLUMN "accountNotify" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "AccountRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "departmentId" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "requestedById" TEXT,
    "handledById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "handledAt" DATETIME,
    CONSTRAINT "AccountRequest_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AccountRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AccountRequest_status_createdAt_idx" ON "AccountRequest"("status", "createdAt");
