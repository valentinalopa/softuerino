import { formatHours } from "@/lib/ore-utils";

export function LoggedHoursSummary({
  entries,
}: {
  entries: { clientName: string; hours: number }[];
}) {
  return (
    <div className="divide-y overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
      {entries.map((entry, i) => (
        <div
          key={`${entry.clientName}-${i}`}
          className="flex items-center justify-between gap-3 px-4 py-3"
        >
          <span className="font-medium">{entry.clientName}</span>
          <span className="text-muted-foreground">{formatHours(entry.hours)}</span>
        </div>
      ))}
    </div>
  );
}
