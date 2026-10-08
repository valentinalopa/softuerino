-- Permessi dei responsabili di reparto (per reparto) e responsabili ferie.
ALTER TABLE "Department" ADD COLUMN "managerPermissions" TEXT NOT NULL DEFAULT 'licenze,presenze_ore';
ALTER TABLE "User" ADD COLUMN "leaveNotify" BOOLEAN NOT NULL DEFAULT false;
