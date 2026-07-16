import { tallyLeave } from "@/lib/leave-balance";

export type ClientHoursEntry = {
  date: Date;
  hours: number;
  clientId: string;
  clientName: string;
};

export type HoursByClientMonthRow = {
  key: string;
  label: string;
  [clientId: string]: string | number;
};

export type ClientRef = { id: string; name: string };

function shortMonthLabel(year: number, month: number) {
  const label = new Intl.DateTimeFormat("it-IT", { month: "short" }).format(
    new Date(year, month - 1, 1)
  );
  return `${label} '${String(year).slice(2)}`;
}

// Righe mensili pivotate per cliente (chiave = clientId, sempre CSS-safe a
// differenza del nome cliente), finestra scorrevole di `monthsBack` mesi
// (incluso il mese corrente), pronte per un bar chart stacked.
export function buildHoursByClientByMonth(
  entries: ClientHoursEntry[],
  monthsBack: number
): { rows: HoursByClientMonthRow[]; clients: ClientRef[] } {
  const now = new Date();
  const months = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth() + 1}`, year: d.getFullYear(), month: d.getMonth() + 1 };
  });

  const clientsById = new Map<string, string>();
  for (const entry of entries) clientsById.set(entry.clientId, entry.clientName);
  const clients = Array.from(clientsById.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const rows: HoursByClientMonthRow[] = months.map(({ key, year, month }) => {
    const row: HoursByClientMonthRow = { key, label: shortMonthLabel(year, month) };
    for (const client of clients) row[client.id] = 0;
    return row;
  });

  const rowByKey = new Map(rows.map((r) => [r.key, r]));

  for (const entry of entries) {
    const key = `${entry.date.getFullYear()}-${entry.date.getMonth() + 1}`;
    const row = rowByKey.get(key);
    if (!row) continue;
    row[entry.clientId] = (row[entry.clientId] as number) + entry.hours;
  }

  return { rows, clients };
}

export type ClientTotal = { id: string; name: string; hours: number };

export function buildClientTotals(entries: ClientHoursEntry[]): ClientTotal[] {
  const totals = new Map<string, ClientTotal>();
  for (const entry of entries) {
    const existing = totals.get(entry.clientId);
    if (existing) {
      existing.hours += entry.hours;
    } else {
      totals.set(entry.clientId, { id: entry.clientId, name: entry.clientName, hours: entry.hours });
    }
  }
  return Array.from(totals.values()).sort((a, b) => b.hours - a.hours);
}

export type LeaveTotals = {
  ferieDays: number;
  permessoHours: number;
  malattiaDays: number;
  assenzeDays: number;
};

// Aggregato di team: delega la classificazione a tallyLeave (leave-balance.ts),
// così saldo individuale e totali di panoramica non possono divergere.
// yearStart/yearEnd delimitano l'anno di riferimento: una richiesta a cavallo di
// due anni viene spalmata, contando solo i giorni dentro questo intervallo.
export function buildLeaveTotals(
  requests: {
    type: string;
    status: string;
    startDate: Date;
    endDate: Date;
    hours: number | null;
  }[],
  yearStart: Date,
  yearEnd: Date
): LeaveTotals {
  const tally = tallyLeave(requests, yearStart, yearEnd);
  return {
    ferieDays: tally.ferieUsed,
    permessoHours: tally.permessoUsed,
    malattiaDays: tally.malattiaDays,
    assenzeDays: tally.assenzaDays,
  };
}
