"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { addLicenseActivation, removeLicenseActivation } from "@/lib/licenses/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { formatDate } from "@/lib/leave-format";

type Activation = {
  id: string;
  label: string;
  note: string | null;
  createdAt: string;
  createdBy: string | null;
};

export function LicenseActivations({
  licenseId,
  activations,
  limit,
}: {
  licenseId: string;
  activations: Activation[];
  limit: number | null; // null = illimitate
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const full = limit !== null && activations.length >= limit;

  function run(action: () => Promise<{ error: string } | undefined>, resetForm?: HTMLFormElement) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) setError(result.error);
        else resetForm?.reset();
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-semibold">{activations.length}</span>
        {limit === null ? " attivazioni (illimitate)" : ` su ${limit} attivazioni`}
        {limit !== null && !full && (
          <span className="text-muted-foreground"> · ne restano {limit - activations.length}</span>
        )}
        {full && <span className="text-destructive"> · limite raggiunto</span>}
      </p>

      {activations.length > 0 && (
        <ul className="space-y-2">
          {activations.map((a) => (
            <li
              key={a.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-surface-border p-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground">{a.label}</p>
                {a.note && <p className="text-muted-foreground">{a.note}</p>}
                <p className="text-xs text-muted-foreground">
                  {formatDate(new Date(a.createdAt))}
                  {a.createdBy ? ` · ${a.createdBy}` : ""}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Rimuovi attivazione ${a.label}`}
                className="text-muted-foreground"
                disabled={pending}
                onClick={() => run(() => removeLicenseActivation(a.id))}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      {!full && (
        <form
          onSubmit={submitKeepingValues((formData, form) =>
            run(() => addLicenseActivation(licenseId, formData), form)
          )}
          className="flex flex-wrap items-end gap-2"
        >
          <Input
            name="label"
            required
            placeholder="Dove (sito, PC, account...)"
            className="min-w-48 flex-1"
          />
          <Input name="note" placeholder="Note (facoltative)" className="min-w-48 flex-1" />
          <Button type="submit" variant="outline" disabled={pending}>
            Aggiungi attivazione
          </Button>
        </form>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
