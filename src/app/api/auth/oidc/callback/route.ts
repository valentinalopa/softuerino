import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/constants";
import {
  completeOidcLogin,
  isOidcConfigured,
  OIDC_FLOW_COOKIE,
  OidcError,
  type OidcFlow,
} from "@/lib/auth/oidc";

function readFlow(raw: string | undefined): OidcFlow | null {
  if (!raw) return null;
  try {
    const flow = JSON.parse(raw);
    return typeof flow?.state === "string" &&
      typeof flow?.nonce === "string" &&
      typeof flow?.verifier === "string" &&
      typeof flow?.redirectUri === "string"
      ? flow
      : null;
  } catch {
    return null;
  }
}

// Ritorno da Keycloak: verifica, collegamento/creazione dell'utente e sessione
// Softuerino come per il login con password.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const flow = readFlow(cookieStore.get(OIDC_FLOW_COOKIE)?.value);
  // Il cookie del flusso vale una volta sola.
  cookieStore.set(OIDC_FLOW_COOKIE, "", { path: "/api/auth/oidc", maxAge: 0 });

  if (!isOidcConfigured() || !flow) redirect("/login?error=sso_failed");
  // Login annullato o negato su Keycloak.
  if (request.nextUrl.searchParams.has("error")) redirect("/login?error=sso_failed");

  let result: Awaited<ReturnType<typeof completeOidcLogin>>;
  try {
    result = await completeOidcLogin(request.nextUrl.searchParams, flow);
  } catch (err) {
    const code = err instanceof OidcError ? err.code : "failed";
    console.error(`[oidc] login rifiutato (${code}):`, err instanceof Error ? err.message : err);
    redirect(`/login?error=sso_${code}`);
  }

  await createSession(result.user.id, { authMethod: "oidc", tokens: result.tokens });
  redirect(homePathFor(result.user.role));
}
