import { isOidcConfigured, verifyBackchannelLogoutToken } from "@/lib/auth/oidc";
import { revokeOidcSessions } from "@/lib/auth/session";

// OIDC Back-Channel Logout: chiamata server-to-server di Keycloak quando una
// sessione SSO finisce. Niente sessione, cookie o CSRF: l'autenticità la dà
// la firma del logout token. Il token non va mai nei log.
const NO_STORE = { "Cache-Control": "no-store" };

function badRequest(description: string) {
  return Response.json({ error: "invalid_request", error_description: description }, { status: 400, headers: NO_STORE });
}

export async function POST(request: Request) {
  if (!isOidcConfigured()) return badRequest("SSO non configurato");

  const form = await request.formData().catch(() => null);
  const logoutToken = form?.get("logout_token");
  if (typeof logoutToken !== "string" || !logoutToken) {
    return badRequest("logout_token mancante");
  }

  let sid: string;
  try {
    sid = await verifyBackchannelLogoutToken(logoutToken);
  } catch (err) {
    console.error("[oidc] back-channel logout rifiutato:", err instanceof Error ? err.message : err);
    return badRequest("logout_token non valido");
  }

  const closed = await revokeOidcSessions(sid);
  console.log(`[oidc] back-channel logout ricevuto: ${closed} sessione/i chiusa/e`);
  return new Response(null, { status: 200, headers: NO_STORE });
}
