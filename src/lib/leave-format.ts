import { countedLeaveDays } from "@/lib/leave-days";

export type LeaveRequestRow = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
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

export function formatDuration(request: LeaveRequestRow) {
  // A ore (permesso, recupero a ore): hours è valorizzato solo in quel caso.
  if (request.hours !== null) {
    return `${formatAmount(request.hours)} ore`;
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
