import "server-only";
import {
  exchangeCode as realExchangeCode,
  MOBILE_REDIRECT_URI,
  OidcError,
  resolveOidcUser,
} from "@/lib/auth/oidc";
import { issueSessionToken } from "@/lib/auth/session";
import { apiError } from "@/lib/mobile/http";

type Deps = { exchangeCode: typeof realExchangeCode };

const isString = (v: unknown, min: number, max: number): v is string =>
  typeof v === "string" && v.length >= min && v.length <= max;

// POST /api/mobile/v1/auth/token { code, codeVerifier, redirectUri[, nonce] }
// L'app ha fatto il login su Keycloak (browser di sistema, PKCE) e porta qui il
// codice: lo scambiamo noi, così il token Keycloak non resta sul dispositivo.
// Restituisce un token di sessione Softuerino (hash nel DB, vedi session.ts).
export async function mobileTokenLogin(
  body: unknown,
  deps: Deps = { exchangeCode: realExchangeCode }
): Promise<Response> {
  const input = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;
  const { code, codeVerifier, redirectUri, nonce } = input;

  // Verifier PKCE: 43-128 caratteri (RFC 7636).
  if (!isString(code, 1, 2048) || !isString(codeVerifier, 43, 128) || !isString(redirectUri, 1, 512)) {
    return apiError(400, "invalid_request", "Richiesta incompleta: servono code, codeVerifier e redirectUri.");
  }
  if (nonce !== undefined && !isString(nonce, 1, 512)) {
    return apiError(400, "invalid_request", "Parametro nonce non valido.");
  }
  if (redirectUri !== MOBILE_REDIRECT_URI) {
    return apiError(400, "invalid_request", "redirectUri non ammesso.");
  }

  try {
    const { claims, tokens } = await deps.exchangeCode(code, codeVerifier, redirectUri, nonce);
    // provision=false: dall'app non si collegano né si creano utenti.
    const { user } = await resolveOidcUser(claims, tokens, { provision: false });

    // Il super admin riceve il token anche da fuori rete: la sessione mobile
    // segue la stessa regola del web (getAuthContext lo tratta da admin se la
    // richiesta non arriva da una rete fidata, elementi #310 e #314).

    // Si conserva solo il refresh_token (cifrato) per la verifica periodica con
    // Keycloak; l'id_token all'app non serve (minimizzazione).
    const { token, expiresAt } = await issueSessionToken(user.id, {
      authMethod: "oidc",
      client: "ios",
      oidcSid: tokens.sid,
      refreshToken: tokens.refreshToken,
    });

    return Response.json(
      {
        token,
        expiresAt: expiresAt.toISOString(),
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (err) {
    if (err instanceof OidcError) {
      switch (err.code) {
        case "failed":
          return apiError(401, "invalid_grant", "Codice di accesso non valido o scaduto.");
        case "inactive":
          return apiError(403, "inactive", "Il tuo utente è disattivato.");
        case "first_login_required":
          return apiError(
            403,
            "first_login_required",
            "Prima di usare l'app fai il primo accesso a Softuerino dal sito."
          );
        default:
          return apiError(403, err.code, "Accesso non consentito.");
      }
    }
    console.error("[mobile-api] login non riuscito:", err instanceof Error ? err.message : err);
    return apiError(500, "internal_error", "Errore imprevisto. Riprova più tardi.");
  }
}
