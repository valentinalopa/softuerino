import "server-only";
import { prisma } from "@/lib/prisma";
import { PRESENCE_MODES, PRESENCE_SLOTS, type PresenceMode, type PresenceSlot } from "@/lib/constants";
import { ValidationError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/task-archive";

// Presenze (ufficio / smartworking, per giorno e fascia): regole in un posto solo,
// usate dalle server action del web e dalle route dell'app. Nessuna approvazione
// (self-log). Gli effetti di contorno (revalidatePath) restano a chi chiama.
// I messaggi d'errore sono quelli storici del web.

// `impersonating`: chi sta guardando l'app come un altro membro non scrive.
export type PresenceWriter = { id: string; role?: string; impersonating?: boolean };

export type Presence = { date: string; slot: PresenceSlot; mode: PresenceMode };

const READ_ONLY_MESSAGE =
  "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla";

// Tetto dell'API mobile (il web seleziona sul calendario, senza tetto).
const MAX_DATES = 62;

// Mezzanotte locale da "yyyy-MM-dd" (come il web: new Date(str) la leggerebbe in UTC).
function localDate(day: string) {
  return new Date(`${day}T00:00:00`);
}

function ymd(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function parseDay(value: unknown): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ValidationError("Data non valida");
  }
  const d = localDate(value);
  if (Number.isNaN(d.getTime()) || ymd(d) !== value) throw new ValidationError("Data non valida");
  return value;
}

function parseDays(value: unknown, max?: number): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError("Seleziona almeno un giorno");
  }
  const days = [...new Set(value.map(parseDay))];
  if (max !== undefined && days.length > max) {
    throw new ValidationError(`Al massimo ${max} giorni per volta`);
  }
  return days;
}

function parseSlot(value: unknown): PresenceSlot {
  if (!PRESENCE_SLOTS.includes(value as PresenceSlot)) throw new ValidationError("Fascia oraria non valida");
  return value as PresenceSlot;
}

function parseMode(value: unknown): PresenceMode {
  if (!PRESENCE_MODES.includes(value as PresenceMode)) throw new ValidationError("Modalità non valida");
  return value as PresenceMode;
}

// Slot incompatibili sullo stesso giorno: "giornata intera" non può convivere
// con mattina/pomeriggio (e viceversa). Impostare uno slot rimuove i conflitti.
function conflictingSlots(slot: string) {
  return slot === "giornata_intera" ? ["mattina", "pomeriggio"] : ["giornata_intera"];
}

function assertCanWrite(writer: PresenceWriter) {
  if (writer.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
}

// Imposta fascia e modalità su uno o più giorni di `userId`. `replace`: presenze
// esistenti da rimuovere nella stessa transazione (modifica di un box esistente con
// cambio di fascia). Chi chiama decide per conto di chi si scrive (il web: l'admin
// può farlo per altri; l'app: mai).
export async function savePresenceFor(
  userId: string,
  input: { dates: unknown; slot: unknown; mode: unknown; replace?: { date: string; slot: string }[] },
  maxDates?: number
): Promise<Presence[]> {
  const dates = parseDays(input.dates, maxDates);
  const slot = parseSlot(input.slot);
  const mode = parseMode(input.mode);
  const replace = (input.replace ?? []).map((item) => ({ date: parseDay(item.date), slot: String(item.slot) }));

  await prisma.$transaction([
    ...replace.map((item) =>
      prisma.presenceEntry.deleteMany({
        where: { userId, date: localDate(item.date), slot: item.slot },
      })
    ),
    ...dates.map((date) =>
      prisma.presenceEntry.deleteMany({
        where: { userId, date: localDate(date), slot: { in: conflictingSlots(slot) } },
      })
    ),
    ...dates.map((date) =>
      prisma.presenceEntry.upsert({
        where: { userId_date_slot: { userId, date: localDate(date), slot } },
        update: { mode },
        create: { userId, date: localDate(date), slot, mode },
      })
    ),
  ]);

  const saved = await prisma.presenceEntry.findMany({
    where: { userId, date: { in: dates.map(localDate) } },
    orderBy: [{ date: "asc" }, { slot: "asc" }],
  });
  return saved.map((p) => ({ date: ymd(p.date), slot: p.slot as PresenceSlot, mode: p.mode as PresenceMode }));
}

// Toglie le presenze indicate (data + fascia) di `userId`.
export async function removePresenceFor(userId: string, items: { date: string; slot: string }[]) {
  if (items.length === 0) throw new ValidationError("Seleziona almeno un giorno");
  await prisma.$transaction(
    items.map((item) =>
      prisma.presenceEntry.deleteMany({
        where: { userId, date: localDate(item.date), slot: item.slot },
      })
    )
  );
}

// App: solo per sé stessi (nessun userId per conto di altri).
export async function setPresence(
  writer: PresenceWriter,
  input: { dates?: unknown; slot?: unknown; mode?: unknown }
): Promise<Presence[]> {
  assertCanWrite(writer);
  return savePresenceFor(writer.id, { dates: input.dates, slot: input.slot, mode: input.mode }, MAX_DATES);
}

// App: senza `slot` toglie tutte le fasce dei giorni indicati. Giorni senza
// presenze non sono un errore.
export async function deletePresence(
  writer: PresenceWriter,
  input: { dates?: unknown; slot?: unknown }
): Promise<void> {
  assertCanWrite(writer);
  const dates = parseDays(input.dates, MAX_DATES);
  const slot = input.slot === undefined || input.slot === null ? undefined : parseSlot(input.slot);
  await prisma.presenceEntry.deleteMany({
    where: { userId: writer.id, date: { in: dates.map(localDate) }, ...(slot ? { slot } : {}) },
  });
}
