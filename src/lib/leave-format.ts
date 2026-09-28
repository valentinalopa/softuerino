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
};

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
    return `${request.hours} ore`;
  }
  // Stessa convenzione del saldo (domeniche escluse), così la durata mostrata
  // coincide con i giorni effettivamente scalati.
  return `${countedLeaveDays(request.startDate, request.endDate)} gg`;
}
