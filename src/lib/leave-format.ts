import { countedLeaveDays } from "@/lib/leave-balance";

export type LeaveRequestRow = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  status: string;
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
  if (request.type === "permesso") {
    return `${request.hours ?? 0} ore`;
  }
  // Stessa convenzione del saldo (domeniche escluse), così la durata mostrata
  // coincide con i giorni effettivamente scalati.
  return `${countedLeaveDays(request.startDate, request.endDate)} gg`;
}
