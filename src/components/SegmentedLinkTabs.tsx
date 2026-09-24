import Link from "next/link";
import { cn } from "@/lib/utils";

// DS Tabs, variante "pill": guscio Neutral 100, tab attiva bianca con ombra xs.
export function SegmentedLinkTabs({
  items,
}: {
  items: { key: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-muted p-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "rounded-full px-4 py-2 text-sm leading-none whitespace-nowrap transition-colors duration-[120ms] ease-ds",
            item.active
              ? "bg-card font-semibold text-primary-soft-foreground shadow-xs"
              : "font-medium text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
