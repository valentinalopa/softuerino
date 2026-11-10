"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { Download, Laptop } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const noSubscribe = () => () => {};

// Certificato Colibrì: profilo della CA interna per iPhone/iPad, DMG per Mac,
// certificato .crt per Windows e Android. Contiene solo il certificato pubblico.
// Sono link normali (non fetch): Safari deve ricevere application/x-apple-aspen-config
// per proporre l'installazione. Il dispositivo si riconosce dallo user agent
// (iPadOS si presenta come Mac: lo tradisce il touch). Android va controllato
// prima di "other". Prima del rendering nel browser si mostra "other".
type Kind = "ios" | "mac" | "windows" | "android" | "other";

function detectKind(ua: string, touchPoints: number): Kind {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh/i.test(ua) && touchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Windows/i.test(ua)) return "windows";
  return "other";
}

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

function CrtLink({ primary }: { primary: boolean }) {
  return (
    <a href="/api/cert/crt" className={buttonVariants({ variant: primary ? "default" : "outline" })}>
      <Download className="size-4" aria-hidden />
      Scarica certificato (.crt)
    </a>
  );
}

function OtherDevices({ children }: { children: ReactNode }) {
  return (
    <details className="border-t border-border pt-3 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Altri dispositivi</summary>
      <div className="space-y-4 pt-3">{children}</div>
    </details>
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

function WindowsSteps() {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>
          Apri il file scaricato › <strong>Installa certificato</strong>.
        </li>
        <li>
          Scegli <strong>Utente corrente</strong> › <strong>Colloca tutti i certificati nel seguente archivio</strong>{" "}
          › <strong>Sfoglia</strong> › <strong>Autorità di certificazione radice attendibili</strong>.
        </li>
        <li>
          <strong>Fine</strong>, poi <strong>Sì</strong> sull&apos;avviso di sicurezza.
        </li>
        <li>Riapri il browser.</li>
      </ol>
      <p className="text-xs text-muted-foreground">
        Chrome ed Edge usano l&apos;archivio di Windows. Firefox potrebbe richiedere{" "}
        <strong>Impostazioni › Privacy e sicurezza › Certificati › Mostra certificati › Autorità › Importa</strong>.
      </p>
    </div>
  );
}

function AndroidSteps() {
  return (
    <div className="space-y-3">
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        <li>Scarica il file: il browser non lo installa da solo.</li>
        <li>
          Apri <strong>Impostazioni › Sicurezza</strong> (o{" "}
          <strong>Sicurezza e privacy › Altre impostazioni di sicurezza</strong>) ›{" "}
          <strong>Crittografia e credenziali</strong> › <strong>Installa un certificato</strong> ›{" "}
          <strong>Certificato CA</strong> › <strong>Installa comunque</strong>, poi scegli il file. Serve il blocco
          schermo.
        </li>
      </ol>
      <p className="text-xs text-muted-foreground">
        I menu cambiano da produttore a produttore (Samsung: <strong>Altre impostazioni di sicurezza › Installa da
        memoria dispositivo</strong>). Chrome riconosce la CA, ma molte altre app no.
      </p>
    </div>
  );
}

export function CertificateCard() {
  const kind = useSyncExternalStore<Kind>(
    noSubscribe,
    () => detectKind(navigator.userAgent, navigator.maxTouchPoints),
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
            <OtherDevices>
              <p className="text-xs text-muted-foreground">Per un Mac usa il DMG:</p>
              <DmgLink primary={false} />
              <p className="text-xs text-muted-foreground">Per Windows o Android usa il certificato (.crt):</p>
              <CrtLink primary={false} />
            </OtherDevices>
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
            <OtherDevices>
              <ProfileLink primary={false} />
              <IosSteps />
              <CrtLink primary={false} />
            </OtherDevices>
          </>
        )}

        {kind === "windows" && (
          <>
            <div className="space-y-3">
              <CrtLink primary />
              <WindowsSteps />
            </div>
            <OtherDevices>
              <ProfileLink primary={false} />
              <DmgLink primary={false} />
            </OtherDevices>
          </>
        )}

        {kind === "android" && (
          <>
            <div className="space-y-3">
              <CrtLink primary />
              <AndroidSteps />
            </div>
            <OtherDevices>
              <ProfileLink primary={false} />
              <DmgLink primary={false} />
            </OtherDevices>
          </>
        )}

        {kind === "other" && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Scegli la versione per il tuo dispositivo: il profilo è per iPhone e iPad, il DMG per Mac, il certificato
              (.crt) per Windows e Android.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ProfileLink primary />
              <DmgLink primary={false} />
              <CrtLink primary={false} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Su iPhone e iPad</p>
              <IosSteps />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Su Windows</p>
              <WindowsSteps />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">Su Android</p>
              <AndroidSteps />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
