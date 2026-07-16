import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function MonthNav({
  todayHref,
  prevHref,
  nextHref,
  monthLabel,
}: {
  todayHref: string;
  prevHref: string;
  nextHref: string;
  monthLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
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
      <h2 className="text-lg font-semibold capitalize">{monthLabel}</h2>
    </div>
  );
}
