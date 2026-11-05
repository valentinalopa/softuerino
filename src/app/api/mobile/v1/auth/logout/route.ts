import { withMobileAuth } from "@/lib/mobile/http";
import { revokeBearerSession } from "@/lib/auth/session";

// Revoca la sessione del token usato nella richiesta.
export const POST = withMobileAuth(
  async () => {
    await revokeBearerSession();
    return new Response(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
  },
  // Revocare è sempre ammesso, anche a un super admin dal percorso pubblico.
  { allowPublicSuperAdmin: true }
);
