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

// Ore con il cliente padre: le voci (es. "Organizzazione IT") contano nel
// totale del loro cliente (Colibri Vision).
export type ClientHoursEntryWithParent = ClientHoursEntry & {
  parentId: string | null;
  parentName: string | null;
};

// Le ore delle voci passano al cliente padre (grafici: un colore per cliente).
export function rollUpToParent(entries: ClientHoursEntryWithParent[]): ClientHoursEntry[] {
  return entries.map((entry) => ({
    date: entry.date,
    hours: entry.hours,
    clientId: entry.parentId ?? entry.clientId,
    clientName: entry.parentName ?? entry.clientName,
  }));
}

export type ClientBreakdownPart = { id: string; name: string; hours: number; months: number[] };
export type ClientBreakdownRow = ClientBreakdownPart & {
  // Ripartizione (ore dirette sul cliente + ogni voce); vuota se il cliente
  // non ha ore sulle voci.
  parts: ClientBreakdownPart[];
};

// Totale per cliente (voci comprese) e ripartizione, con le ore mese per
// mese sulla stessa finestra di buildHoursByClientByMonth.
export function buildClientBreakdown(
  entries: ClientHoursEntryWithParent[],
  monthsBack: number
): { months: string[]; rows: ClientBreakdownRow[] } {
  const now = new Date();
  const monthKeys = Array.from({ length: monthsBack }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1 - i), 1);
    return { key: `${d.getFullYear()}-${d.getMonth() + 1}`, label: shortMonthLabel(d.getFullYear(), d.getMonth() + 1) };
  });
  const monthIndex = new Map(monthKeys.map((m, i) => [m.key, i]));
  const emptyPart = (id: string, name: string): ClientBreakdownPart => ({
    id,
    name,
    hours: 0,
    months: monthKeys.map(() => 0),
  });
  const add = (part: ClientBreakdownPart, entry: ClientHoursEntry, i: number) => {
    part.hours += entry.hours;
    part.months[i] += entry.hours;
  };

  const rows = new Map<string, ClientBreakdownRow & { partsById: Map<string, ClientBreakdownPart>; hasChildHours: boolean }>();
  for (const entry of entries) {
    const i = monthIndex.get(`${entry.date.getFullYear()}-${entry.date.getMonth() + 1}`);
    if (i === undefined) continue;
    const topId = entry.parentId ?? entry.clientId;
    const topName = entry.parentName ?? entry.clientName;
    let row = rows.get(topId);
    if (!row) {
      row = { ...emptyPart(topId, topName), parts: [], partsById: new Map(), hasChildHours: false };
      rows.set(topId, row);
    }
    add(row, entry, i);
    if (entry.parentId) row.hasChildHours = true;
    let part = row.partsById.get(entry.clientId);
    if (!part) {
      part = emptyPart(entry.clientId, entry.clientName);
      row.partsById.set(entry.clientId, part);
    }
    add(part, entry, i);
  }

  return {
    months: monthKeys.map((m) => m.label),
    rows: Array.from(rows.values())
      .map(({ partsById, hasChildHours, ...row }) => ({
        ...row,
        // Prima le ore dirette sul cliente, poi le voci per nome.
        parts: hasChildHours
          ? Array.from(partsById.values()).sort(
              (a, b) => Number(b.id === row.id) - Number(a.id === row.id) || a.name.localeCompare(b.name)
            )
          : [],
      }))
      .sort((a, b) => b.hours - a.hours),
  };
}

export type LeaveTotals = {
  ferieDays: number;
  permessoHours: number;
  malattiaDays: number;
  assenzeDays: number;
  recuperoDays: number;
  recuperoHours: number;
  assenzeExtraDays: number;
};

// Aggregato di team: delega la classificazione a tallyLeave (leave-balance.ts),
// così saldo individuale e totali di panoramica non possono divergere.
// yearStart/yearEnd delimitano l'anno di riferimento: una richiesta a cavallo di
// due anni viene spalmata, contando solo i giorni dentro questo intervallo.
export function buildLeaveTotals(
  requests: {
    userId: string;
    type: string;
    status: string;
    startDate: Date;
    endDate: Date;
    hours: number | null;
  }[],
  yearStart: Date,
  yearEnd: Date,
  employmentTypeOf: (userId: string) => string | undefined
): LeaveTotals {
  const tally = tallyLeave(requests, yearStart, yearEnd, employmentTypeOf);
  return {
    ferieDays: tally.ferieUsed,
    permessoHours: tally.permessoUsed,
    malattiaDays: tally.malattiaDays,
    assenzeDays: tally.assenzaDays,
    recuperoDays: tally.recuperoDays,
    recuperoHours: tally.recuperoHours,
    assenzeExtraDays: tally.assenzaExtraDays,
  };
}
