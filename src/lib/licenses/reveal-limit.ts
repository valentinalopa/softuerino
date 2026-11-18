import { RateLimitError } from "@/lib/services/errors";

// Limite giornaliero di rivelazioni di chiavi/password/account (decisione di Giacomo, 13/11).
// Per utente e per giorno di calendario in ora italiana (Europe/Rome). Contano tutte le righe
// LicenseKeyAccess dell'utente (show e copy, qualsiasi licenza), sia dal web sia dall'app.
// Il super admin (ruolo effettivo: fuori dalla rete fidata è già un admin) è escluso.
export const DAILY_REVEAL_LIMIT = 10;
export const DAILY_REVEAL_MESSAGE = `Limite giornaliero di ${DAILY_REVEAL_LIMIT} rivelazioni raggiunto`;

const ROME = "Europe/Rome";

// Scarto di Europe/Rome rispetto a UTC, in minuti, nell'istante dato.
function romeOffsetMinutes(at: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: ROME,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60000);
}

// Mezzanotte di Roma del giorno che contiene `now`, come istante UTC (corretta anche nei giorni di cambio d'ora).
export function romeDayStart(now: Date = new Date()): Date {
  const offset = romeOffsetMinutes(now);
  const local = new Date(now.getTime() + offset * 60000); // "orologio di Roma" letto come UTC
  const midnightLocalAsUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  // Lo scarto va preso a mezzanotte (prima del cambio d'ora delle 02:00 locali), non a `now`.
  const offsetAtMidnight = romeOffsetMinutes(new Date(midnightLocalAsUtc - offset * 60000 - 3 * 3600000));
  return new Date(midnightLocalAsUtc - offsetAtMidnight * 60000);
}

// Quanto serve del client di transazione (o di prisma): solo il conteggio del registro.
export type RevealCounter = {
  licenseKeyAccess: { count(args: { where: { userId: string; createdAt: { gte: Date } } }): Promise<number> };
};

type Actor = { id: string; role: string };

function exempt(actor: Actor) {
  return actor.role === "super_admin";
}

function usedToday(db: RevealCounter, actor: Actor, now: Date) {
  return db.licenseKeyAccess.count({ where: { userId: actor.id, createdAt: { gte: romeDayStart(now) } } });
}

// Da chiamare DENTRO la transazione, prima di creare attivazione e riga di registro.
export async function assertRevealQuota(db: RevealCounter, actor: Actor, now: Date = new Date()): Promise<void> {
  if (exempt(actor)) return;
  if ((await usedToday(db, actor, now)) >= DAILY_REVEAL_LIMIT) throw new RateLimitError(DAILY_REVEAL_MESSAGE);
}

// Da chiamare DENTRO la stessa transazione, dopo aver scritto la riga di registro: se due richieste
// concorrenti hanno letto lo stesso conteggio, quella in eccesso annulla la transazione
// (nessuna riga, nessuna attivazione), come per activationLimit.
export async function confirmRevealQuota(db: RevealCounter, actor: Actor, now: Date = new Date()): Promise<void> {
  if (exempt(actor)) return;
  if ((await usedToday(db, actor, now)) > DAILY_REVEAL_LIMIT) throw new RateLimitError(DAILY_REVEAL_MESSAGE);
}
