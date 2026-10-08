import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MonthYearPicker } from "@/components/calendar/MonthYearPicker";

export function MonthNav({
  todayHref,
  prevHref,
  nextHref,
  monthLabel,
  current,
}: {
  todayHref: string;
  prevHref: string;
  nextHref: string;
  monthLabel: string;
  // Mese mostrato (AAAA-MM): il titolo apre la scelta di mese e anno, che
  // porta a todayHref + ?month=...
  current?: string;
}) {
  const [year, month] = (current ?? "").split("-").map(Number);
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={todayHref}
        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
      >
        Oggi
      </Link>
      <div className="flex items-center">
        <Link
          href={prevHref}
          aria-label="Mese precedente"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronLeft className="size-4" />
        </Link>
        <Link
          href={nextHref}
          aria-label="Mese successivo"
          className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }))}
        >
          <ChevronRight className="size-4" />
        </Link>
      </div>
      {current ? (
        <MonthYearPicker label={monthLabel} year={year} month={month - 1} baseHref={todayHref} />
      ) : (
        <h2 className="capitalize">{monthLabel}</h2>
      )}
    </div>
  );
}
