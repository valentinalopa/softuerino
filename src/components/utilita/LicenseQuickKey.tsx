"use client";

import { useState, useTransition } from "react";
import { Copy, Eye } from "lucide-react";
import { addLicenseActivation, revealLicenseKey } from "@/lib/licenses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TONE_TEXT } from "@/lib/tones";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";

// Mostra/Copia dall'elenco, senza aprire la licenza. La chiave arriva dal
// server (ogni accesso è registrato) e si apre un popup per segnare dove la si
// sta usando: registrare l'attivazione è facoltativo.
export function LicenseQuickKey({
  licenseId,
  name,
  masked,
  used,
  limit,
}: {
  licenseId: string;
  name: string;
  masked: string | null;
  used: number;
  limit: number | null; // null = illimitate
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = limit !== null && used >= limit;

  if (!masked) return <span className="text-muted-foreground">—</span>;

  function fetchKey(action: "show" | "copy") {
    setMessage(null);
    setError(null);
    startTransition(async () => {
      try {
        const result = await revealLicenseKey(licenseId, action);
        if ("error" in result) {
          setMessage({ kind: "error", text: result.error });
          if (!open) setOpen(true);
          return;
        }
        setKey(action === "show" ? result.key : null);
        if (action === "copy") {
          await navigator.clipboard.writeText(result.key);
          setMessage({ kind: "success", text: "Chiave copiata negli appunti." });
        }
        setOpen(true);
      } catch {
        setMessage({ kind: "error", text: "Errore imprevisto" });
        setOpen(true);
      }
    });
  }

  function register(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addLicenseActivation(licenseId, formData);
        if (result?.error) setError(result.error);
        else close();
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  function close() {
    setOpen(false);
    setKey(null);
    setMessage(null);
    setError(null);
  }

  return (
    <>
      <div className="flex items-center gap-1">
        <code className="text-xs">{masked}</code>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Mostra la chiave di ${name}`}
          title="Mostra"
          disabled={pending}
          onClick={() => fetchKey("show")}
        >
          <Eye className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`Copia la chiave di ${name}`}
          title="Copia"
          disabled={pending}
          onClick={() => fetchKey("copy")}
        >
          <Copy className="size-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : close())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>Ogni visualizzazione o copia viene registrata.</DialogDescription>
          </DialogHeader>

          {key && (
            <div className="flex flex-wrap items-center gap-2">
              <code className="rounded-md bg-muted px-2 py-1 text-sm break-all">{key}</code>
              <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => fetchKey("copy")}>
                <Copy className="size-4" />
                Copia
              </Button>
            </div>
          )}
          {message && (
            <p className={`text-sm ${message.kind === "error" ? "text-destructive" : TONE_TEXT.success}`}>
              {message.text}
            </p>
          )}

          {full ? (
            <p className="text-sm text-destructive">
              Limite raggiunto: {used} attivazioni su {limit}. Libera un&apos;attivazione dalla scheda della licenza.
            </p>
          ) : (
            <form id={`activation-${licenseId}`} onSubmit={submitKeepingValues(register)} className="space-y-2">
              <p className="font-medium">Dove la stai usando?</p>
              <Input name="label" required placeholder="Sito, PC, account..." autoFocus />
              <Input name="note" placeholder="Note (facoltative)" />
              <p className="text-xs text-muted-foreground">
                {limit === null ? `${used} attivazioni (illimitate)` : `${used} su ${limit} attivazioni`}
              </p>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {full ? "Chiudi" : "Non registrare"}
            </Button>
            {!full && (
              <Button type="submit" form={`activation-${licenseId}`} disabled={pending}>
                Registra attivazione
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
