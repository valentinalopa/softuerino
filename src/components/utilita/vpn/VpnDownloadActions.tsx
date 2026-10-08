"use client";

import { useState } from "react";
import { Copy, Download } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { TONE_TEXT } from "@/lib/tones";

// "Scarica configurazione" apre il link del file .ovpn in una nuova scheda;
// "Copia link" serve per aprirlo su un altro dispositivo (es. in Safari).
export function VpnDownloadActions({ name, configUrl }: { name: string; configUrl: string }) {
  const [copied, setCopied] = useState<"ok" | "error" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(configUrl);
      setCopied("ok");
    } catch {
      setCopied("error");
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={configUrl}
          target="_blank"
          rel="noopener noreferrer"
          referrerPolicy="no-referrer"
          aria-label={`Scarica la configurazione della VPN ${name}`}
          className={buttonVariants()}
        >
          <Download className="size-4" />
          Scarica configurazione
        </a>
        <Button type="button" variant="ghost" size="sm" onClick={copy}>
          <Copy className="size-4" />
          Copia link
        </Button>
      </div>
      {copied === "ok" && <p className={`text-xs ${TONE_TEXT.success}`}>Link copiato negli appunti.</p>}
      {copied === "error" && <p className="text-xs text-destructive">Copia non riuscita: tieni premuto il pulsante e copia il link.</p>}
    </div>
  );
}
