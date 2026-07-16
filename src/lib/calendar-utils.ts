export function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export function addMonths(date: Date, months: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

// Settimana che inizia di lunedì.
export function startOfWeek(date: Date) {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  return addDays(d, diff);
}

export function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function minutesFromMidnight(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
}

// Un evento "tocca" il giorno se il suo intervallo interseca [00:00, 24:00):
// serve per mostrare gli eventi multi-giorno anche nei giorni successivi al
// primo, non solo in quello di inizio.
export function eventTouchesDay(
  event: { startAt: Date; endAt: Date },
  day: Date
) {
  const dayStart = startOfDay(day);
  const dayEnd = addDays(dayStart, 1);
  return event.startAt < dayEnd && event.endAt > dayStart;
}

export type PositionedEvent<T> = {
  event: T;
  col: number;
  totalCols: number;
};

// Assegna colonne agli eventi sovrapposti di uno stesso giorno, per un layout "a fianco" nella time grid.
export function layoutOverlappingEvents<T extends { startAt: Date; endAt: Date }>(
  events: T[]
): PositionedEvent<T>[] {
  const sorted = [...events].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime()
  );

  const result: PositionedEvent<T>[] = [];
  let cluster: { event: T; col: number }[] = [];
  let clusterEnd = -Infinity;

  function flushCluster() {
    if (cluster.length === 0) return;
    const totalCols = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const c of cluster) {
      result.push({ event: c.event, col: c.col, totalCols });
    }
    cluster = [];
    clusterEnd = -Infinity;
  }

  for (const event of sorted) {
    if (cluster.length > 0 && event.startAt.getTime() >= clusterEnd) {
      flushCluster();
    }

    const colEnds: number[] = [];
    for (const c of cluster) {
      colEnds[c.col] = Math.max(colEnds[c.col] ?? -Infinity, c.event.endAt.getTime());
    }
    let col = 0;
    while (colEnds[col] !== undefined && colEnds[col] > event.startAt.getTime()) {
      col++;
    }
    cluster.push({ event, col });
    clusterEnd = Math.max(clusterEnd, event.endAt.getTime());
  }
  flushCluster();

  return result;
}

const DAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function shortDayLabel(date: Date) {
  const day = date.getDay();
  return DAY_LABELS[day === 0 ? 6 : day - 1];
}

export function formatMonthYear(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatDayMonth(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
  }).format(date);
}

export function formatFullDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function formatFullDateNoYear(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
}

export function formatWeekRange(weekStart: Date) {
  const weekEnd = addDays(weekStart, 6);
  const sameMonth = weekStart.getMonth() === weekEnd.getMonth();
  const startLabel = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: sameMonth ? undefined : "short",
  }).format(weekStart);
  const endLabel = new Intl.DateTimeFormat("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(weekEnd);
  return `${startLabel} – ${endLabel}`;
}

export function formatTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
