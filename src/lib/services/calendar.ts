import "server-only";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/constants";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { peopleInScope } from "@/lib/permissions";
import { NotFoundError, ValidationError } from "@/lib/services/errors";

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

// Campi di un evento letti dal database e loro forma per le interfacce.
export const EVENT_SELECT = {
  id: true,
  title: true,
  type: true,
  startAt: true,
  endAt: true,
  location: true,
  description: true,
  createdById: true,
  participants: { select: { user: { select: { id: true, name: true } } } },
} as const;

type EventRow = {
  id: string;
  title: string;
  type: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  description: string | null;
  createdById: string | null;
  participants: { user: { id: string; name: string } }[];
};

export function toEventDto(e: EventRow, viewer: Viewer) {
  return {
    id: e.id,
    title: e.title,
    type: e.type,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    location: e.location,
    description: e.description,
    participants: e.participants.map((p) => ({ id: p.user.id, name: p.user.name })),
    // Stessa regola del web (eventAccessError): admin, creatore o partecipante.
    canEdit:
      isAdminRole(viewer.role) ||
      e.createdById === viewer.id ||
      e.participants.some((p) => p.user.id === viewer.id),
  };
}

export const UPCOMING_DAYS = 7;
export const UPCOMING_MAX = 20;

// Widget: prossimi eventi dei prossimi 7 giorni (compreso quello in corso) in cui
// la persona è partecipante o creatrice, come "Prossimi eventi" della dashboard
// (anche per gli admin). Solo i campi minimi: niente luogo, descrizione,
// partecipanti, assenze o presenze (minimizzazione: il widget sta sulla Home).
export async function upcomingEvents(viewer: Viewer, now = new Date(), days = UPCOMING_DAYS) {
  const until = new Date(now.getTime() + days * 86_400_000);
  const events = await prisma.calendarEvent.findMany({
    where: {
      endAt: { gte: now },
      startAt: { lte: until },
      OR: [{ participants: { some: { userId: viewer.id } } }, { createdById: viewer.id }],
    },
    select: { id: true, title: true, type: true, startAt: true, endAt: true },
    orderBy: { startAt: "asc" },
    take: UPCOMING_MAX,
  });
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    type: e.type,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
  }));
}

// Calendario dell'app: gli eventi (visibili a tutti gli utenti attivi, come nel
// web) e SOLO le assenze e le presenze della persona stessa. Quelle dei colleghi
// stanno in listTeamCalendar (solo admin e responsabili). Nelle assenze non
// escono né la nota né l'id della richiesta.
export async function listCalendar(viewer: Viewer, range: { from: Date; to: Date }) {
  const { from, to } = range;
  const [events, leaves, presences] = await Promise.all([
    prisma.calendarEvent.findMany({
      where: { startAt: { lte: to }, endAt: { gte: from } },
      select: EVENT_SELECT,
      orderBy: { startAt: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId: viewer.id,
        status: { not: "rejected" },
        startDate: { lte: to },
        endDate: { gte: from },
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
      },
      orderBy: { startDate: "asc" },
    }),
    prisma.presenceEntry.findMany({
      where: { userId: viewer.id, date: { gte: from, lte: to } },
      select: { date: true, slot: true, mode: true },
      orderBy: { date: "asc" },
    }),
  ]);

  return {
    events: events.map((e) => toEventDto(e, viewer)),
    absences: leaves.map((leave) => {
      const l = maskLeaveForViewer(leave, viewer);
      return {
        type: l.type,
        status: l.status,
        startDate: ymd(l.startDate),
        endDate: ymd(l.endDate),
        hours: l.hours,
        startTime: l.startTime,
        endTime: l.endTime,
      };
    }),
    presences: presences.map((p) => ({ date: ymd(p.date), slot: p.slot, mode: p.mode })),
  };
}

// Dettaglio di un evento: come sul web, lo vedono tutti gli utenti attivi.
export async function getEvent(viewer: Viewer, eventId: string) {
  const row = await prisma.calendarEvent.findUnique({ where: { id: eventId }, select: EVENT_SELECT });
  if (!row) throw new NotFoundError("Evento non trovato (forse è stato eliminato)");
  return toEventDto(row, viewer);
}

// Calendario del team: chi c'è e chi è assente (elemento #320: lo vedono tutti).
// Il motivo dell'assenza (ferie, permesso...) lo vedono solo gli admin, i
// responsabili (persone nell'ambito di "richieste" o "approvare") e
// l'interessato; per gli altri il tipo è "assenza". La malattia resta mascherata
// come sul web (maskLeaveForViewer). Nessun 403 al membro; mai note né id.
export async function listTeamCalendar(viewer: Viewer, range: { from: Date; to: Date }) {
  const { from, to } = range;
  const [leaves, presences, richieste, approvare] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        user: { active: true },
        status: { not: "rejected" },
        startDate: { lte: to },
        endDate: { gte: from },
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
      orderBy: { date: "asc" },
    }),
    peopleInScope(viewer, "richieste"),
    peopleInScope(viewer, "approvare"),
  ]);

  const seesReason = (userId: string) =>
    isAdminRole(viewer.role) ||
    userId === viewer.id ||
    richieste === "all" ||
    approvare === "all" ||
    richieste.includes(userId) ||
    approvare.includes(userId);

  return {
    absences: leaves.map(({ user, ...leave }) => {
      const l = maskLeaveForViewer(leave, viewer);
      return {
        userId: l.userId,
        userName: user.name,
        type: seesReason(l.userId) ? l.type : "assenza",
        status: l.status,
        startDate: ymd(l.startDate),
        endDate: ymd(l.endDate),
        hours: l.hours,
        startTime: l.startTime,
        endTime: l.endTime,
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
