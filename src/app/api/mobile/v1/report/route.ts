import { withMobileAuth } from "@/lib/mobile/http";
import { getReport } from "@/lib/services/report";

// Report/Panoramica come /panoramica del web: ore per cliente (ultimi 12 mesi)
// e assenze dell'anno. Solo admin e super admin, gli altri 403. Solo numeri ed etichette.
export const GET = withMobileAuth(async ({ user }) => {
  return { report: await getReport({ role: user.role }) };
});
