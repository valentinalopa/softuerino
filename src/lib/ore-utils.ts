export function parseDateParam(value?: string) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  return null;
}

export function formatHours(value: number) {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(
    value
  );
}

export function monthLabel(month: number) {
  return new Intl.DateTimeFormat("it-IT", { month: "long" }).format(
    new Date(2000, month - 1, 1)
  );
}

export type MonthlySummaryRow = { year: number; month: number; hours: number };

export function buildMonthlySummary(
  entries: { date: Date; hours: number }[]
): MonthlySummaryRow[] {
  const totals = new Map<string, MonthlySummaryRow>();

  for (const entry of entries) {
    const year = entry.date.getFullYear();
    const month = entry.date.getMonth() + 1;
    const key = `${year}-${month}`;
    const existing = totals.get(key);
    if (existing) {
      existing.hours += entry.hours;
    } else {
      totals.set(key, { year, month, hours: entry.hours });
    }
  }

  return Array.from(totals.values()).sort(
    (a, b) => b.year - a.year || b.month - a.month
  );
}
