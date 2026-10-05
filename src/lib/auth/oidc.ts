import "server-only";
import { randomBytes } from "crypto";
import * as client from "openid-client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

// Login con Keycloak (OpenID Connect, Authorization Code + PKCE, client
// confidenziale). Configurazione solo da ambiente:
//   OIDC_ISSUER          es. https://sso.esempio.it/realms/azienda
//   OIDC_CLIENT_ID       es. softuerino
//   OIDC_CLIENT_SECRET   segreto del client confidenziale
//   OIDC_REDIRECT_URI    es. https://softuerino.esempio.it/api/auth/oidc/callback
//   OIDC_ALLOWED_GROUP   (opzionale) gruppo Keycloak richiesto per entrare
// Senza le prime quattro il login SSO non compare.

export const OIDC_FLOW_COOKIE = "softuerino_oidc";
export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";

function env() {
  return {
    issuer: process.env.OIDC_ISSUER ?? "",
    clientId: process.env.OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
    redirectUri: process.env.OIDC_REDIRECT_URI ?? "",
    allowedGroup: (process.env.OIDC_ALLOWED_GROUP ?? "").replace(/^\/+/, ""),
  };
}

export function isOidcConfigured() {
  const { issuer, clientId, clientSecret, redirectUri } = env();
  return Boolean(issuer && clientId && clientSecret && redirectUri);
}

// Discovery una sola volta per processo; se fallisce (Keycloak giù) si
// riprova alla richiesta successiva.
let configPromise: Promise<client.Configuration> | null = null;

function getConfig() {
  if (!configPromise) {
    const { issuer, clientId, clientSecret } = env();
    configPromise = client
      // timeout (secondi) anche per le richieste successive: se Keycloak è lento
      // una pagina non resta appesa (vedi refreshOidcSession).
      .discovery(new URL(issuer), clientId, undefined, client.ClientSecretBasic(clientSecret), {
        timeout: 5,
      })
      .catch((err) => {
        configPromise = null;
        throw err;
      });
  }
  return configPromise;
}

// Dati del flusso salvati nel cookie temporaneo tra login e callback.
export type OidcFlow = { state: string; nonce: string; verifier: string };

export async function startOidcLogin() {
  const config = await getConfig();
  const flow: OidcFlow = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    verifier: client.randomPKCECodeVerifier(),
  };
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: env().redirectUri,
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: "S256",
  });
  return { url, flow };
}

export type OidcTokens = { idToken: string | null; refreshToken: string | null };

export type OidcLoginError =
  | "not_allowed" // non appartiene al gruppo richiesto
  | "email_unverified" // email assente o non verificata da Keycloak
  | "account_conflict" // l'email è già legata a un altro account Keycloak
  | "inactive" // utente disattivato in Softuerino
  | "failed"; // errore di protocollo, token non valido, Keycloak irraggiungibile

export class OidcError extends Error {
  constructor(readonly code: OidcLoginError, message?: string) {
    super(message ?? code);
  }
}

