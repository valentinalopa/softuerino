-- Organigramma da Keycloak: incarico di manager per reparto (claim manager_of)
-- e reparti a cui si fa capo (claim reports_to). Colonne aggiunte senza
-- ricreare le tabelle.
ALTER TABLE "User" ADD COLUMN "reportsTo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "UserDepartment" ADD COLUMN "isManager" BOOLEAN NOT NULL DEFAULT false;

-- Il ruolo locale "manager" non esiste più: chi è manager di quale reparto lo
-- dice Keycloak. Gli utenti con quel ruolo tornano membri.
UPDATE "User" SET "role" = 'membro' WHERE "role" = 'manager';
