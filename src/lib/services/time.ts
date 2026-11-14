import "server-only";
import { prisma } from "@/lib/prisma";
import { clientLabel, loggableClientsWhere, sortClientsByParent } from "@/lib/clients";
import { buildMonthlySummary } from "@/lib/ore-utils";
import { isAdminRole } from "@/lib/constants";
import { isWorkingDay } from "@/lib/leave-days";
import { ConflictError, ValidationError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/task-archive";

// Ore su cliente/progetto: regole in un posto solo, usate dalla server action del
// web (saveDailyTimeEntries) e dalle route dell'app. Gli effetti di contorno
// (revalidatePath) restano a chi chiama. I messaggi d'errore sono quelli storici del web.

export type TimeActor = { id: string; role: string; impersonating?: boolean };
export type DayEntryInput = { clientId: string; hours: number; note?: string | null };

const READ_ONLY_MESSAGE =
  "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla";
const MAX_NOTE = 500;

function localDate(day: string) {
  return new Date(`${day}T00:00:00`);
}
function ymd(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}
function round2(value: number) {
  return Math.round(value * 100) / 100;
}
function parseRealDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("Data non valida");
  if (ymd(localDate(value)) !== value) throw new ValidationError("Data non valida");
  return value;
}

// Sostituisce interamente le ore di `targetUserId` nel giorno `dateRaw` con
// `entries` (già filtrate: solo ore > 0; nessuna = giornata svuotata). Regole del web:
// per conto di altri solo un admin; giornata già registrata modificabile solo da
// un admin (409); solo clienti su cui la persona può loggare, più quelli che hanno
// già ore quel giorno (403).
export async function replaceDayFor(actor: TimeActor, targetUserId: string, dateRaw: string, entries: DayEntryInput[]) {
  if (actor.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
  if (targetUserId !== actor.id && !isAdminRole(actor.role)) throw new ForbiddenError("Non autorizzato");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) throw new ValidationError("Data non valida");

  const day = localDate(dateRaw);
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);

  // Una giornata già registrata la corregge solo un admin (dalla scheda
  // membro): il form la nasconde, ma il vincolo va garantito anche qui.
  if (!isAdminRole(actor.role)) {
    const alreadyLogged = await prisma.timeEntry.count({
      where: { userId: targetUserId, date: { gte: day, lt: nextDay } },
    });
    if (alreadyLogged > 0) throw new ConflictError("Questa giornata è già registrata");
  }

  const requestedIds = [...new Set(entries.map((e) => e.clientId))];
  if (requestedIds.length > 0) {
    const allowed = await prisma.client.findMany({
      where: {
        id: { in: requestedIds },
        OR: [
          loggableClientsWhere(targetUserId),
          { timeEntries: { some: { userId: targetUserId, date: { gte: day, lt: nextDay } } } },
        ],
      },
      select: { id: true },
    });
    if (allowed.length !== requestedIds.length) {
      throw new ForbiddenError("Non puoi loggare ore su uno dei clienti indicati");
    }
  }

  await prisma.$transaction([
    prisma.timeEntry.deleteMany({ where: { userId: targetUserId, date: { gte: day, lt: nextDay } } }),
    // Ore registrate: il giorno non è più "non lavorato" (PR #50).
    ...(entries.length > 0
      ? [prisma.dayNotWorked.deleteMany({ where: { userId: targetUserId, date: { gte: day, lt: nextDay } } })]
      : []),
    ...entries.map((e) =>
      prisma.timeEntry.create({
        data: { userId: targetUserId, clientId: e.clientId, date: day, hours: e.hours, description: e.note ?? "" },
      })
    ),
  ]);
}

// Le ore di un giorno della persona stessa. `editable`: un membro non modifica
// una giornata già registrata (lo fa un admin).
// "Oggi non ho lavorato" (PR #50): segna (o toglie) una giornata da non
// registrare, senza promemoria né avvisi di ore mancanti. Non vale per una
// giornata che ha già ore né per weekend e festivi. Per conto di altri solo un admin.
export async function setDayNotWorkedFor(actor: TimeActor, targetUserId: string, dateRaw: string, notWorked: boolean) {
  if (actor.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
  if (targetUserId !== actor.id && !isAdminRole(actor.role)) throw new ForbiddenError("Non autorizzato");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) throw new ValidationError("Data non valida");
  const day = localDate(dateRaw);
  const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);

  if (notWorked) {
    if (!isWorkingDay(day)) throw new ValidationError("È già un giorno non lavorativo (weekend o festivo)");
    const logged = await prisma.timeEntry.count({
      where: { userId: targetUserId, date: { gte: day, lt: nextDay } },
    });
    if (logged > 0) throw new ConflictError("In questa giornata ci sono già ore registrate");
    await prisma.dayNotWorked.upsert({
      where: { userId_date: { userId: targetUserId, date: day } },
      create: { userId: targetUserId, date: day },
      update: {},
    });
  } else {
    await prisma.dayNotWorked.deleteMany({ where: { userId: targetUserId, date: { gte: day, lt: nextDay } } });
  }
}

