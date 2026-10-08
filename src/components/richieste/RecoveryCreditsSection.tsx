"use client";

import { useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { createRecoveryCredit, deleteRecoveryCredit, setRecoveryCreditStatus } from "@/lib/actions";
import { formatAmount as formatNumber, formatDate } from "@/lib/leave-format";
import { RECOVERY_STATUS_LABELS, type RecoveryStatus, type RecoveryUnit } from "@/lib/constants";
import type { RecoveryCreditView } from "@/lib/recovery-credits";
import { TONE_SOFT, type Tone } from "@/lib/tones";
import { cn } from "@/lib/utils";
import { SegmentedButtonTabs } from "@/components/SegmentedLinkTabs";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const STATUS_TONE: Record<RecoveryStatus, Tone> = {
  da_fare: "warning",
  in_parte: "aqua",
  fatto: "success",
};

function unitShort(unit: RecoveryUnit) {
  return unit === "ore" ? "h" : "gg";
}

// Recuperi da fare di un membro (dipendente o partita IVA) (es. 2 gg dopo una trasferta): elenco con
// stato, aggiunta e stato forzabile dal super admin. readOnly: gli altri admin
// li vedono soltanto.
export function RecoveryCreditsSection({
  userId,
  credits,
  readOnly = false,
}: {
  userId: string;
  credits: RecoveryCreditView[];
  readOnly?: boolean;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-foreground">Recuperi da fare</h3>
        {!adding && !readOnly && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            Aggiungi
          </Button>
        )}
      </div>

      {adding && <NewCreditForm userId={userId} onDone={() => setAdding(false)} />}

      {credits.length === 0 && !adding ? (
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "Nessun recupero registrato."
            : "Nessun recupero registrato. Aggiungine uno quando matura (es. una trasferta): verrà proposto quando si chiede un recupero."}
        </p>
      ) : (
        <ul className="space-y-2">
          {credits.map((credit) => (
            <CreditItem key={credit.id} credit={credit} readOnly={readOnly} />
          ))}
        </ul>
      )}
    </section>
  );
}

function CreditItem({ credit, readOnly }: { credit: RecoveryCreditView; readOnly: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const unit = unitShort(credit.unit);

  function run(action: () => Promise<{ error: string } | undefined>) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (result?.error) setError(result.error);
      } catch {
        setError("Operazione non riuscita, riprova.");
      }
    });
  }

  return (
    <li
      className={cn(
        "space-y-2 rounded-lg border border-surface-border p-3",
        pending && "opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span className="block font-medium text-foreground">{credit.reason}</span>
          <span className="block text-xs text-muted-foreground">
            {formatDate(credit.earnedOn)} · {formatNumber(credit.amount)} {unit} · fatti{" "}
            {formatNumber(credit.used)} {unit}
            {credit.pending > 0 && ` (+${formatNumber(credit.pending)} ${unit} in attesa)`}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-0.5">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-xs font-semibold",
              TONE_SOFT[STATUS_TONE[credit.status]]
            )}
          >
            {RECOVERY_STATUS_LABELS[credit.status]}
          </span>
          {credit.statusOverride && (
            <span className="text-xs text-muted-foreground">impostato a mano</span>
          )}
        </div>
      </div>

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Label
            htmlFor={`credit-status-${credit.id}`}
            className="text-xs font-normal text-muted-foreground"
          >
            Stato
          </Label>
          <NativeSelectField
            id={`credit-status-${credit.id}`}
            // Rimonta quando lo stato cambia dal server (es. dopo un'altra azione).
            key={credit.statusOverride ?? "auto"}
            name={`status-${credit.id}`}
            className="h-8 text-xs"
            defaultValue={credit.statusOverride ?? ""}
            onValueChange={(value) =>
              run(() =>
                setRecoveryCreditStatus(
                  credit.id,
                  value === "" ? null : (value as "da_fare" | "fatto")
                )
              )
            }
            items={[
              {
                value: "",
                label: `Automatico · ${RECOVERY_STATUS_LABELS[credit.autoStatus].toLowerCase()}`,
              },
              { value: "da_fare", label: "Da fare" },
              { value: "fatto", label: "Fatto" },
            ]}
          />
          <div className="ml-auto">
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmDelete(false)}
                  disabled={pending}
                >
                  Annulla
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => run(() => deleteRecoveryCredit(credit.id))}
                  disabled={pending}
                >
                  Elimina
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-muted-foreground"
                aria-label={`Elimina recupero ${credit.reason}`}
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

function NewCreditForm({ userId, onDone }: { userId: string; onDone: () => void }) {
  const [unit, setUnit] = useState<RecoveryUnit>("giorni");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        const result = await createRecoveryCredit(formData);
        if (result?.error) {
          setError(result.error);
          return;
        }
        onDone();
      } catch {
        setError("Salvataggio non riuscito, riprova.");
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-lg border border-surface-border bg-subtle p-3"
    >
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="unit" value={unit} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`credit-reason-${userId}`}>Motivo</Label>
        <Input
          id={`credit-reason-${userId}`}
          name="reason"
          placeholder="Es. trasferta Milano"
          required
          autoFocus
        />
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`credit-amount-${userId}`}>Quantità</Label>
          <Input
            id={`credit-amount-${userId}`}
            name="amount"
            inputMode="decimal"
            className="w-24"
            required
          />
        </div>
        <SegmentedButtonTabs
          items={[
            { key: "giorni", label: "Giorni" },
            { key: "ore", label: "Ore" },
          ]}
          value={unit}
          onChange={setUnit}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`credit-date-${userId}`}>Data (es. della trasferta)</Label>
        <DateField id={`credit-date-${userId}`} name="earnedOn" className="w-full" />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
          Annulla
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Salvataggio..." : "Aggiungi recupero"}
        </Button>
      </div>
    </form>
  );
}
