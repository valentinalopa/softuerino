import Link from "next/link";
import { cn } from "@/lib/utils";

// DS Tabs, variante "pill": guscio Neutral 100, tab attiva bianca con ombra xs.
// Unico stile di tab dell'app: con link (navigazione) o con pulsanti (stato
// locale, es. vista del calendario).
const TRACK = "flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-surface-border bg-muted p-1";

function itemClass(active: boolean) {
  return cn(
    // Su mobile più compatte: ci stanno anche 4-5 schede senza scorrere.
    "rounded-full px-2.5 py-2 text-xs leading-none whitespace-nowrap transition-colors duration-ds ease-ds sm:px-4 sm:text-sm",
    active
      ? "bg-card font-semibold text-primary-soft-foreground shadow-xs"
      : "font-medium text-muted-foreground hover:text-foreground"
  );
}

export function SegmentedLinkTabs({
  items,
}: {
  items: { key: string; label: string; href: string; active: boolean }[];
}) {
  return (
    <div className={TRACK}>
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
          className={itemClass(item.active)}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}

export function SegmentedButtonTabs<K extends string>({
  items,
  value,
  onChange,
}: {
  items: { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
}) {
  return (
    <div className={TRACK} role="group">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          aria-pressed={item.key === value}
          onClick={() => onChange(item.key)}
          className={itemClass(item.key === value)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
