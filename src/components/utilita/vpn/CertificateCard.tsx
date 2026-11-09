"use client";

import { useSyncExternalStore } from "react";
import { Download, Laptop } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { detectVpnPlatform } from "@/lib/vpn/guide";

const noSubscribe = () => () => {};

// Certificato Colibrì: profilo della CA interna per iPhone/iPad e DMG per Mac.
// Contiene solo il certificato pubblico. Sono link normali (non fetch): Safari
// deve ricevere application/x-apple-aspen-config per proporre l'installazione.
// Il dispositivo si riconosce come nella guida VPN (detectVpnPlatform, che
// tratta anche iPadOS con user agent da Mac). Prima del rendering nel browser
// e su Windows/Android si mostrano entrambe le versioni.
type Kind = "ios" | "mac" | "other";

function ProfileLink({ primary }: { primary: boolean }) {
  return (
    <a
      href="/api/cert/colibri.mobileconfig"
      target="_blank"
      rel="noopener noreferrer"
      className={buttonVariants({ variant: primary ? "default" : "outline" })}
    >
      <Download className="size-4" aria-hidden />
      Scarica profilo (iPhone/iPad)
    </a>
  );
}

function DmgLink({ primary }: { primary: boolean }) {
  return (
    <a href="/api/cert/colibri.dmg" className={buttonVariants({ variant: primary ? "default" : "outline" })}>
      <Laptop className="size-4" aria-hidden />
      Versione per Mac (DMG)
    </a>
  );
}

function IosSteps() {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Tocca <strong>Consenti</strong> per scaricare il profilo.
        </li>
        <li>
          Apri <strong>Impostazioni › Profilo scaricato › Installa</strong> e inserisci il codice.
        </li>
        <li>
          Vai in <strong>Impostazioni › Generali › Info › Impostazioni attendibilità certificati</strong> e
          attiva <strong>Colibri Vision Root CA</strong>.
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Se non parte il download, apri time.colibrivision.it in Safari ed entra in Security.
      </p>
      <p className="text-xs text-muted-foreground">
        iPhone e iPad mostrano il profilo come «Non verificato»: è normale, perché non è firmato da
        un&apos;autorità pubblica.
      </p>
    </div>
  );
}

export function CertificateCard() {
  const kind = useSyncExternalStore<Kind>(
    noSubscribe,
    () => {
      const platform = detectVpnPlatform(navigator.userAgent, navigator.maxTouchPoints);
      return platform === "ios" ? "ios" : platform === "macos" ? "mac" : "other";
    },
    () => "other"
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificato Colibrì</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Installa il certificato dell&apos;azienda per aprire senza avvisi di sicurezza i servizi interni
          (indirizzi che finiscono con <span className="font-mono">.local.colibrivision.it</span>).
        </p>

        {kind === "ios" && (
          <>
            <div className="space-y-3">
              <ProfileLink primary />
              <IosSteps />
            </div>
            <details className="border-t border-border pt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Altri dispositivi</summary>
              <div className="space-y-2 pt-3">
                <p className="text-xs text-muted-foreground">Per un Mac usa il DMG:</p>
                <DmgLink primary={false} />
              </div>
            </details>
          </>
        )}

        {kind === "mac" && (
          <>
            <div className="space-y-3">
              <DmgLink primary />
              <p className="text-sm text-muted-foreground">
                Apri il DMG: contiene il profilo e le istruzioni per installarlo.
              </p>
            </div>
            <details className="border-t border-border pt-3 text-sm">
              <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Altri dispositivi</summary>
              <div className="space-y-4 pt-3">
                <ProfileLink primary={false} />
                <IosSteps />
              </div>
            </details>
          </>
        )}

        {kind === "other" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scegli la versione per il tuo dispositivo: il profilo è per iPhone e iPad, il DMG per Mac.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ProfileLink primary />
              <DmgLink primary={false} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Su iPhone e iPad</p>
              <IosSteps />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
