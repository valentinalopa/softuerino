"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export type CheckboxOption = {
  id: string;
  label: string;
  // Non selezionabile (es. membro assente): resta visibile ma spento.
  disabled?: boolean;
  // Nota accanto all'etichetta (motivo del blocco o avviso).
  hint?: string;
  hintTone?: "muted" | "warning";
};

export function CheckboxGroupField({
  name,
  options,
  defaultSelected = [],
  direction = "row",
}: {
  name: string;
  options: CheckboxOption[];
  // Preselezione per i form di modifica (il componente resta uncontrolled).
  defaultSelected?: string[];
  // "column" per elenchi lunghi o con note (una voce per riga).
  direction?: "row" | "column";
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);
  // Un'opzione che diventa non selezionabile (es. cambiano le date) esce
  // dalla selezione inviata anche se era stata spuntata prima.
  const disabledIds = new Set(options.filter((o) => o.disabled).map((o) => o.id));
  const effective = selected.filter((id) => !disabledIds.has(id));

  return (
    <div className={cn("flex", direction === "row" ? "flex-wrap gap-4" : "flex-col gap-2.5")}>
      {effective.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {options.map((option) => {
        const checked = effective.includes(option.id);
        return (
          <Label
            key={option.id}
            className={cn(
              "flex items-center gap-1.5 text-sm font-normal",
              option.disabled && "cursor-not-allowed text-muted-foreground"
            )}
          >
            <Checkbox
              checked={checked}
              disabled={option.disabled}
              onCheckedChange={(next) => {
                setSelected((prev) =>
                  next
                    ? [...prev, option.id]
                    : prev.filter((id) => id !== option.id)
                );
              }}
            />
            {option.label}
            {option.hint && (
              <span
                className={cn(
                  "text-xs",
                  option.hintTone === "warning"
                    ? "text-warning-soft-foreground"
                    : "text-muted-foreground"
                )}
              >
                · {option.hint}
              </span>
            )}
          </Label>
        );
      })}
    </div>
  );
}
