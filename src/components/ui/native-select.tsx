"use client";

import type { SelectHTMLAttributes } from "react";
import { ChevronDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function NativeSelect({
  className,
  containerClassName,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  // Per i form verticali (sheet/dialog): "w-full" allarga campo e wrapper.
  containerClassName?: string;
}) {
  return (
    // w-fit: nei layout flex/grid il wrapper non deve stirarsi oltre la select,
    // altrimenti la freccetta (ancorata al bordo destro del wrapper) resta
    // staccata dal campo.
    <div className={cn("relative inline-block w-fit max-w-full", containerClassName)}>
      <select
        {...props}
        className={cn(
          "h-10 max-w-full appearance-none rounded-lg py-1 pr-10 pl-3.5 text-base",
          "border border-input bg-card text-foreground shadow-xs transition-[border-color,box-shadow] duration-ds ease-ds outline-none placeholder:text-muted-foreground focus-visible:border-input-focus focus-visible:ring-4 focus-visible:ring-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-disabled-foreground disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15",
          className
        )}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-3.5 size-4.5 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
