import { prisma } from "@/lib/prisma";
import { getAuthContext } from "@/lib/auth/session";
import { decryptSecret } from "@/lib/crypto/secret-box";

// Download del file .ovpn: solo con il login (qualsiasi utente attivo), mai
// durante un "vedi come", e ogni download finisce nel registro della VPN.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getAuthContext();
  if (!context) return text("Accesso richiesto", 401);
  if (context.impersonating) {
    return text("Non disponibile mentre stai vedendo l'app come un altro utente", 403);
  }

  const { id } = await params;
  const section = await prisma.vpnSection.findUnique({
    where: { id },
    select: { configFileName: true, configEncrypted: true },
  });
  if (!section?.configEncrypted) return text("Configurazione non trovata", 404);

  let content: string;
  try {
    content = decryptSecret(section.configEncrypted);
  } catch {
    return text("Configurazione non leggibile (chiave di cifratura del server cambiata?)", 500);
  }
  await prisma.vpnDownload.create({ data: { vpnSectionId: id, userId: context.user.id } });

  return new Response(content, {
    headers: {
      "Content-Type": "application/x-openvpn-profile",
      "Content-Disposition": `attachment; filename="${section.configFileName ?? "vpn.ovpn"}"`,
      "Cache-Control": "no-store, private",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function text(message: string, status: number) {
  return new Response(message, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
