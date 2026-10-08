"use client";

import { useState, useTransition } from "react";
import { setLeaveBalances } from "@/lib/actions";
import { formatAmount } from "@/lib/leave-format";
import type { BalanceKind } from "@/lib/constants";
import type { BalanceFigures } from "@/lib/leave-balance";
import type { RecoveryCreditView } from "@/lib/recovery-credits";
import { TONE_TEXT } from "@/lib/tones";
import { BALANCE_KIND_LABELS, BalanceMeters } from "@/components/team/BalanceMeters";
import { RecoveryCreditsSection } from "@/components/richieste/RecoveryCreditsSection";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Balances = Partial<Record<BalanceKind, BalanceFigures>>;

// Accetta la virgola come nell'Excel (2,5) e i negativi (chi ha già sforato).
function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

// Scheda "Saldi" del membro: saldi dell'anno, recuperi da fare e assenze
// fuori monte. Solo il super admin modifica saldi e recuperi; gli altri admin
// li vedono.
export function MemberBalances({
  userId,
  year,
  balances,
  toRecover,
  recoveryCredits,
  outsideAllowance,
  canEdit,
}: {
  userId: string;
  year: number;
  balances: Balances;
  toRecover: string;
  recoveryCredits: RecoveryCreditView[];
  outsideAllowance: { label: string; value: number; unit: string }[];
  canEdit: boolean;
}) {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Saldo {year}</CardTitle>
        </CardHeader>
        <CardContent>
          <BalanceMeters balances={balances} toRecover={toRecover} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {canEdit && <BalanceForm userId={userId} balances={balances} year={year} />}

        <Card>
          <CardContent>
            <RecoveryCreditsSection userId={userId} credits={recoveryCredits} readOnly={!canEdit} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Fuori monte nel {year}</CardTitle>
            <CardDescription>Non scalano i saldi.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border-subtle text-sm">
              {outsideAllowance.map((item) => (
                <div key={item.label} className="flex items-center justify-between py-2">
                  <dt className="text-muted-foreground">{item.label}</dt>
                  <dd className="font-medium text-foreground">
                    {formatAmount(item.value)} {item.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Residui scritti a mano (es. ricopiati dall'Excel): ognuno diventa una
// rettifica sull'anno corrente, poi le richieste approvate lo scalano.
function BalanceForm({
  userId,
  balances,
  year,
}: {
  userId: string;
  balances: Balances;
  year: number;
}) {
  const kinds = (Object.keys(BALANCE_KIND_LABELS) as BalanceKind[]).filter((k) => balances[k]);
  const initialValues = () =>
    Object.fromEntries(kinds.map((k) => [k, formatAmount(balances[k]!.remaining)]));
  const [values, setValues] = useState<Partial<Record<BalanceKind, string>>>(initialValues);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();

  // Modifiche rispetto ai saldi attuali (dopo il salvataggio la pagina si
  // aggiorna e tornano a zero).
  const dirty = kinds.some((k) => {
    const parsed = parseNumber(values[k] ?? "");
    return parsed === null || parsed !== balances[k]!.remaining;
  });

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const changes: { userId: string; kind: BalanceKind; remaining: number }[] = [];
    for (const k of kinds) {
      const parsed = parseNumber(values[k] ?? "");
      if (parsed === null) {
        setError(`${BALANCE_KIND_LABELS[k].fieldLabel}: inserisci un numero (es. 3 o 2,5)`);
        return;
      }
      if (parsed !== balances[k]!.remaining) {
        changes.push({ userId, kind: k, remaining: parsed });
      }
    }
    if (changes.length === 0) return;

    startSaving(async () => {
      try {
        const result = await setLeaveBalances(changes);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setSaved(true);
      } catch {
        setError("Salvataggio non riuscito, riprova.");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aggiorna saldi</CardTitle>
        <CardDescription>
          Scrivi il residuo che deve risultare oggi (anche con la virgola, es. 2,5). Da qui in poi
          le richieste approvate lo scalano.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {kinds.map((k) => {
            const { fieldLabel, unit } = BALANCE_KIND_LABELS[k];
            const id = `balance-${userId}-${k}`;
            return (
              <div key={k} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {fieldLabel} ({unit === "h" ? "ore" : "giorni"})
                </Label>
                <Input
                  id={id}
                  inputMode="decimal"
                  value={values[k] ?? ""}
                  aria-invalid={parseNumber(values[k] ?? "") === null || undefined}
                  disabled={saving}
                  onChange={(event) => {
                    const next = event.target.value;
                    setError(null);
                    setSaved(false);
                    setValues((current) => ({ ...current, [k]: next }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Goduti nel {year}: {formatAmount(balances[k]!.used)} {unit}
                </p>
              </div>
            );
          })}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {saved && !dirty && <p className={`text-sm ${TONE_TEXT.success}`}>Saldi salvati.</p>}
          <div className="flex justify-end gap-2">
            {dirty && (
              <Button
                type="button"
                variant="outline"
                disabled={saving}
                onClick={() => {
                  setValues(initialValues());
                  setError(null);
                }}
              >
                Annulla
              </Button>
            )}
            <Button type="submit" disabled={saving || !dirty}>
              {saving ? "Salvataggio..." : "Salva saldi"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
