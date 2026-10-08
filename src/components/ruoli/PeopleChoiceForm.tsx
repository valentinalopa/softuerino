"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { TONE_TEXT } from "@/lib/tones";

type Person = { id: string; name: string; summary: string; checked: boolean };

// Elenco di persone da spuntare (responsabili ferie, chi riceve le richieste
// di nuovi utenti).
export function PeopleChoiceForm({
  people,
  onSave,
}: {
  people: Person[];
  onSave: (formData: FormData) => Promise<{ error: string } | undefined>;
}) {
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    setPending(true);
    try {
      const result = await onSave(formData);
      setMessage(result?.error ? { kind: "error", text: result.error } : { kind: "success", text: "Salvato." });
    } catch {
      setMessage({ kind: "error", text: "Errore imprevisto" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {people.map((p) => (
          <label
            key={p.id}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 has-checked:border-primary-border has-checked:bg-primary-soft"
          >
            <input
              type="checkbox"
              name="userId"
              value={p.id}
              defaultChecked={p.checked}
              onChange={() => setMessage(null)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{p.name}</span>
              <span className="block text-xs text-muted-foreground">{p.summary}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Salvataggio..." : "Salva"}
        </Button>
        {message && (
          <span className={`text-sm ${message.kind === "error" ? "text-destructive" : TONE_TEXT.success}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
