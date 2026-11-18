import { withMobileAuth } from "@/lib/mobile/http";
import { listPendingApprovals } from "@/lib/services/leave";

// Le richieste in attesa che l'utente può decidere, come la vista web "Da
// approvare": admin tutte tranne le proprie; responsabili quelle delle persone
// su cui hanno il permesso "Approvare", senza malattia e 104. Ogni richiesta ha
// `version`, da rimandare nel POST /leave-requests/{id}/decision.
// Segmento statico: Next.js lo preferisce a [id], niente collisione.
export const GET = withMobileAuth(async ({ user, impersonating }) => {
  const requests = await listPendingApprovals({
    id: user.id,
    role: user.role,
    employmentType: user.employmentType,
    impersonating,
  });
  return { requests };
});
