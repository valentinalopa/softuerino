-- Il file di configurazione VPN si carica su Softuerino (cifrato) invece di
-- un link esterno: le VPN già create restano, senza file finché un super
-- admin non lo carica da "Modifica".
ALTER TABLE "VpnSection" ADD COLUMN "configFileName" TEXT;
ALTER TABLE "VpnSection" ADD COLUMN "configEncrypted" TEXT;
ALTER TABLE "VpnSection" DROP COLUMN "configUrl";

-- CreateTable
CREATE TABLE "VpnDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vpnSectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VpnDownload_vpnSectionId_fkey" FOREIGN KEY ("vpnSectionId") REFERENCES "VpnSection" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VpnDownload_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "VpnDownload_vpnSectionId_createdAt_idx" ON "VpnDownload"("vpnSectionId", "createdAt");
