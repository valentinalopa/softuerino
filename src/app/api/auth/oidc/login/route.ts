import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { isOidcConfigured, OIDC_FLOW_COOKIE, startOidcLogin } from "@/lib/auth/oidc";

// Avvio del login con Keycloak: state, nonce e PKCE verifier in un cookie
// temporaneo (httpOnly, solo per le route OIDC), poi redirect a Keycloak.
export async function GET() {
  if (!isOidcConfigured()) redirect("/login");

  let start: Awaited<ReturnType<typeof startOidcLogin>>;
  try {
    start = await startOidcLogin((await headers()).get("host"));
  } catch (err) {
    console.error("[oidc] avvio login non riuscito:", err);
    redirect("/login?error=sso_failed");
  }

  (await cookies()).set(OIDC_FLOW_COOKIE, JSON.stringify(start.flow), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // lax: il ritorno da Keycloak è una navigazione GET di primo livello.
    sameSite: "lax",
    path: "/api/auth/oidc",
    maxAge: 10 * 60,
  });
  redirect(start.url.href);
}
