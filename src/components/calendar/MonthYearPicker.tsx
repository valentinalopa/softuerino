"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { appendQuery, cn } from "@/lib/utils";

const MONTHS = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

// Titolo del calendario cliccabile: si apre la vista dei 12 mesi dell'anno;
// cliccando sull'anno, la vista di 5 anni (i tre precedenti, quello corrente
// e il successivo). Scegliere un mese porta il calendario lì: con onSelect
// (stato nel browser) o con baseHref (pagine che usano ?month=AAAA-MM).
export function MonthYearPicker({
  label,
  year,
  month,
  onSelect,
  baseHref,
}: {
  label: string;
  year: number;
  month: number; // 0-11
  onSelect?: (year: number, month: number) => void;
  baseHref?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"months" | "years">("months");
  const [shownYear, setShownYear] = useState(year);
  const today = new Date();
  const thisYear = today.getFullYear();
  const years = [thisYear - 3, thisYear - 2, thisYear - 1, thisYear, thisYear + 1];

  function choose(y: number, m: number) {
    setOpen(false);
    if (onSelect) onSelect(y, m);
    else if (baseHref) router.push(appendQuery(baseHref, { month: `${y}-${String(m + 1).padStart(2, "0")}` }));
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setMode("months");
          setShownYear(year);
        }
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex min-w-0 items-center gap-1 rounded-lg px-1.5 py-0.5 text-left transition-colors duration-ds hover:bg-subtle"
            aria-label={`${label}: scegli mese e anno`}
          />
        }
      >
        <h2 className="truncate capitalize">{label}</h2>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[17.5rem]">
        {mode === "months" ? (
          <>
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Anno precedente" onClick={() => setShownYear((y) => y - 1)}>
                <ChevronLeft className="size-4" />
              </Button>
              <button
                type="button"
                onClick={() => setMode("years")}
                className="rounded-lg px-2 py-1 font-heading text-base font-semibold hover:bg-subtle"
                aria-label={`${shownYear}: scegli l'anno`}
              >
                {shownYear}
              </button>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Anno successivo" onClick={() => setShownYear((y) => y + 1)}>
                <ChevronRight className="size-4" />
              </Button>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {MONTHS.map((name, m) => {
                const isShown = shownYear === year && m === month;
                const isToday = shownYear === today.getFullYear() && m === today.getMonth();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => choose(shownYear, m)}
                    aria-current={isShown ? "date" : undefined}
                    className={cn(
                      "rounded-lg px-2 py-2 text-sm transition-colors duration-ds",
                      isShown
                        ? "bg-primary font-semibold text-primary-foreground"
                        : isToday
                          ? "border border-primary-border text-primary-soft-foreground hover:bg-primary-soft"
                          : "hover:bg-subtle"
                    )}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <p className="text-center font-heading text-base font-semibold">Anno</p>
            <div className="grid grid-cols-1 gap-1.5">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  onClick={() => {
                    setShownYear(y);
                    setMode("months");
                  }}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm transition-colors duration-ds",
                    y === shownYear ? "bg-primary font-semibold text-primary-foreground" : "hover:bg-subtle",
                    y === thisYear && y !== shownYear && "border border-primary-border"
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}
