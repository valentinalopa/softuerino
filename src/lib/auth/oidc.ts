import "server-only";
import { randomBytes } from "crypto";
import * as client from "openid-client";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";
import { syncUserOrg } from "@/lib/departments";

// Login con Keycloak (OpenID Connect, Authorization Code + PKCE, client
// confidenziale). Configurazione solo da ambiente:
//   OIDC_ISSUER          es. https://sso.esempio.it/realms/azienda
//   OIDC_CLIENT_ID       es. softuerino
//   OIDC_CLIENT_SECRET   segreto del client confidenziale
//   OIDC_REDIRECT_URI    es. https://softuerino.esempio.it/api/auth/oidc/callback
//                        (anche più d'uno separati da virgola, uno per ogni nome
//                        con cui si raggiunge l'app: si usa quello del nome della
//                        richiesta; tutti vanno registrati sul client Keycloak)
//   OIDC_ALLOWED_GROUP   (opzionale) gruppo Keycloak richiesto per entrare
// Senza le prime quattro il login SSO non compare.

export const OIDC_FLOW_COOKIE = "softuerino_oidc";
export const OIDC_CALLBACK_PATH = "/api/auth/oidc/callback";

function env() {
  return {
    issuer: process.env.OIDC_ISSUER ?? "",
    clientId: process.env.OIDC_CLIENT_ID ?? "",
    clientSecret: process.env.OIDC_CLIENT_SECRET ?? "",
    redirectUris: (process.env.OIDC_REDIRECT_URI ?? "")
      .split(",")
      .map((uri) => uri.trim())
      .filter(Boolean),
    allowedGroup: (process.env.OIDC_ALLOWED_GROUP ?? "").replace(/^\/+/, ""),
  };
}

export function isOidcConfigured() {
  const { issuer, clientId, clientSecret, redirectUris } = env();
  return Boolean(issuer && clientId && clientSecret && redirectUris.length > 0);
}

// Redirect URI per il nome con cui è arrivata la richiesta (header Host), tra
// quelli ammessi; altrimenti il primo dell'elenco.
function redirectUriFor(host: string | null) {
  const { redirectUris } = env();
  return redirectUris.find((uri) => new URL(uri).host === host) ?? redirectUris[0];
}

// Utente "gestito da Keycloak": SSO attivo e account già collegato. Nome ed
// email arrivano da Keycloak (si cambiano solo lì, dall'IT) e Softuerino non
// gestisce la sua password, salvo per i super admin (accesso d'emergenza).
// Console account di Keycloak (password, sessioni, dispositivi): per tutti,
// dalla sidebar. Null se l'SSO non è configurato.
export function ssoAccountUrl() {
  if (!isOidcConfigured()) return null;
  return `${env().issuer.replace(/\/+$/, "")}/account`;
}

