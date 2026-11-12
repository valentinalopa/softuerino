import type { HourBalance } from "@/lib/leave-balance";
import { formatAmount } from "@/lib/leave-format";
import { cn } from "@/lib/utils";

const MONTH_FORMAT = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" });

// Saldi in ore di un dipendente nelle stesse voci della busta paga (residuo,
// maturato, goduto), così si confrontano riga per riga.
export function PayslipComparison({
  startMonth,
  ferie,
  permesso,
}: {
  startMonth: Date;
  ferie: HourBalance;
  permesso: HourBalance;
}) {
  const rows: { label: string; pick: (b: HourBalance) => number; strong?: boolean; hint?: string }[] = [
    { label: `Residuo a fine ${MONTH_FORMAT.format(startMonth)}`, pick: (b) => b.start, hint: "dalla busta paga" },
    { label: "Maturato da allora", pick: (b) => b.accrued, hint: "a fine di ogni mese" },
    { label: "Goduto da allora", pick: (b) => -b.used, hint: "richieste approvate fino a oggi" },
    { label: "Residuo oggi", pick: (b) => b.remaining, strong: true },
    { label: "Già approvato più avanti", pick: (b) => -b.planned },
    { label: "Resta da chiedere", pick: (b) => b.afterPlanned, strong: true },
  ];
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-xs text-muted-foreground">
          <th className="py-2 text-left font-normal">Ore</th>
          <th className="py-2 text-right font-normal">Ferie</th>
          <th className="py-2 text-right font-normal">ROL</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border-subtle">
        {rows.map((row) => (
          <tr key={row.label} className={cn(row.strong && "font-medium text-foreground")}>
            <td className="py-2 pr-2">
              <span className="block">{row.label}</span>
              {row.hint && <span className="block text-xs text-muted-foreground">{row.hint}</span>}
            </td>
            <Cell value={row.pick(ferie)} />
            <Cell value={row.pick(permesso)} />
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Cell({ value: raw }: { value: number }) {
  // Niente "-0" quando una voce col segno meno è vuota.
  const value = raw === 0 ? 0 : raw;
  return (
    <td className={cn("py-2 text-right tabular-nums", value < 0 && "text-destructive")}>
      {formatAmount(value)}
    </td>
  );
}
