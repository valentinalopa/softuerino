"use client";

import { useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export function CheckboxGroupField({
  name,
  options,
  defaultSelected = [],
}: {
  name: string;
  options: { id: string; label: string }[];
  // Preselezione per i form di modifica (il componente resta uncontrolled).
  defaultSelected?: string[];
}) {
  const [selected, setSelected] = useState<string[]>(defaultSelected);

  return (
    <div className="flex flex-wrap gap-4">
      {selected.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
      {options.map((option) => {
        const checked = selected.includes(option.id);
        return (
          <Label
            key={option.id}
            className="flex items-center gap-1.5 text-sm font-normal"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(next) => {
                setSelected((prev) =>
                  next
                    ? [...prev, option.id]
                    : prev.filter((id) => id !== option.id)
                );
              }}
            />
            {option.label}
          </Label>
        );
      })}
    </div>
  );
}
