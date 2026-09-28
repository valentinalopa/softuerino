"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveDailyTimeEntries } from "@/lib/actions";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatHours } from "@/lib/ore-utils";

export function DailyHoursForm({
  dateValue,
  userId,
  clients,
  existingHours,
  doneHref,
  cancelHref,
}: {
  dateValue: string;
  // Utente su cui loggare: se stesso, o un altro membro quando il super admin
  // modifica il log altrui.
  userId: string;
  clients: { id: string; name: string }[];
  existingHours: Record<string, number>;
  // Dove tornare dopo un salvataggio in modalità modifica (rimuove ?edit=1).
  doneHref?: string;
  cancelHref?: string;
}) {
  const router = useRouter();
  const [hours, setHours] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      clients.map((c) => [c.id, existingHours[c.id] ? String(existingHours[c.id]) : ""])
    )
  );
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(formData: FormData) {
    setError(null);
    try {
      const result = await saveDailyTimeEntries(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      if (doneHref) {
        router.push(doneHref);
      }
    } catch {
      setError("Errore imprevisto");
    }
  }

  const total = Object.values(hours).reduce(
    (sum, value) => sum + (Number(value) || 0),
    0
  );

  return (
    <form action={handleSubmit} className="space-y-3">
      <input type="hidden" name="date" value={dateValue} />
      <input type="hidden" name="userId" value={userId} />
      <div className="divide-y overflow-hidden surface">
        {clients.map((client) => (
          <div
            key={client.id}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <span className="font-medium">{client.name}</span>
            <div className="flex items-center gap-2">
              <input type="hidden" name="clientId" value={client.id} />
              <Input
                type="number"
                name="hours"
                min="0"
                step="0.25"
                placeholder="Es. 2,5"
                className="w-24 text-right"
                value={hours[client.id]}
                onChange={(e) =>
                  setHours((prev) => ({ ...prev, [client.id]: e.target.value }))
                }
              />
            </div>
          </div>
        ))}
        {clients.length === 0 && (
          <p className="px-4 py-6 text-center text-sm text-muted-foreground">
            Nessun cliente attivo su cui loggare.
          </p>
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex items-center justify-between rounded-xl border border-surface-border bg-muted/40 px-4 py-3">
        <span className="text-sm text-muted-foreground">
          Totale ore: <span className="font-semibold text-foreground">{formatHours(total)}</span>
        </span>
        <div className="flex items-center gap-2">
          {cancelHref && (
            <Link
              href={cancelHref}
              className={buttonVariants({ variant: "ghost" })}
            >
              Annulla
            </Link>
          )}
          <Button type="submit" disabled={clients.length === 0}>
            Salva
          </Button>
        </div>
      </div>
    </form>
  );
}
