-- Licenze condivise tra più reparti o visibili a tutti; account (di acquisto
-- o di accesso) e password, cifrati; il registro accessi distingue chiave,
-- password e account.
ALTER TABLE "License" ADD COLUMN "visibleToAll" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "License" ADD COLUMN "accountEncrypted" TEXT;
ALTER TABLE "License" ADD COLUMN "accountHint" TEXT;
ALTER TABLE "License" ADD COLUMN "passwordEncrypted" TEXT;
ALTER TABLE "LicenseKeyAccess" ADD COLUMN "field" TEXT NOT NULL DEFAULT 'key';

CREATE TABLE "LicenseDepartment" (
    "licenseId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,

    PRIMARY KEY ("licenseId", "departmentId"),
    CONSTRAINT "LicenseDepartment_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LicenseDepartment_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "LicenseDepartment_departmentId_idx" ON "LicenseDepartment"("departmentId");
