import "server-only";
import { prisma } from "@/lib/prisma";
import { EVENT_TYPES, isAdminRole } from "@/lib/constants";
import { absenceConflict } from "@/lib/absence-conflicts";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/services/errors";
import { EVENT_SELECT, toEventDto } from "@/lib/services/calendar";
import { ForbiddenError } from "@/lib/task-archive";

// Creazione, modifica ed eliminazione degli eventi di calendario: regole e
// permessi in un posto solo, usati dalle server action del web e dalle route
// dell'app. Gli effetti di contorno (revalidatePath, email di invito) restano
// a chi chiama: il service dice solo chi è stato aggiunto (newParticipantIds).
// I messaggi d'errore sono quelli storici del web.

// `impersonating`: chi sta guardando l'app come un altro membro non scrive.
export type Writer = { id: string; role: string; impersonating?: boolean };

const READ_ONLY_MESSAGE =
  "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla";

// Limiti di lunghezza (validazione dell'API; il web non ne aveva).
const MAX_TITLE = 200;
const MAX_LOCATION = 200;
const MAX_DESCRIPTION = 5000;
const MAX_PARTICIPANTS = 200;

export type EventInput = {
  title?: unknown;
  type?: unknown;
  startAt?: unknown;
  endAt?: unknown;
  location?: unknown;
  description?: unknown;
  participantIds?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function parseEventInput(input: EventInput) {
  const title = text(input.title).trim();
  const type = text(input.type);
  const startAtRaw = text(input.startAt);
  const endAtRaw = text(input.endAt);
  const location = text(input.location).trim() || null;
  const description = text(input.description).trim() || null;
  const rawIds = Array.isArray(input.participantIds) ? input.participantIds : [];
  const participantIds = [...new Set(rawIds.map(String))];

  if (!title || !EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
    throw new ValidationError("Dati evento non validi");
  }
  if (
    title.length > MAX_TITLE ||
    (location?.length ?? 0) > MAX_LOCATION ||
    (description?.length ?? 0) > MAX_DESCRIPTION ||
    participantIds.length > MAX_PARTICIPANTS
  ) {
    throw new ValidationError("Dati evento non validi");
  }
  if (!startAtRaw || !endAtRaw) throw new ValidationError("Le date/ora sono obbligatorie");
  const startAt = new Date(startAtRaw);
  const endAt = new Date(endAtRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    throw new ValidationError("Le date/ora non sono valide");
  }
  if (endAt < startAt) throw new ValidationError("La fine non può precedere l'inizio");
  return { data: { title, type, startAt, endAt, location, description }, participantIds };
}

function assertWritable(writer: Writer) {
  if (writer.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
}

// Chi è assente (giornata intera, già approvata/registrata) nelle date
// dell'evento non può essere invitato. Il motivo finisce nel messaggio
// d'errore: niente "Malattia" dei colleghi (maskLeaveForViewer).
async function assertParticipants(participantIds: string[], startAt: Date, endAt: Date, viewer: Writer) {
  if (participantIds.length === 0) return;
  const [absences, participants] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        userId: { in: participantIds },
        status: { not: "rejected" },
        startDate: { lte: endAt },
        endDate: { gte: new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate()) },
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
    }),
    prisma.user.findMany({ where: { id: { in: participantIds } }, select: { id: true, name: true } }),
  ]);
  if (participants.length !== participantIds.length) throw new ValidationError("Partecipante non valido");
  for (const participant of participants) {
    const conflict = absenceConflict(
      absences.map((absence) => maskLeaveForViewer(absence, viewer)),
      participant.id,
      startAt,
      endAt
    );
    if (conflict?.kind === "blocked") {
      throw new ConflictError(
        `${participant.name} è assente in quelle date (${conflict.reason}). Rimuovi questa persona dai partecipanti`
      );
    }
  }
}

// Può modificare ed eliminare un evento: admin, chi l'ha creato, o un partecipante.
async function assertCanManage(eventId: string, writer: Writer) {
  const event = await prisma.calendarEvent.findUnique({ where: { id: eventId }, select: { createdById: true } });
  if (!event) throw new NotFoundError("Evento non trovato (forse è stato eliminato)");
  if (isAdminRole(writer.role) || event.createdById === writer.id) return;
  const isParticipant = await prisma.eventParticipant.findUnique({
    where: { eventId_userId: { eventId, userId: writer.id } },
  });
  if (!isParticipant) throw new ForbiddenError("Non autorizzato");
}

async function loadDto(eventId: string, writer: Writer) {
  const row = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: eventId }, select: EVENT_SELECT });
  return toEventDto(row, writer);
}

export async function createEvent(writer: Writer, input: EventInput) {
  assertWritable(writer);
  const { data, participantIds } = parseEventInput(input);
  await assertParticipants(participantIds, data.startAt, data.endAt, writer);
  const created = await prisma.calendarEvent.create({
    data: {
      ...data,
      createdById: writer.id,
      participants: { create: participantIds.map((userId) => ({ userId })) },
    },
    select: { id: true },
  });
  return { event: await loadDto(created.id, writer), newParticipantIds: participantIds };
}

// Modifica con tutti i campi, partecipanti compresi. newParticipantIds = chi è
// stato aggiunto adesso (gli unici a ricevere l'invito).
export async function updateEvent(writer: Writer, eventId: string, input: EventInput) {
  assertWritable(writer);
  await assertCanManage(eventId, writer);
  const { data, participantIds } = parseEventInput(input);
  await assertParticipants(participantIds, data.startAt, data.endAt, writer);
  const previous = await prisma.eventParticipant.findMany({ where: { eventId }, select: { userId: true } });
  await prisma.calendarEvent.update({
    where: { id: eventId },
    data: {
      ...data,
      participants: { deleteMany: {}, create: participantIds.map((userId) => ({ userId })) },
    },
  });
  const previousIds = new Set(previous.map((p) => p.userId));
  return {
    event: await loadDto(eventId, writer),
    newParticipantIds: participantIds.filter((id) => !previousIds.has(id)),
  };
}

export async function deleteEvent(writer: Writer, eventId: string) {
  assertWritable(writer);
  await assertCanManage(eventId, writer);
  await prisma.calendarEvent.delete({ where: { id: eventId } });
}
