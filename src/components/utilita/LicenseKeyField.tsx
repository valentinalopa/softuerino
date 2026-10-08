"use client";

import { useState, useTransition } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { revealLicenseKey } from "@/lib/licenses/actions";
import { Button } from "@/components/ui/button";
import { TONE_TEXT } from "@/lib/tones";
import { copyFromServer } from "@/lib/clipboard";

// Chiave mascherata (prime 4 cifre + asterischi). "Mostra" e "Copia" chiedono
// la chiave completa al server, che registra ogni accesso.
export function LicenseKeyField({ licenseId, masked }: { licenseId: string; masked: string | null }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!masked) return <span className="text-muted-foreground">—</span>;

  function fetchKey(action: "show" | "copy", then: (key: string) => void | Promise<void>) {
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await revealLicenseKey(licenseId, action);
        if ("error" in result) {
          setMessage({ kind: "error", text: result.error });
          return;
        }
        await then(result.key);
      } catch {
        setMessage({ kind: "error", text: "Errore imprevisto" });
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-md bg-muted px-2 py-1 text-sm break-all">{revealed ?? masked}</code>
        {revealed ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setRevealed(null)}>
            <EyeOff className="size-4" />
            Nascondi
          </Button>
        ) : (
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => fetchKey("show", (key) => setRevealed(key))}>
            <Eye className="size-4" />
            Mostra
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => {
            setMessage(null);
            // Subito, dentro il clic: su iPhone la copia funziona solo così.
            const copying = copyFromServer(() => revealLicenseKey(licenseId, "copy"));
            startTransition(async () => {
              const failed = await copying;
              setMessage(
                failed ? { kind: "error", text: failed.error } : { kind: "success", text: "Chiave copiata negli appunti." }
              );
            });
          }}
        >
          <Copy className="size-4" />
          Copia
        </Button>
      </div>
      {message && (
        <p className={`text-xs ${message.kind === "error" ? "text-destructive" : TONE_TEXT.success}`}>{message.text}</p>
      )}
      <p className="text-xs text-muted-foreground">Ogni visualizzazione o copia viene registrata.</p>
    </div>
  );
}
