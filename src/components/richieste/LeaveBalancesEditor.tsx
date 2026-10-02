"use client";

import { useState, useTransition } from "react";
import { ChevronRight } from "lucide-react";
import { setLeaveBalances } from "@/lib/actions";
import { formatDate } from "@/lib/leave-format";
import {
  EMPLOYMENT_TYPE_LABELS,
  type BalanceKind,
  type EmploymentType,
} from "@/lib/constants";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type BalanceFigures = { remaining: number; allowance: number; used: number };

export type BalanceRow = {
  userId: string;
  name: string;
  employmentType: EmploymentType;
  // Solo i saldi che valgono per il tipo di rapporto del membro.
  balances: Partial<Record<BalanceKind, BalanceFigures>>;
  // Ultima rettifica del super admin nell'anno, se c'è.
  updatedAt: Date | null;
};

const KINDS: { kind: BalanceKind; label: string; fieldLabel: string; unit: string }[] = [
  { kind: "ferie", label: "Ferie", fieldLabel: "Ferie residue", unit: "gg" },
  { kind: "permesso", label: "Permessi", fieldLabel: "Permessi residui", unit: "h" },
  { kind: "assenze", label: "Assenze", fieldLabel: "Assenze residue", unit: "gg" },
];

function formatNumber(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: false });
}

// Accetta la virgola come nell'Excel (2,5) e i negativi (chi ha già sforato).
function parseNumber(raw: string): number | null {
  const normalized = raw.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

// Saldi residui di tutto il team (solo super admin): la tabella è di sola
// lettura, il clic su una riga apre il pannello per modificare i saldi di
// quel membro.
export function LeaveBalancesEditor({ rows, year }: { rows: BalanceRow[]; year: number }) {
  // Si tiene l'id, non la riga: dopo il salvataggio la pagina si aggiorna e
  // il pannello mostrerebbe i valori nuovi.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = rows.find((row) => row.userId === selectedId) ?? null;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Membro</TableHead>
            <TableHead>Saldo residuo {year}</TableHead>
            <TableHead>Aggiornato il</TableHead>
            <TableHead className="w-10">
              <span className="sr-only">Apri</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.userId}
              tabIndex={0}
              aria-label={`Modifica saldi di ${row.name}`}
              className="group cursor-pointer focus-visible:bg-subtle focus-visible:outline-none"
              onClick={() => setSelectedId(row.userId)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(row.userId);
                }
              }}
            >
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar size="sm">
                    <AvatarFallback>{getInitials(row.name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <span className="block truncate font-medium text-foreground">{row.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {EMPLOYMENT_TYPE_LABELS[row.employmentType]}
                    </span>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                  {KINDS.filter((k) => row.balances[k.kind]).map((k) => (
                    <BalanceMeter key={k.kind} label={k.label} unit={k.unit} figures={row.balances[k.kind]!} />
                  ))}
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {row.updatedAt ? formatDate(row.updatedAt) : "Mai"}
              </TableCell>
              <TableCell className="text-right">
                <ChevronRight className="ml-auto size-4 text-muted-foreground transition-transform duration-ds ease-ds group-hover:translate-x-0.5 group-hover:text-foreground" />
              </TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={4} className="text-center text-muted-foreground">
                Nessun membro attivo.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent>
          {selected && (
            <BalanceForm
              // Rimonta il form a ogni apertura: i campi ripartono dai saldi attuali.
              key={selected.userId}
              row={selected}
              year={year}
              onSaved={() => setSelectedId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

// Residuo in evidenza, disponibile accanto e una barra di quanto resta.
function BalanceMeter({
  label,
  unit,
  figures,
}: {
  label: string;
  unit: string;
  figures: BalanceFigures;
}) {
  const negative = figures.remaining < 0;
  const ratio =
    figures.allowance > 0 ? Math.min(Math.max(figures.remaining / figures.allowance, 0), 1) : 0;
  return (
    <div className="w-32">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block whitespace-nowrap">
        <span
          className={`text-base font-semibold ${negative ? "text-destructive" : "text-foreground"}`}
        >
          {formatNumber(figures.remaining)}
        </span>
        <span className="text-xs text-muted-foreground">
          {" "}
          / {formatNumber(figures.allowance)} {unit}
        </span>
      </span>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={`h-full rounded-full ${negative ? "bg-destructive" : "bg-primary"}`}
          style={{ width: `${negative ? 100 : ratio * 100}%` }}
        />
      </div>
    </div>
  );
}

function BalanceForm({
  row,
  year,
  onSaved,
}: {
  row: BalanceRow;
  year: number;
  onSaved: () => void;
}) {
  const kinds = KINDS.filter((k) => row.balances[k.kind]);
  const [values, setValues] = useState<Partial<Record<BalanceKind, string>>>(() =>
    Object.fromEntries(
      kinds.map((k) => [k.kind, formatNumber(row.balances[k.kind]!.remaining)])
    )
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const changes: { userId: string; kind: BalanceKind; remaining: number }[] = [];
    for (const k of kinds) {
      const parsed = parseNumber(values[k.kind] ?? "");
      if (parsed === null) {
        setError(`${k.fieldLabel}: inserisci un numero (es. 3 o 2,5)`);
        return;
      }
      if (parsed !== row.balances[k.kind]!.remaining) {
        changes.push({ userId: row.userId, kind: k.kind, remaining: parsed });
      }
    }
    if (changes.length === 0) {
      onSaved();
      return;
    }

    startSaving(async () => {
      try {
        const result = await setLeaveBalances(changes);
        if (result?.error) {
          setError(result.error);
          return;
        }
        onSaved();
      } catch {
        setError("Salvataggio non riuscito, riprova.");
      }
    });
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>{row.name}</SheetTitle>
        <SheetDescription>
          {EMPLOYMENT_TYPE_LABELS[row.employmentType]} · saldi {year}
        </SheetDescription>
      </SheetHeader>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <SheetBody className="space-y-5">
          <p className="text-sm text-muted-foreground">
            Scrivi il residuo che deve risultare oggi (anche con la virgola, es. 2,5). Da qui in
            poi le richieste approvate lo scalano.
          </p>
          {kinds.map((k) => {
            const figures = row.balances[k.kind]!;
            const id = `balance-${row.userId}-${k.kind}`;
            return (
              <div key={k.kind} className="flex flex-col gap-1.5">
                <Label htmlFor={id}>
                  {k.fieldLabel} ({k.unit === "h" ? "ore" : "giorni"})
                </Label>
                <Input
                  id={id}
                  inputMode="decimal"
                  value={values[k.kind] ?? ""}
                  aria-invalid={parseNumber(values[k.kind] ?? "") === null || undefined}
                  disabled={saving}
                  onChange={(event) => {
                    const next = event.target.value;
                    setError(null);
                    setValues((current) => ({ ...current, [k.kind]: next }));
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Ora: {formatNumber(figures.remaining)} {k.unit} su{" "}
                  {formatNumber(figures.allowance)} · goduti nel {year}: {formatNumber(figures.used)}{" "}
                  {k.unit}
                </p>
              </div>
            );
          })}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </SheetBody>
        <SheetFooter>
          <Button type="submit" disabled={saving}>
            {saving ? "Salvataggio..." : "Salva"}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}
