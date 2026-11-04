"use client";

import { ClockIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const SLOTS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hour = String(Math.floor(i / 4)).padStart(2, "0");
  const minute = String((i % 4) * 15).padStart(2, "0");
  return `${hour}:${minute}`;
});

export function TimeField({
  id,
  value,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <Select
      items={SLOTS.map((slot) => ({ value: slot, label: slot }))}
      value={value || null}
      onValueChange={(next) => next && onChange(next)}
    >
      <SelectTrigger
        id={id}
        className={cn("gap-1.5 font-normal", className)}
      >
        <ClockIcon className="size-4 shrink-0 text-muted-foreground" />
        <SelectValue placeholder="--:--" className="tabular-nums data-placeholder:text-muted-foreground" />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {SLOTS.map((slot) => (
          <SelectItem key={slot} value={slot}>
            {slot}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