// L'app: solo per sé stessi. Restituisce il giorno aggiornato.
export async function setOwnDayNotWorked(actor: TimeActor, date: unknown, notWorked: boolean) {
  const day = parseRealDay(date);
  await setDayNotWorkedFor(actor, actor.id, day, notWorked);
  return getDay(actor, day);
}

export async function getDay(actor: TimeActor, date: unknown) {
  const day = parseRealDay(date);
  const start = localDate(day);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const rows = await prisma.timeEntry.findMany({
    where: { userId: actor.id, date: { gte: start, lt: end } },
    include: { client: { select: { id: true, name: true, parent: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const notWorked = (await prisma.dayNotWorked.count({ where: { userId: actor.id, date: { gte: start, lt: end } } })) > 0;
  return {
    notWorked,
    workingDay: isWorkingDay(start),
    date: day,
    entries: rows.map((r) => ({
      clientId: r.clientId,
      clientLabel: clientLabel(r.client),
      hours: r.hours,
      note: r.description || null,
    })),
    totalHours: round2(rows.reduce((sum, r) => sum + r.hours, 0)),
    editable: rows.length === 0 || isAdminRole(actor.role),
  };
}

// Salva le ore di un giorno della persona stessa (l'app: mai per altri).
// Validazione più stretta del form web: ore numeriche tra 0 e 24, al massimo 24 nel
// giorno, un cliente una volta sola; le righe a 0 sono ignorate (come sul web).
export async function saveDay(actor: TimeActor, date: unknown, entries: unknown) {
  const day = parseRealDay(date);
  if (!Array.isArray(entries)) throw new ValidationError("Indica le ore come elenco (entries)");
  const parsed: DayEntryInput[] = entries.map((raw) => {
    if (typeof raw !== "object" || raw === null) throw new ValidationError("Riga di ore non valida");
    const { clientId, hours, note } = raw as Record<string, unknown>;
    if (typeof clientId !== "string" || !clientId.trim()) throw new ValidationError("Cliente mancante");
    if (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0 || hours > 24) {
      throw new ValidationError("Ore non valide: indica un numero tra 0 e 24");
    }
    if (note !== undefined && note !== null && typeof note !== "string") throw new ValidationError("Nota non valida");
    const text = typeof note === "string" ? note.trim() : "";
    if (text.length > MAX_NOTE) throw new ValidationError(`La nota può avere al massimo ${MAX_NOTE} caratteri`);
    return { clientId: clientId.trim(), hours, note: text || null };
  });
  if (new Set(parsed.map((e) => e.clientId)).size !== parsed.length) {
    throw new ValidationError("Ogni cliente può comparire una volta sola");
  }
  if (parsed.reduce((sum, e) => sum + e.hours, 0) > 24) {
    throw new ValidationError("Non si possono registrare più di 24 ore in un giorno");
  }
  await replaceDayFor(actor, actor.id, day, parsed.filter((e) => e.hours > 0));
  return getDay(actor, day);
}

// Totale del mese e ore per giorno della persona stessa (month: "YYYY-MM").
export async function getMonth(actor: TimeActor, month: unknown) {
  if (typeof month !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    throw new ValidationError("Mese non valido: usa il formato AAAA-MM");
  }
  const [y, m] = month.split("-").map(Number);
  const start = new Date(y, m - 1, 1);
  const end = new Date(y, m, 1);
  const rows = await prisma.timeEntry.findMany({
    where: { userId: actor.id, date: { gte: start, lt: end } },
    select: { date: true, hours: true },
  });
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(ymd(r.date), (byDay.get(ymd(r.date)) ?? 0) + r.hours);
  const summary = buildMonthlySummary(rows)[0];
  return {
    month,
    totalHours: round2(summary?.hours ?? 0),
    days: [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, hours]) => ({ date, hours: round2(hours) })),
  };
}

// Clienti su cui la persona può loggare (le voci riservate solo a chi è indicato).
export async function listLoggableClients(actor: TimeActor) {
  const clients = await prisma.client.findMany({
    where: loggableClientsWhere(actor.id),
    select: { id: true, name: true, parent: { select: { name: true } } },
  });
  return sortClientsByParent(clients).map((c) => ({ id: c.id, name: c.name, label: clientLabel(c) }));
}
