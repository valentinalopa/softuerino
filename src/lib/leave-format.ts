import { countedLeaveDays } from "@/lib/leave-days";

export type LeaveRequestRow = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  startTime?: string | null;
  endTime?: string | null;
  status: string;
  note?: string | null;
  createdAt: Date;
  user?: { name: string };
  // Solo per i recuperi collegati a un recupero da fare.
  recoveryCredit?: RecoveryCreditRef | null;
};

export type RecoveryCreditRef = { reason: string; amount: number; unit: string };

// Numeri all'italiana (2,5), senza decimali inutili: saldi, ore, giorni.
export function formatAmount(value: number) {
  return value.toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: false });
}

// "Trasferta Milano (2 gg)": cosa sta recuperando una richiesta di recupero.
export function formatRecoveryCredit(credit: RecoveryCreditRef) {
  return `${credit.reason} (${formatAmount(credit.amount)} ${credit.unit === "ore" ? "h" : "gg"})`;
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export function formatRange(start: Date, end: Date) {
  return `${formatDate(start)} → ${formatDate(end)}`;
}

type DatedRequest = {
  startDate: Date;
  endDate: Date;
  hours: number | null;
  startTime?: string | null;
  endTime?: string | null;
};

// Periodo di una richiesta: le richieste a ore stanno in un giorno solo, la
// data basta (la fascia è nella durata).
export function formatPeriod(request: DatedRequest) {
  return request.hours !== null
    ? formatDate(request.startDate)
    : formatRange(request.startDate, request.endDate);
}

// Quando, in una riga sola (richieste in attesa): data e fascia per quelle a ore.
export function formatWhen(request: DatedRequest) {
  if (request.hours === null) return formatRange(request.startDate, request.endDate);
  return `${formatDate(request.startDate)} · ${formatHourlySlot({ ...request, hours: request.hours })}`;
}

// Fascia oraria di una richiesta a ore ("09:00–11:00"), o null se manca
// (richieste a giornata, o a ore create prima che si salvasse la fascia).
export function formatTimeRange(request: { startTime?: string | null; endTime?: string | null }) {
  if (!request.startTime || !request.endTime) return null;
  return `${request.startTime}–${request.endTime}`;
}

// Etichetta corta per i calendari: la fascia se c'è, altrimenti le ore.
export function formatHourlySlot(request: {
  hours: number;
  startTime?: string | null;
  endTime?: string | null;
}) {
  return formatTimeRange(request) ?? `${formatAmount(request.hours)}h`;
}

// Durata in ore tra due orari "HH:MM" della stessa giornata, o null se non
// validi o se la fine non segue l'inizio.
export function hoursBetween(startTime: string, endTime: string) {
  const toMinutes = (time: string) => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  };
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null || end <= start) return null;
  return Math.round(((end - start) / 60) * 100) / 100;
}

export function formatDuration(request: LeaveRequestRow) {
  // A ore (permesso, recupero a ore): hours è valorizzato solo in quel caso.
  if (request.hours !== null) {
    const range = formatTimeRange(request);
    const hours = `${formatAmount(request.hours)} ore`;
    return range ? `${range} (${hours})` : hours;
  }
  // Stessa convenzione del saldo (domeniche escluse), così la durata mostrata
  // coincide con i giorni effettivamente scalati.
  return `${countedLeaveDays(request.startDate, request.endDate)} gg`;
}

// Quanto resta da recuperare (recuperi non fatti), separato per unità:
// "2 gg · 4 h", oppure "" se non c'è nulla.
export function formatToRecover(
  credits: { status: string; unit: string; amount: number; used: number }[]
) {
  const totals = { giorni: 0, ore: 0 };
  for (const credit of credits) {
    if (credit.status === "fatto") continue;
    totals[credit.unit === "ore" ? "ore" : "giorni"] += Math.max(credit.amount - credit.used, 0);
  }
  const parts = [];
  if (totals.giorni > 0) parts.push(`${formatAmount(totals.giorni)} gg`);
  if (totals.ore > 0) parts.push(`${formatAmount(totals.ore)} h`);
  return parts.join(" · ");
}