// Scambia il codice con i token, verifica l'ID token (firma, issuer, audience,
// scadenza, nonce, PKCE, state: tutto in openid-client) e restituisce l'utente
// Softuerino da far entrare, collegandolo o creandolo se serve.
export async function completeOidcLogin(callbackParams: URLSearchParams, flow: OidcFlow) {
  const config = await getConfig();
  // L'URL pubblico (dietro Nginx l'app vede 127.0.0.1): stesso redirect_uri
  // registrato su Keycloak, con i parametri ricevuti.
  const currentUrl = new URL(env().redirectUri);
  currentUrl.search = callbackParams.toString();

  let claims: client.IDToken | undefined;
  let tokens: OidcTokens = { idToken: null, refreshToken: null };
  try {
    const response = await client.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: flow.verifier,
      expectedState: flow.state,
      expectedNonce: flow.nonce,
      idTokenExpected: true,
    });
    claims = response.claims();
    // Conservati (cifrati) nella sessione, mai nei log: id_token per il logout,
    // refresh_token per la verifica periodica della sessione SSO.
    tokens = { idToken: response.id_token ?? null, refreshToken: response.refresh_token ?? null };
  } catch (err) {
    throw new OidcError("failed", err instanceof Error ? err.message : String(err));
  }
  if (!claims?.sub) {
    throw new OidcError("failed", "ID token senza sub");
  }

  const { allowedGroup } = env();
  if (allowedGroup) {
    const groups = Array.isArray(claims.groups) ? claims.groups : [];
    const names = groups.filter((g): g is string => typeof g === "string").map((g) => g.replace(/^\/+/, ""));
    if (!names.includes(allowedGroup)) {
      throw new OidcError("not_allowed");
    }
  }

  const subject = claims.sub;
  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const name =
    (typeof claims.name === "string" && claims.name.trim()) ||
    [claims.given_name, claims.family_name].filter((p) => typeof p === "string" && p).join(" ") ||
    (typeof claims.preferred_username === "string" && claims.preferred_username) ||
    email;

  // 1. Utente già legato a questo account Keycloak.
  const linked = await prisma.user.findUnique({ where: { oidcSubject: subject } });
  if (linked) {
    if (!linked.active) throw new OidcError("inactive");
    return { user: linked, tokens };
  }

  // 2. Primo login: collegamento per email, solo se Keycloak la garantisce.
  if (!email || claims.email_verified !== true) {
    throw new OidcError("email_unverified");
  }
  const byEmail = await prisma.user.findUnique({ where: { email } });
  if (byEmail) {
    if (byEmail.oidcSubject && byEmail.oidcSubject !== subject) {
      throw new OidcError("account_conflict");
    }
    if (!byEmail.active) throw new OidcError("inactive");
    const user = await prisma.user.update({ where: { id: byEmail.id }, data: { oidcSubject: subject } });
    return { user, tokens };
  }

  // 3. Nuovo utente: membro, con una password locale casuale e mai comunicata
  // (il login locale è riservato ai super admin). Ruolo e tipo di rapporto li
  // sistema un admin dalla pagina Team.
  const user = await prisma.user.create({
    data: {
      name,
      email,
      oidcSubject: subject,
      role: "membro",
      employmentType: "dipendente",
      passwordHash: await hashPassword(randomBytes(32).toString("base64")),
    },
  });
  return { user, tokens };
}

// "Esci" per una sessione nata da SSO: URL dell'end_session_endpoint di
// Keycloak (RP-Initiated Logout) che chiude la sessione SSO, quindi tutte le
// app collegate, e riporta a /login. Con id_token_hint Keycloak esce senza
// chiedere conferma; senza (sessioni nate prima che lo si salvasse) chiede
// "Vuoi uscire?". post_logout_redirect_uri deve coincidere con quello
// registrato sul client: è l'origine di OIDC_REDIRECT_URI + /login.
// Null se Keycloak non è configurato o non risponde: si esce solo da Softuerino.
export async function buildOidcLogoutUrl(idToken: string | null) {
  if (!isOidcConfigured()) return null;
  try {
    const config = await getConfig();
    const { clientId, redirectUri } = env();
    return client.buildEndSessionUrl(config, {
      client_id: clientId,
      post_logout_redirect_uri: new URL("/login", redirectUri).href,
      ...(idToken ? { id_token_hint: idToken } : {}),
    }).href;
  } catch (err) {
    console.error("[oidc] logout SSO non disponibile, esco solo da Softuerino:", err instanceof Error ? err.message : err);
    return null;
  }
}

// Verifica che la sessione SSO sia ancora attiva rinnovando il refresh_token.
// "ended": Keycloak risponde invalid_grant (logout da un'altra app, sessione
// scaduta o revocata). "unavailable": Keycloak irraggiungibile o in errore,
// si riproverà: non è un motivo per buttare fuori l'utente.
export async function refreshOidcSession(
  refreshToken: string
): Promise<{ status: "ok"; tokens: OidcTokens } | { status: "ended" } | { status: "unavailable" }> {
  try {
    const config = await getConfig();
    const response = await client.refreshTokenGrant(config, refreshToken);
    return {
      status: "ok",
      tokens: { idToken: response.id_token ?? null, refreshToken: response.refresh_token ?? refreshToken },
    };
  } catch (err) {
    if (err instanceof client.ResponseBodyError && err.error === "invalid_grant") {
      return { status: "ended" };
    }
    console.error("[oidc] verifica sessione SSO non riuscita, riprovo più tardi:", err instanceof Error ? err.message : err);
    return { status: "unavailable" };
  }
}
