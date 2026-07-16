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
          "h-8 appearance-none rounded-lg border border-input bg-transparent py-1 pr-8 pl-2.5 text-sm outline-none transition-colors",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30 dark:hover:bg-input/50",
          className
        )}
      />
      <ChevronDownIcon className="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}
