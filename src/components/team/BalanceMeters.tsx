import type { BalanceKind } from "@/lib/constants";
import { formatAmount } from "@/lib/leave-format";
import type { BalanceFigures } from "@/lib/leave-balance";
import { cn } from "@/lib/utils";

export const BALANCE_KIND_LABELS: Record<
  BalanceKind,
  { label: string; fieldLabel: string; unit: "gg" | "h" }
> = {
  ferie: { label: "Ferie", fieldLabel: "Ferie residue", unit: "gg" },
  permesso: { label: "Permessi", fieldLabel: "Permessi residui", unit: "h" },
  assenze: { label: "Assenze", fieldLabel: "Assenze residue", unit: "gg" },
};

const KIND_ORDER: BalanceKind[] = ["ferie", "permesso", "assenze"];

// Saldi di un membro (solo quelli del suo contratto) e, se c'è, quanto resta
// da recuperare. Usato nella lista Team e nella scheda membro.
export function BalanceMeters({
  balances,
  toRecover,
  className,
}: {
  balances: Partial<Record<BalanceKind, BalanceFigures>>;
  // Recuperi da fare non ancora smaltiti, già formattati ("2 gg · 4 h").
  toRecover?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-x-8 gap-y-3", className)}>
      {KIND_ORDER.filter((kind) => balances[kind]).map((kind) => (
        <BalanceMeter key={kind} kind={kind} figures={balances[kind]!} />
      ))}
      {toRecover && (
        <div>
          <span className="block text-xs text-muted-foreground">Da recuperare</span>
          <span className="block text-base font-semibold whitespace-nowrap text-foreground">
            {toRecover}
          </span>
        </div>
      )}
    </div>
  );
}

// Residuo in evidenza rispetto al riferimento (monte annuale, per le ferie il
// maturato), con una barra di quanto resta. In negativo la barra è rossa e
// mostra di quanto si è sotto.
function BalanceMeter({ kind, figures }: { kind: BalanceKind; figures: BalanceFigures }) {
  const { label, unit } = BALANCE_KIND_LABELS[kind];
  const { remaining, reference, referenceNote } = figures;
  const negative = remaining < 0;
  const ratio = reference > 0 ? Math.min(Math.abs(remaining) / reference, 1) : 0;
  return (
    <div className="w-32">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <span className="block whitespace-nowrap">
        <span
          className={cn(
            "text-base font-semibold",
            negative ? "text-destructive" : "text-foreground"
          )}
        >
          {formatAmount(remaining)}
        </span>
        <span className="text-xs text-muted-foreground" title={referenceNote ?? "Monte annuale"}>
          {" "}
          / {formatAmount(reference)} {unit}
        </span>
      </span>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full", negative ? "bg-destructive" : "bg-primary")}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      {referenceNote && (
        <span className="mt-1 block text-xs text-muted-foreground">{referenceNote}</span>
      )}
      {negative && (
        <span className="mt-1 block text-xs font-medium text-destructive">In negativo</span>
      )}
    </div>
  );
}
