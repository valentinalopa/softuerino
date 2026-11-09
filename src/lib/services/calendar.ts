import "server-only";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/constants";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { ValidationError } from "@/lib/services/errors";

// Calendario di Softuerino per le interfacce che non sono le pagine web (app
// iPhone). I permessi stanno qui, non nelle route: le route mobili non ne
// aggiungono né ne tolgono. Le risposte sono oggetti già serializzabili (date
// come stringhe) e senza i campi che l'app non deve ricevere (note delle
// assenze, id delle richieste).

export type Viewer = { id: string; role: string };

export const MAX_RANGE_DAYS = 62;

// Le date a giornata (assenze, presenze) sono salvate a mezzanotte nel fuso del
// server (Europe/Rome): si esportano come AAAA-MM-GG nello stesso fuso.
function ymd(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDay(raw: unknown, label: string) {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new ValidationError(`Il parametro ${label} deve essere una data AAAA-MM-GG.`);
  }
  const [y, m, d] = raw.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new ValidationError(`Il parametro ${label} non è una data valida.`);
  }
  return date;
}

// Periodo [from, to] (estremi inclusi, giorni interi), al massimo 62 giorni.
export function parseCalendarRange(fromRaw: unknown, toRaw: unknown) {
  const from = parseDay(fromRaw, "from");
  const toDay = parseDay(toRaw, "to");
  if (toDay < from) throw new ValidationError("Il parametro to non può precedere from.");
  const days = Math.round((toDay.getTime() - from.getTime()) / 86_400_000) + 1;
  if (days > MAX_RANGE_DAYS) {
    throw new ValidationError(`Il periodo può essere al massimo di ${MAX_RANGE_DAYS} giorni.`);
  }
  const to = new Date(toDay.getFullYear(), toDay.getMonth(), toDay.getDate(), 23, 59, 59, 999);
  return { from, to };
}

// Eventi + assenze (malattia altrui mascherata) + presenze degli utenti attivi,
// con la stessa visibilità delle pagine Calendario e Presenze del team.
export async function listCalendar(viewer: Viewer, range: { from: Date; to: Date }) {
  const { from, to } = range;
  const [events, leaves, presences] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startAt: { lte: to }, endAt: { gte: from } },
      select: {
        id: true,
        title: true,
        type: true,
        startAt: true,
        endAt: true,
        location: true,
        description: true,
        createdById: true,
        participants: { select: { user: { select: { id: true, name: true } } } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: { not: "rejected" },
        startDate: { lte: to },
        endDate: { gte: from },
        user: { active: true },
      },
      select: {
        userId: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        hours: true,
        startTime: true,
        endTime: true,
        user: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.presenceEntry.findMany({
      where: { user: { active: true }, date: { gte: from, lte: to } },
      select: { userId: true, date: true, slot: true, mode: true, user: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { userId: "asc" }],
    }),
  ]);

  const admin = isAdminRole(viewer.role);
  return {
    events: events.map((e) => ({
      id: e.id,
      title: e.title,
      type: e.type,
      startAt: e.startAt.toISOString(),
      endAt: e.endAt.toISOString(),
      location: e.location,
      description: e.description,
      participants: e.participants.map((p) => ({ id: p.user.id, name: p.user.name })),
      // Stessa regola del web (eventAccessError): admin, creatore o partecipante.
      canEdit: admin || e.createdById === viewer.id || e.participants.some((p) => p.user.id === viewer.id),
    })),
    absences: leaves.map(({ user: owner, ...leave }) => {
      const masked = maskLeaveForViewer(leave, viewer);
      return {
        userId: masked.userId,
        userName: owner.name,
        type: masked.type,
        status: masked.status,
        startDate: ymd(masked.startDate),
        endDate: ymd(masked.endDate),
        hours: masked.hours,
        startTime: masked.startTime,
        endTime: masked.endTime,
      };
    }),
    presences: presences.map((p) => ({
      userId: p.userId,
      userName: p.user.name,
      date: ymd(p.date),
      slot: p.slot,
      mode: p.mode,
    })),
  };
}
