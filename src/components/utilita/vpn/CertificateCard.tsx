import { Download, Laptop } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Certificato Colibrì: profilo della CA interna per iPhone/iPad (e DMG per Mac).
// Contiene solo il certificato pubblico. Sono link normali (non fetch): Safari
// deve ricevere application/x-apple-aspen-config per proporre l'installazione.
export function CertificateCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificato Colibrì</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Installa il certificato dell&apos;azienda per aprire senza avvisi di sicurezza i servizi interni
          (indirizzi che finiscono con <span className="font-mono">.local.colibrivision.it</span>).
        </p>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <a
            href="/api/cert/colibri.mobileconfig"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Download className="size-4" aria-hidden />
            Scarica profilo (iPhone/iPad)
          </a>
          <a
            href="/api/cert/colibri.dmg"
            className="inline-flex items-center gap-2 text-sm underline underline-offset-4 hover:text-foreground"
          >
            <Laptop className="size-4" aria-hidden />
            Versione per Mac (DMG)
          </a>
        </div>

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
      </CardContent>
    </Card>
  );
}
