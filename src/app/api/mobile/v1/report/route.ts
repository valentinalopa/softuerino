import { withMobileAuth } from "@/lib/mobile/http";
import { getReport } from "@/lib/services/report";

// Report/Panoramica come /panoramica del web: ore per cliente (ultimi 12 mesi)
// e assenze dell'anno. Solo admin e super admin, gli altri 403. Solo numeri ed etichette.
// Con ?userId=… gli stessi dati filtrati su quella persona (utente inesistente: 404).
export const GET = withMobileAuth(async ({ user }, req) => {
  const userId = new URL(req.url).searchParams.get("userId") || undefined;
  return { report: await getReport({ role: user.role }, new Date(), userId) };
});
