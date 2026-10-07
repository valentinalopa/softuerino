import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoginForm } from "@/components/auth/LoginForm";
import { Marchio } from "@/components/brand/Marchio";
import { TONE_SOFT } from "@/lib/tones";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { isPublicRequest } from "@/lib/network";
import { buttonVariants } from "@/components/ui/button";

const ERROR_MESSAGES: Record<string, string> = {
  "1": "Email o password non corrette.",
  local_disabled:
    "Accedi con l'account aziendale: il login con password è riservato agli accessi di emergenza.",
  sso_failed: "Accesso con l'account aziendale non riuscito. Riprova.",
  sso_not_allowed: "Il tuo account aziendale non è abilitato a Softuerino.",
  sso_email_unverified:
    "L'account aziendale non ha un'email verificata: contatta l'amministratore.",
  sso_account_conflict:
    "Questa email è già collegata a un altro account aziendale: contatta l'amministratore.",
  sso_inactive: "Il tuo account Softuerino è disattivato.",
  local_public:
    "Da internet si accede solo con l'account aziendale. L'accesso con password è disponibile dalla rete aziendale o dalla VPN.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await getSession();
  if (session) {
    redirect(homePathFor(session.user.role));
  }

  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.sso_failed) : null;
  const sso = isOidcConfigured();
  // Da internet niente accesso con password: il form non si mostra nemmeno.
  const localLogin = !(await isPublicRequest());

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-sm">
        <CardHeader className="gap-3">
          <Marchio className="h-10" />
          <div className="flex flex-col gap-1">
            <CardTitle className="text-3xl leading-9 tracking-tight">
              Softuerino
            </CardTitle>
            <CardDescription>Accedi al gestionale del team.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {errorMessage && (
            <p
              role="alert"
              className={`mb-4 rounded-xl px-4 py-3 text-sm ${TONE_SOFT.danger}`}
            >
              {errorMessage}
            </p>
          )}

          {sso ? (
            <div className="flex flex-col gap-4">
              {/* <a> e non <Link>: è una route che rimanda a Keycloak, niente prefetch. */}
              <a href="/api/auth/oidc/login" className={buttonVariants({ className: "w-full" })}>
                Accedi con l&apos;account aziendale
              </a>
              {localLogin && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground">
                    Accesso di emergenza con password (solo super admin)
                  </summary>
                  <div className="mt-4">
                    <LoginForm />
                  </div>
                </details>
              )}
            </div>
          ) : localLogin ? (
            <LoginForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              Accesso disponibile solo dalla rete aziendale o dalla VPN.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
