import "server-only";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { ForbiddenError } from "@/lib/task-archive";
import { NotFoundError } from "@/lib/services/errors";

// VPN per l'app (F6 T3, decisione elemento #351). Come il web: qualsiasi utente
// attivo vede i profili e scarica il .ovpn, mai durante un "vedi come"; ogni
// download finisce nel registro (VpnDownload). La gestione (crea, modifica,
// elimina, registro) resta solo web, ai super admin.
export type VpnProfileView = {
  id: string;
  name: string;
  notes: string | null;
  fileName: string | null;
  hasConfig: boolean;
};

export async function listVpnProfiles(): Promise<VpnProfileView[]> {
  const rows = await prisma.vpnSection.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, notes: true, configFileName: true, configEncrypted: true },
  });
  return rows
    .sort((a, b) => a.name.localeCompare(b.name, "it"))
    .map((r) => ({
      id: r.id,
      name: r.name,
      notes: r.notes,
      fileName: r.configFileName,
      hasConfig: Boolean(r.configEncrypted),
    }));
}

export async function downloadVpnConfig(actor: { id: string; impersonating: boolean }, id: string) {
  if (actor.impersonating) {
    throw new ForbiddenError("Non disponibile mentre stai vedendo l'app come un altro utente");
  }
  const section = await prisma.vpnSection.findUnique({
    where: { id },
    select: { configFileName: true, configEncrypted: true },
  });
  if (!section?.configEncrypted) throw new NotFoundError("Configurazione non trovata");
  const content = decryptSecret(section.configEncrypted);
  await prisma.vpnDownload.create({ data: { vpnSectionId: id, userId: actor.id } });
  return { fileName: section.configFileName ?? "vpn.ovpn", content };
}
