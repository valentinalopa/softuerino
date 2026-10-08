-- La chiave di una licenza si vede solo indicando dove viene usata
-- (un'attivazione): ogni accesso ne tiene il riferimento e il nome.
ALTER TABLE "LicenseKeyAccess" ADD COLUMN "activationId" TEXT REFERENCES "LicenseActivation" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LicenseKeyAccess" ADD COLUMN "usedFor" TEXT;
