import Link from "next/link";
import { cn } from "@/lib/utils";

export function SegmentedLinkTabs({
  items,
}: {
  items: { key: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <div className="flex w-fit rounded-md border p-0.5">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            "rounded-[calc(var(--radius-md)-2px)] px-3 py-1 text-sm transition-colors",
            item.active
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
