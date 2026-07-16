"use client";

import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SelectField({
  name,
  defaultValue,
  items,
  placeholder,
  onValueChange,
  className,
}: {
  name: string;
  defaultValue?: string;
  items: { value: string; label: string }[];
  placeholder?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(defaultValue ?? "");

  return (
    <>
      <input type="hidden" name={name} value={value} />
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          const value = next ?? "";
          setValue(value);
          onValueChange?.(value);
        }}
      >
        <SelectTrigger className={className}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
