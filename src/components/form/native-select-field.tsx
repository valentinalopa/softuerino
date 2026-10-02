"use client";

import { cn } from "@/lib/utils";
import { NativeSelect } from "@/components/ui/native-select";

export function NativeSelectField({
  id,
  name,
  defaultValue,
  items,
  onValueChange,
  className,
  fullWidth = false,
}: {
  id?: string;
  name: string;
  defaultValue?: string;
  items: { value: string; label: string }[];
  onValueChange?: (value: string) => void;
  className?: string;
  // Nei form verticali (sheet) i campi occupano tutta la larghezza.
  fullWidth?: boolean;
}) {
  return (
    <NativeSelect
      id={id}
      name={name}
      defaultValue={defaultValue}
      className={cn(fullWidth && "w-full", className)}
      containerClassName={fullWidth ? "w-full" : undefined}
      onChange={(event) => onValueChange?.(event.target.value)}
    >
      {items.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </NativeSelect>
  );
}
