import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Tab SSO della pagina Security: rimanda alla console account di Keycloak
// (password, OTP, passkey, sessioni, dispositivi). Nessuno stato dell'account.
export function SsoPanel({ accountUrl, showEmergencyNote }: { accountUrl: string | null; showEmergencyNote: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account SSO</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {accountUrl ? (
          <>
            <p className="text-sm text-muted-foreground">
              Accedi con l&apos;account aziendale (Keycloak). Password, codice a due fattori (OTP), passkey,
              sessioni e dispositivi si gestiscono nella tua console account.
            </p>
            <a
              href={accountUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={buttonVariants({ variant: "default" })}
            >
              <ExternalLink className="size-4" aria-hidden />
              Apri Account SSO
            </a>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">SSO non configurato.</p>
        )}
        {showEmergencyNote && (
          <p className="border-t border-border pt-3 text-xs text-muted-foreground">
            Il login d&apos;emergenza con password è solo dal web, da LAN o VPN di controllo.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