export function isSsoManaged(user: { oidcSubject: string | null }) {
  return isOidcConfigured() && Boolean(user.oidcSubject);
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

// Dati del flusso salvati nel cookie temporaneo tra login e callback, compreso
// il redirect_uri usato (lo scambio del codice deve ripetere lo stesso).
export type OidcFlow = { state: string; nonce: string; verifier: string; redirectUri: string };

export async function startOidcLogin(host: string | null) {
  const config = await getConfig();
  const flow: OidcFlow = {
    state: client.randomState(),
    nonce: client.randomNonce(),
    verifier: client.randomPKCECodeVerifier(),
    redirectUri: redirectUriFor(host),
  };
  const url = client.buildAuthorizationUrl(config, {
    redirect_uri: flow.redirectUri,
    scope: "openid email profile",
    state: flow.state,
    nonce: flow.nonce,
    code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
    code_challenge_method: "S256",
  });
  return { url, flow };
}

// sid: identificativo della sessione Keycloak, per il back-channel logout.
export type OidcTokens = { idToken: string | null; refreshToken: string | null; sid?: string | null };

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
  // usato all'avvio, purché sia ancora tra quelli ammessi, con i parametri ricevuti.
  if (!env().redirectUris.includes(flow.redirectUri)) {
    throw new OidcError("failed", "redirect_uri del flusso non ammesso");
  }
  const currentUrl = new URL(flow.redirectUri);
  currentUrl.search = callbackParams.toString();

  let claims: client.IDToken | undefined;
  let tokens: OidcTokens = { idToken: null, refreshToken: null, sid: null };
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
    tokens = {
      idToken: response.id_token ?? null,
      refreshToken: response.refresh_token ?? null,
      sid: typeof claims?.sid === "string" ? claims.sid : null,
    };
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

  // 1. Utente già legato a questo account Keycloak: nome ed email si
  // riallineano a Keycloak (l'email solo se verificata e non usata da altri).
  const linked = await prisma.user.findUnique({ where: { oidcSubject: subject } });
  if (linked) {
    if (!linked.active) throw new OidcError("inactive");
    const sync: { name?: string; email?: string } = {};
    if (name && name !== linked.name) sync.name = name;
    if (email && claims.email_verified === true && email !== linked.email) {
      const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (taken) {
        console.error(`[oidc] email Keycloak di ${linked.id} già usata da un altro utente: non aggiornata`);
      } else {
        sync.email = email;
      }
    }
    const user = Object.keys(sync).length
      ? await prisma.user.update({ where: { id: linked.id }, data: sync })
      : linked;
    await syncUserOrg(user.id, claims);
    return { user, tokens };
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
    const user = await prisma.user.update({
      where: { id: byEmail.id },
      data: { oidcSubject: subject, ...(name ? { name } : {}) },
    });
    await syncUserOrg(user.id, claims);
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
  await syncUserOrg(user.id, claims);
  return { user, tokens };
}

// "Esci" per una sessione nata da SSO: URL dell'end_session_endpoint di
// Keycloak (RP-Initiated Logout) che chiude la sessione SSO, quindi tutte le
// app collegate, e riporta a /login. Con id_token_hint Keycloak esce senza
// chiedere conferma; senza (sessioni nate prima che lo si salvasse) chiede
// "Vuoi uscire?". post_logout_redirect_uri deve coincidere con quello
// registrato sul client: è l'origine del redirect URI del nome usato + /login.
// Null se Keycloak non è configurato o non risponde: si esce solo da Softuerino.
export async function buildOidcLogoutUrl(idToken: string | null, host: string | null) {
  if (!isOidcConfigured()) return null;
  try {
    const config = await getConfig();
    const { clientId } = env();
    return client.buildEndSessionUrl(config, {
      client_id: clientId,
      post_logout_redirect_uri: new URL("/login", redirectUriFor(host)).href,
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
): Promise<
  | { status: "ok"; tokens: OidcTokens; claims: Record<string, unknown> | null }
  | { status: "ended" }
  | { status: "unavailable" }
> {
  try {
    const config = await getConfig();
    const response = await client.refreshTokenGrant(config, refreshToken);
    return {
      status: "ok",
      tokens: { idToken: response.id_token ?? null, refreshToken: response.refresh_token ?? refreshToken },
      // Claim aggiornati (reparti e incarichi): l'organigramma segue Keycloak
      // anche durante la sessione.
      claims: (response.claims() ?? null) as Record<string, unknown> | null,
    };
  } catch (err) {
    if (err instanceof client.ResponseBodyError && err.error === "invalid_grant") {
      return { status: "ended" };
    }
    console.error("[oidc] verifica sessione SSO non riuscita, riprovo più tardi:", err instanceof Error ? err.message : err);
    return { status: "unavailable" };
  }
}

// --- Back-Channel Logout (OIDC Back-Channel Logout 1.0) ---
// Keycloak chiama l'endpoint quando una sessione SSO finisce (Esci da
// un'altra app, scadenza, chiusura dalla console): si valida il logout token e
// si chiudono le sessioni Softuerino con quel sid.

const BACKCHANNEL_EVENT = "http://schemas.openid.net/event/backchannel-logout";
const ASYMMETRIC_ALGS = ["RS256", "RS384", "RS512", "PS256", "PS384", "PS512", "ES256", "ES384", "ES512", "EdDSA"];

let jwks: { url: string; set: ReturnType<typeof createRemoteJWKSet> } | null = null;

// jti già visti negli ultimi minuti: lo stesso logout token non vale due volte.
const seenJti = new Map<string, number>();

function rememberJti(jti: string, ttlMs: number) {
  const now = Date.now();
  for (const [key, until] of seenJti) if (until < now) seenJti.delete(key);
  if (seenJti.has(jti)) return false;
  seenJti.set(jti, now + ttlMs);
  return true;
}

// Restituisce il sid da chiudere; lancia se il token non è valido.
export async function verifyBackchannelLogoutToken(logoutToken: string) {
  const config = await getConfig();
  const metadata = config.serverMetadata();
  if (!metadata.jwks_uri) throw new Error("jwks_uri assente nella discovery");
  if (!jwks || jwks.url !== metadata.jwks_uri) {
    jwks = { url: metadata.jwks_uri, set: createRemoteJWKSet(new URL(metadata.jwks_uri)) };
  }

  const { payload } = await jwtVerify(logoutToken, jwks.set, {
    issuer: metadata.issuer,
    audience: env().clientId,
    algorithms: ASYMMETRIC_ALGS,
    maxTokenAge: "2 minutes", // iat recente
    clockTolerance: 30,
  });

  const events = payload.events;
  if (!events || typeof events !== "object" || !(BACKCHANNEL_EVENT in events)) {
    throw new Error("claim events senza backchannel-logout");
  }
  if ("nonce" in payload) throw new Error("un logout token non deve avere nonce");
  if (typeof payload.sid !== "string" || !payload.sid) throw new Error("sid assente");
  if (typeof payload.jti !== "string" || !rememberJti(payload.jti, 5 * 60 * 1000)) {
    throw new Error("jti assente o già usato");
  }
  return payload.sid;
}
