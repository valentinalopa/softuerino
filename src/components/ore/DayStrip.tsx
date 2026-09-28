import Link from "next/link";
import { TONE_DOT } from "@/lib/tones";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { appendQuery, cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { shortDayLabel } from "@/lib/calendar-utils";
import { dateKey } from "@/lib/attendance-utils";

export function DayStrip({
  days,
  selectedKey,
  windowKey,
  loggedKeys,
  prevHref,
  nextHref,
  basePath = "/ore",
}: {
  days: Date[];
  selectedKey: string;
  windowKey: string;
  loggedKeys: Set<string>;
  prevHref: string;
  nextHref: string;
  // Pagina che ospita la strip (es. "/ore" o "/team/abc?tab=ore").
  basePath?: string;
}) {
  const today = new Date();
  const todayKey = dateKey(today);

  return (
    <div className="flex items-center gap-2">
      <Link
        href={prevHref}
        aria-label="Giorni precedenti"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
      >
        <ChevronLeft className="size-4" />
      </Link>
      <div className="flex flex-1 gap-2 overflow-x-auto">
        {days.map((day) => {
          const key = dateKey(day);
          const selected = key === selectedKey;
          const logged = loggedKeys.has(key);
          const weekend = day.getDay() === 0 || day.getDay() === 6;
          const future = key > todayKey;

          const dotClass = logged
            ? TONE_DOT.success
            : weekend || future
              ? "bg-muted-foreground/30"
              : TONE_DOT.danger;

          return (
            <Link
              key={key}
              href={appendQuery(basePath, { date: key, window: windowKey })}
              className={cn(
                "flex min-w-16 flex-1 flex-col items-center gap-1.5 rounded-lg border border-surface-border bg-card px-2 py-2 text-center transition-colors duration-ds hover:bg-muted/40",
                selected && "border-foreground"
              )}
            >
              <span className="text-2xs text-muted-foreground">
                {shortDayLabel(day)}
              </span>
              <span className="text-lg font-semibold">{day.getDate()}</span>
              <span className={cn("size-2 rounded-full", dotClass)} />
            </Link>
          );
        })}
      </div>
      <Link
        href={nextHref}
        aria-label="Giorni successivi"
        className={cn(buttonVariants({ variant: "ghost", size: "icon-sm" }), "shrink-0")}
      >
        <ChevronRight className="size-4" />
      </Link>
    </div>
  );
}
