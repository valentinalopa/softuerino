import { withMobileAuth } from "@/lib/mobile/http";
import { getOwnBalance } from "@/lib/services/leave";

// Saldi ferie/permessi (o assenze, per le partite IVA) dell'anno corrente:
// gli stessi numeri della pagina Richieste del web.
export const GET = withMobileAuth(async ({ user }) =>
  getOwnBalance({ id: user.id, role: user.role, employmentType: user.employmentType })
);
