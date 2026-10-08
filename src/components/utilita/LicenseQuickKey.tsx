"use client";

import { useState, useTransition } from "react";
import { Copy, Eye } from "lucide-react";
import { revealLicenseKey } from "@/lib/licenses/actions";
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
import { copyFromServer } from "@/lib/clipboard";
import { cn } from "@/lib/utils";

type Activation = { id: string; label: string; note: string | null };
type KeyAction = "show" | "copy";

// Chiave mascherata con Mostra e Copia, nell'elenco e nella scheda della
// licenza. Prima di vederla bisogna dire dove la si usa: un'attivazione già
// registrata o una nuova (entro il limite). Il server rifiuta comunque ogni
// accesso senza attivazione e registra chi, quando e per cosa.
export function LicenseQuickKey({
  licenseId,
  name,
  masked,
  activations,
  limit,
  withLabels = false,
}: {
  licenseId: string;
  name: string;
  masked: string | null;
  activations: Activation[];
  limit: number | null; // null = illimitate
  // Pulsanti con il testo (scheda della licenza) invece delle sole icone.
  withLabels?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<KeyAction>("show");
  const [choice, setChoice] = useState<string>("new");
  const [key, setKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = limit !== null && activations.length >= limit;

  if (!masked) return <span className="text-muted-foreground">—</span>;

  function start(next: KeyAction) {
    setAction(next);
    // Nessuna scelta preimpostata se ci sono già usi registrati (va indicato
    // quale); senza, si parte dal "nuovo uso".
    setChoice(activations.length > 0 ? "" : "new");
    setKey(null);
    setCopied(false);
    setError(null);
    setOpen(true);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    if (!formData.get("activationId")) {
      setError("Scegli dove la usi");
      return;
    }
    if (action === "copy") {
      // Subito, dentro il clic: su iPhone la copia funziona solo così.
      const copying = copyFromServer(() => revealLicenseKey(licenseId, "copy", formData));
      startTransition(async () => {
        const failed = await copying;
        if (failed) setError(failed.error);
        else setCopied(true);
      });
      return;
    }
    startTransition(async () => {
      try {
        const result = await revealLicenseKey(licenseId, "show", formData);
        if ("error" in result) setError(result.error);
        else setKey(result.key);
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  const done = key !== null || copied;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <code className={cn("rounded-md bg-muted px-2 py-1 break-all", withLabels ? "text-sm" : "text-xs")}>
          {masked}
        </code>
        <Button
          type="button"
          variant="ghost"
          size={withLabels ? "sm" : "icon-sm"}
          aria-label={`Mostra la chiave di ${name}`}
          title="Mostra"
          onClick={() => start("show")}
        >
          <Eye className="size-4" />
          {withLabels && "Mostra"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size={withLabels ? "sm" : "icon-sm"}
          aria-label={`Copia la chiave di ${name}`}
          title="Copia"
          onClick={() => start("copy")}
        >
          <Copy className="size-4" />
          {withLabels && "Copia"}
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{name}</DialogTitle>
            <DialogDescription>
              {done
                ? "Accesso registrato con l'uso indicato."
                : "Per vedere o copiare la chiave indica dove la usi. Ogni accesso viene registrato."}
            </DialogDescription>
          </DialogHeader>

          {done ? (
            <div className="space-y-2">
              {key && <code className="block rounded-md bg-muted px-3 py-2 text-sm break-all">{key}</code>}
              {copied && <p className={`text-sm ${TONE_TEXT.success}`}>Chiave copiata negli appunti.</p>}
            </div>
          ) : (
            <form id={`key-${licenseId}`} onSubmit={handleSubmit} className="space-y-3">
              <fieldset className="space-y-2">
                <legend className="mb-2 font-medium">Dove la usi?</legend>
                {activations.map((a) => (
                  <label
                    key={a.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2",
                      choice === a.id ? "border-primary-border bg-primary-soft" : "border-border"
                    )}
                  >
                    <input
                      type="radio"
                      name="activationId"
                      value={a.id}
                      checked={choice === a.id}
                      onChange={() => setChoice(a.id)}
                      className="mt-1 accent-primary"
                    />
                    <span className="min-w-0">
                      <span className="block break-words">{a.label}</span>
                      {a.note && <span className="block text-xs text-muted-foreground">{a.note}</span>}
                    </span>
                  </label>
                ))}
                {full ? (
                  <p className="text-xs text-muted-foreground">
                    Limite raggiunto ({activations.length} su {limit}): per un uso nuovo libera prima
                    un&apos;attivazione dalla scheda della licenza.
                  </p>
                ) : (
                  <div
                    className={cn(
                      "space-y-2 rounded-lg border px-3 py-2",
                      choice === "new" ? "border-primary-border bg-primary-soft" : "border-border"
                    )}
                  >
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <input
                        type="radio"
                        name="activationId"
                        value="new"
                        checked={choice === "new"}
                        onChange={() => setChoice("new")}
                        className="accent-primary"
                      />
                      Nuovo uso
                    </label>
                    {choice === "new" && (
                      <div className="space-y-2">
                        <Input
                          name="label"
                          required
                          maxLength={120}
                          placeholder="Sito, PC, account..."
                          aria-label="Dove la usi"
                          autoFocus
                        />
                        <Input name="note" maxLength={200} placeholder="Note (facoltative)" aria-label="Note" />
                      </div>
                    )}
                  </div>
                )}
              </fieldset>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </form>
          )}

          <DialogFooter>
            {done ? (
              <Button type="button" onClick={() => setOpen(false)}>
                Chiudi
              </Button>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Annulla
                </Button>
                <Button type="submit" form={`key-${licenseId}`} disabled={pending || (full && activations.length === 0)}>
                  {action === "copy" ? <Copy className="size-4" /> : <Eye className="size-4" />}
                  {action === "copy" ? "Registra e copia" : "Registra e mostra"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
