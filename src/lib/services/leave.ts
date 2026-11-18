import "server-only";
import { prisma } from "@/lib/prisma";
import { formatAmount, hoursBetween, leaveVersion } from "@/lib/leave-format";
import { getLeaveBalance, balanceFigures, type HourBalance } from "@/lib/leave-balance";
import {
  availableAt,
  chargeAmount,
  chargeFor,
  chargeKind,
  type ChargeInfo,
  type LeaveCharges,
} from "@/lib/leave-accrual";
import { getRecoveryCreditsForUsers, toOpenRecoveryCredits } from "@/lib/recovery-credits";
import { countedLeaveDays, isWorkingDay, slotsClash } from "@/lib/leave-days";
import {
  LEAVE_SNAPSHOT_SELECT,
  notifyLeaveWithdrawn,
  notifyNewLeaveRequest,
} from "@/lib/email/notifications";
import {
  isAdminRole,
  leaveTypesFor,
  NOTE_REQUIRED_LEAVE_TYPES,
  OPTIONAL_HOURLY_LEAVE_TYPES,
  type EmploymentType,
  type LeaveType,
} from "@/lib/constants";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/services/errors";
import { ForbiddenError } from "@/lib/task-archive";

// Richieste di assenza (ferie, permesso ROL, recupero, permesso 104, malattia,
// assenza...), saldi e recuperi da fare: regole in un posto solo, usate dalle
// server action del web e dalle route dell'app. Le regole sono quelle della
// PR #50 (saldi in ore dalla busta paga): parseLeaveInput e findLeaveConflict
// sono le sue parseLeaveForm e findLeaveConflict, spostate qui. Gli effetti di
// contorno (revalidatePath, mail) restano a chi chiama: le funzioni che
// scrivono restituiscono `notify`, da passare ad after(). I messaggi d'errore
// sono quelli del web.

export type LeaveActor = {
  id: string;
  role: string;
  employmentType: string;
  impersonating?: boolean;
};

export type LeaveRequestInput = {
  type: unknown;
  startDate: unknown;
  endDate?: unknown;
  startTime?: unknown;
  endTime?: unknown;
  note?: unknown;
  recoveryCreditId?: unknown;
  // "ore" | "giorni": per i tipi a ore facoltativi (recupero senza recupero da
  // fare collegato, assenza, permesso 104).
  unit?: unknown;
  // Solo in modifica: `version` della richiesta come l'ha vista chi la modifica.
  version?: unknown;
  // Solo web, solo admin: registra per conto di un altro membro. L'app non lo passa mai.
  userId?: unknown;
};

export type LeaveRequestView = {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  hours: number | null;
  startTime: string | null;
  endTime: string | null;
  status: string;
  note: string | null;
  createdAt: string;
  // Versione della richiesta: da rimandare nel PATCH/DELETE per accorgersi di modifiche in contemporanea.
  version: string;
  recoveryCredit: { id: string; reason: string; amount: number; unit: string } | null;
};

type Deps = {
  notifyNewLeaveRequest: (requestId: string, userId: string, change?: "modificata") => Promise<unknown>;
  notifyLeaveWithdrawn: typeof notifyLeaveWithdrawn;
};
const realDeps: Deps = { notifyNewLeaveRequest, notifyLeaveWithdrawn };

const READ_ONLY_MESSAGE =
  "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla";
const ALREADY_DECIDED = "La richiesta è già stata decisa: per cambiarla chiedi a un admin";
export const REQUEST_CHANGED = "La richiesta è cambiata, ricarica";

// Campi che una modifica può cambiare: la richiesta in attesa non ha un
// updatedAt, la sua "versione" (leaveVersion) è fatta da questi.
const VERSION_SELECT = {
  type: true,
  startDate: true,
  endDate: true,
  hours: true,
  startTime: true,
  endTime: true,
  note: true,
  recoveryCreditId: true,
} as const;

// Condizione dell'aggiornamento: la richiesta è ancora in attesa e coi campi letti.
export function versionWhere(row: {
  type: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  recoveryCreditId: string | null;
}) {
  return { status: "pending", ...Object.fromEntries(Object.keys(VERSION_SELECT).map((k) => [k, row[k as keyof typeof row]])) };
}

// Versione vista da chi agisce (testo di leaveVersion) o niente: senza, resta il
// solo controllo tra lettura e scrittura.
export function seenVersion(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

// Esito di un aggiornamento condizionato andato a vuoto: se la richiesta è
// ancora in attesa è stata modificata da un altro, altrimenti è stata decisa.
export async function staleRequestError(requestId: string, decidedMessage: string) {
  const now = await prisma.leaveRequest.findUnique({ where: { id: requestId }, select: { status: true } });
  return new ConflictError(now && now.status === "pending" ? REQUEST_CHANGED : decidedMessage);
}
export { VERSION_SELECT };

function str(value: unknown) {
  return typeof value === "string" ? value : "";
}

// Mezzanotte locale da "yyyy-MM-dd" (new Date(str) la leggerebbe in UTC).
function localDate(day: string) {
  return new Date(`${day}T00:00:00`);
}

function ymd(date: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function isRealDay(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = localDate(value);
  return !Number.isNaN(d.getTime()) && ymd(d) === value;
}

const REQUEST_INCLUDE = { recoveryCredit: { select: { id: true, reason: true, amount: true, unit: true } } } as const;

type RequestRow = Awaited<ReturnType<typeof findOwnRows>>[number];

function toView(row: RequestRow): LeaveRequestView {
  return {
    id: row.id,
    type: row.type,
    startDate: ymd(row.startDate),
    endDate: ymd(row.endDate),
    hours: row.hours,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
    version: leaveVersion(row),
    recoveryCredit: row.recoveryCredit,
  };
}

function findOwnRows(userId: string, where: object = {}) {
  return prisma.leaveRequest.findMany({
    where: { userId, ...where },
    include: REQUEST_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export type ParsedLeave = {
  type: LeaveType;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  startTime: string | null;
  endTime: string | null;
  note: string | null;
  recoveryCreditId: string | null;
};

// Legge e controlla i campi di una richiesta (nuova o modificata) per la
// persona `target`. `excludeRequestId`: la richiesta che si sta modificando,
// da non contare né nelle sovrapposizioni né nei recuperi. Lancia
// ValidationError (400), NotFoundError (recupero da fare non trovato) e
// ConflictError (409: si sovrappone a un'altra richiesta non rifiutata).
export async function parseLeaveInput(
  input: LeaveRequestInput,
  target: { id: string; employmentType: string },
  excludeRequestId: string | null
): Promise<ParsedLeave> {
  const type = str(input.type);
  const startDateRaw = str(input.startDate);
  const endDateRaw = str(input.endDate) || startDateRaw;
  const startTimeRaw = str(input.startTime).trim();
  const endTimeRaw = str(input.endTime).trim();
  const note = str(input.note).trim() || null;

  // Dipendenti: ferie/permesso/recupero/permesso 104/malattia. Partite IVA:
  // assenza (monte unico), recupero e assenza extra (fuori monte).
  if (!leaveTypesFor(target.employmentType).includes(type as LeaveType)) {
    throw new ValidationError("Tipo di richiesta non valido");
  }
  if (!startDateRaw) throw new ValidationError("La data è obbligatoria");

  // Un recupero può smaltire un recupero da fare registrato dal super admin:
  // in quel caso il motivo è già lì e la nota diventa facoltativa.
  const recoveryCreditIdRaw = type === "recupero" ? str(input.recoveryCreditId).trim() : "";
  const recoveryCredit = recoveryCreditIdRaw
    ? await prisma.recoveryCredit.findFirst({
        where: { id: recoveryCreditIdRaw, userId: target.id },
        select: { id: true, unit: true },
      })
    : null;
  if (recoveryCreditIdRaw && !recoveryCredit) throw new NotFoundError("Recupero da fare non trovato");
  if (NOTE_REQUIRED_LEAVE_TYPES.includes(type as LeaveType) && !note && !recoveryCredit) {
    throw new ValidationError("Per il recupero la nota è obbligatoria: indica il motivo (es. la trasferta)");
  }

  // A ore = un solo giorno con una fascia oraria: il permesso sempre,
  // recupero, assenza e permesso 104 quando si sceglie "A ore" (o quando il
  // recupero da fare è in ore).
  const isHourly =
    type === "permesso" ||
    (OPTIONAL_HOURLY_LEAVE_TYPES.includes(type as LeaveType) &&
      (recoveryCredit ? recoveryCredit.unit === "ore" : str(input.unit) === "ore"));
  const effectiveEndDateRaw = isHourly ? startDateRaw : endDateRaw;
  // La fine conta solo per le richieste a giorni (a ore è ignorata, come sul web).
  if (effectiveEndDateRaw < startDateRaw) {
    throw new ValidationError("La data di fine non può precedere quella di inizio");
  }

  // A ore si indica la fascia (dalle/alle): le ore ne sono la durata. Dal
  // saldo un permesso scala al massimo le ore di una giornata (leave-balance.ts).
  let hours: number | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (isHourly) {
    if (!startTimeRaw || !endTimeRaw) throw new ValidationError("Indica la fascia oraria (dalle / alle)");
    hours = hoursBetween(startTimeRaw, endTimeRaw);
    if (hours === null) {
      throw new ValidationError("Fascia oraria non valida: l'orario di fine deve seguire quello di inizio");
    }
    startTime = startTimeRaw;
    endTime = endTimeRaw;
  }

  const startDate = localDate(startDateRaw);
  const endDate = localDate(effectiveEndDateRaw);
  // Come il web non si controlla che il giorno esista nel calendario; resta solo
  // la rete di sicurezza per un testo che non è una data (altrimenti Prisma darebbe 500).
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    throw new ValidationError("Data non valida");
  }
  // Festivi e weekend non si chiedono: non pesano su ferie, permessi o assenze.
  if (isHourly ? !isWorkingDay(startDate) : countedLeaveDays(startDate, endDate) === 0) {
    throw new ValidationError(
      isHourly
        ? "È un giorno festivo o nel weekend: non serve chiedere il permesso"
        : "Nel periodo non ci sono giorni lavorativi (solo weekend o festivi)"
    );
  }

  const conflict = await findLeaveConflict(target.id, { startDate, endDate, startTime, endTime }, excludeRequestId);
  if (conflict) throw new ConflictError(conflict);

  // Il recupero non può superare quanto resta del recupero da fare (le
  // richieste già approvate o in attesa collegate lo hanno già in parte coperto).
  if (recoveryCredit) {
    const open = (await getRecoveryCreditsForUsers([target.id], excludeRequestId))
      .get(target.id)
      ?.find((c) => c.id === recoveryCredit.id);
    const left = open ? Math.max(open.amount - open.used - open.pending, 0) : 0;
    const requested = recoveryCredit.unit === "ore" ? (hours ?? 0) : countedLeaveDays(startDate, endDate);
    if (requested > left + 1e-9) {
      const unit = recoveryCredit.unit === "ore" ? "ore" : "giorni";
      throw new ValidationError(
        left > 0
          ? `Di questo recupero restano ${formatAmount(left)} ${unit}: riduci la richiesta`
          : "Questo recupero è già coperto da altre richieste"
      );
    }
  }

  return {
    type: type as LeaveType,
    startDate,
    endDate,
    hours,
    startTime,
    endTime,
    note,
    recoveryCreditId: recoveryCredit?.id ?? null,
  };
}

// Una richiesta si sovrappone a un'altra (non rifiutata) della stessa persona
// se tocca uno stesso giorno, salvo quando sono entrambe a ore con fasce che
// non si toccano (es. permesso 9–11 e permesso 15–17 dello stesso giorno).
export async function findLeaveConflict(
  userId: string,
  request: { startDate: Date; endDate: Date; startTime: string | null; endTime: string | null },
  excludeRequestId: string | null
): Promise<string | null> {
  const overlapping = await prisma.leaveRequest.findMany({
    where: {
      userId,
      status: { not: "rejected" },
      startDate: { lte: request.endDate },
      endDate: { gte: request.startDate },
      ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
    },
    select: { startTime: true, endTime: true },
  });
  const clash = overlapping.find((other) => slotsClash(request, other));
  if (!clash) return null;
  return clash.startTime && clash.endTime && request.startTime
    ? `C'è già una richiesta a ore in questo giorno (${clash.startTime}–${clash.endTime}) che si sovrappone alla fascia`
    : "C'è già una richiesta che copre (in parte) queste date";
}

// Crea una richiesta. Lancia ValidationError (400), ConflictError (409),
// NotFoundError, ForbiddenError. `notify` manda la mail ai responsabili: va
// chiamata UNA volta, dopo il successo (le richieste per conto di altri non
// avvisano nessuno).
export async function createLeaveRequest(
  actor: LeaveActor,
  input: LeaveRequestInput,
  deps: Deps = realDeps
): Promise<{ request: LeaveRequestView; userId: string; notify: () => Promise<void> }> {
  if (actor.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);

  // Un admin può registrare ferie/permesso/malattia per conto di un altro
  // membro (es. malattia comunicata a voce): in quel caso la richiesta nasce già
  // approvata/registrata, senza passare dal flusso di approvazione.
  const targetUserId = str(input.userId).trim() || actor.id;
  const onBehalfOfOther = targetUserId !== actor.id;
  if (onBehalfOfOther && !isAdminRole(actor.role)) throw new ForbiddenError("Non autorizzato");

  const targetUser = onBehalfOfOther
    ? await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, employmentType: true } })
    : actor;
  if (!targetUser) throw new NotFoundError("Membro non trovato");

  let parsed: ParsedLeave;
  try {
    parsed = await parseLeaveInput(input, targetUser, null);
  } catch (err) {
    if (onBehalfOfOther && err instanceof ConflictError) {
      throw new ConflictError(err.message.replace("C'è già una richiesta", "Questo membro ha già una richiesta"));
    }
    throw err;
  }

  // La malattia si registra e basta, non richiede approvazione. Le richieste
  // inserite dall'admin per conto di altri nascono già approvate.
  const status = parsed.type === "malattia" ? "registrata" : onBehalfOfOther ? "approved" : "pending";

  const created = await prisma.leaveRequest.create({
    data: { userId: targetUserId, status, ...parsed },
    include: REQUEST_INCLUDE,
  });

  // Avviso ai responsabili ferie (e ai responsabili del reparto che possono
  // approvare): solo per le richieste fatte dalla persona stessa.
  const notify = async () => {
    if (!onBehalfOfOther) await deps.notifyNewLeaveRequest(created.id, actor.id);
  };
  return { request: toView(created), userId: targetUserId, notify };
}

// Chi ha fatto una richiesta può cambiarla finché è in attesa: torna in attesa
// con i nuovi dati e chi deve approvarla viene avvisato.
export async function updateOwnLeaveRequest(
  actor: LeaveActor,
  requestId: string,
  input: LeaveRequestInput,
  deps: Deps = realDeps
): Promise<{ notify: () => Promise<void> }> {
  if (actor.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, status: true, ...VERSION_SELECT },
  });
  if (!request || request.userId !== actor.id) throw new NotFoundError("Richiesta non trovata");
  if (request.status !== "pending") throw new ConflictError(ALREADY_DECIDED);
  // Chi modifica ha davanti una versione: se non è più quella, passa solo la prima modifica.
  const seen = seenVersion(input.version);
  if (seen && seen !== leaveVersion(request)) throw new ConflictError(REQUEST_CHANGED);

  const parsed = await parseLeaveInput(input, actor, requestId);
  if (parsed.type === "malattia") {
    throw new ValidationError("La malattia non passa dall'approvazione: registrala come nuova richiesta");
  }

  // Solo se è ancora in attesa e identica a quella letta (nel frattempo qualcuno
  // potrebbe averla decisa, modificata o ritirata): la seconda modifica non passa.
  const updated = await prisma.leaveRequest.updateMany({
    where: { id: requestId, userId: actor.id, ...versionWhere(request) },
    data: parsed,
  });
  if (updated.count === 0) throw await staleRequestError(requestId, ALREADY_DECIDED);
  return {
    notify: async () => {
      await deps.notifyNewLeaveRequest(requestId, actor.id, "modificata");
    },
  };
}

// Chi ha fatto una richiesta può ritirarla finché è in attesa: sparisce, e
// chi doveva approvarla viene avvisato. Una malattia registrata per errore la
// toglie un admin (riporta in attesa e rifiuta) o il super admin.
export async function withdrawOwnLeaveRequest(
  actor: LeaveActor,
  requestId: string,
  deps: Deps = realDeps,
  seenVersionRaw?: unknown
): Promise<{ notify: () => Promise<void> }> {
  if (actor.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { ...LEAVE_SNAPSHOT_SELECT, recoveryCreditId: true },
  });
  if (!request || request.userId !== actor.id) throw new NotFoundError("Richiesta non trovata");
  const seen = seenVersion(seenVersionRaw);
  if (request.status === "pending" && seen && seen !== leaveVersion(request)) {
    throw new ConflictError(REQUEST_CHANGED);
  }
  const deleted = await prisma.leaveRequest.deleteMany({
    where: { id: requestId, userId: actor.id, ...versionWhere(request) },
  });
  if (deleted.count === 0) {
    throw await staleRequestError(requestId, "La richiesta è già stata decisa: per annullarla chiedi a un admin");
  }
  return {
    notify: async () => {
      await deps.notifyLeaveWithdrawn(request, actor.id);
    },
  };
}

// Le richieste della persona stessa; `year`: quelle che toccano quell'anno.
export async function listOwnLeaveRequests(actor: LeaveActor, opts: { year?: number } = {}) {
  const { year } = opts;
  if (year !== undefined && (!Number.isInteger(year) || year < 2000 || year > 2100)) {
    throw new ValidationError("Anno non valido");
  }
  const where =
    year === undefined
      ? {}
      : { startDate: { lte: new Date(`${year}-12-31T00:00:00`) }, endDate: { gte: new Date(`${year}-01-01T00:00:00`) } };
  return (await findOwnRows(actor.id, where)).map(toView);
}

// Una richiesta propria; di altri → 404 (non si rivela che esiste).
export async function getOwnLeaveRequest(actor: LeaveActor, id: string) {
  const row = await prisma.leaveRequest.findFirst({
    where: { id, userId: actor.id },
    include: REQUEST_INCLUDE,
  });
  if (!row) throw new NotFoundError("Richiesta non trovata");
  return toView(row);
}

function chargeView(info: ChargeInfo) {
  return { ...info, from: info.from ? ymd(info.from) : null };
}

function hourView(balance: HourBalance | null) {
  return balance ? { ...balance } : null;
}

// Saldi di oggi: gli stessi numeri della pagina /richieste dopo la PR #50.
// - dipendente: ferie e permessi ROL in ore dalla busta paga (null finché il
//   super admin non la inserisce), ore di una giornata, mese della busta;
// - assenze (partita IVA): monte in giorni dell'anno.
// `figures` sono i numeri delle barrette; `charges` sono quelli che il form web
// usa per il saldo dopo una richiesta (l'app usa l'anteprima del server).
export async function getOwnBalance(actor: LeaveActor) {
  // Anno corrente come la pagina /richieste (fuso del server: Europe/Rome).
  const year = new Date().getFullYear();
  const balance = await getLeaveBalance(actor.id, actor.employmentType as EmploymentType, year);
  const charges: Partial<Record<keyof LeaveCharges, ReturnType<typeof chargeView>>> = {};
  for (const [kind, info] of Object.entries(balance.charges) as [keyof LeaveCharges, ChargeInfo | undefined][]) {
    if (info) charges[kind] = chargeView(info);
  }
  const base = { year, kind: balance.kind, figures: balanceFigures(balance), charges };
  if (balance.kind === "assenze") {
    return {
      ...base,
      assenze: {
        allowance: balance.assenzeAllowance,
        used: balance.assenzeUsed,
        remaining: balance.assenzeRemaining,
      },
    };
  }
  return {
    ...base,
    dailyHours: balance.dailyHours,
    startMonth: balance.startMonth ? ymd(balance.startMonth).slice(0, 7) : null,
    ferie: hourView(balance.ferie),
    permesso: hourView(balance.permesso),
  };
}

// Saldo dopo una richiesta (non salvata): lo stesso calcolo del form web
// (NewLeaveRequestDialog): disponibile alla fine della richiesta, con quanto
// sarà maturato fino ad allora, meno quanto la richiesta scala. `after` null se
// il tipo non scala un monte (fuori monte, o saldi non ancora impostati) o se
// la richiesta non scala niente. Andare in negativo è permesso: l'app lo avvisa.
// Non valida la richiesta: le regole restano quelle di create/update.
export async function previewOwnLeaveRequest(actor: LeaveActor, input: LeaveRequestInput) {
  const type = str(input.type);
  if (!leaveTypesFor(actor.employmentType).includes(type as LeaveType)) {
    throw new ValidationError("Tipo di richiesta non valido");
  }
  const startDateRaw = str(input.startDate);
  if (!isRealDay(startDateRaw)) throw new ValidationError("Data non valida");
  const isHourly =
    type === "permesso" || (OPTIONAL_HOURLY_LEAVE_TYPES.includes(type as LeaveType) && str(input.unit) === "ore");
  const endDateRaw = isHourly ? startDateRaw : str(input.endDate) || startDateRaw;
  if (!isRealDay(endDateRaw)) throw new ValidationError("Data non valida");
  const startDate = localDate(startDateRaw);
  const endDate = localDate(endDateRaw);
  const slotHours = isHourly ? hoursBetween(str(input.startTime).trim(), str(input.endTime).trim()) : null;

  const balance = await getLeaveBalance(actor.id, actor.employmentType as EmploymentType, new Date().getFullYear());
  const kind = chargeKind(balance.charges, type);
  const info = chargeFor(balance.charges, type);
  const days = !isHourly && endDate >= startDate ? countedLeaveDays(startDate, endDate) : 0;
  const dayOff = isHourly && !isWorkingDay(startDate);
  const requested = info ? chargeAmount(info, { days, hours: isHourly ? (dayOff ? 0 : (slotHours ?? 0)) : null }) : 0;
  const available = info ? availableAt(info, endDate) : null;
  const after = info && available !== null && requested > 0 ? Math.round((available - requested) * 100) / 100 : null;
  const overDailyCap =
    info?.maxPerDay != null && slotHours !== null && slotHours > info.maxPerDay ? info.maxPerDay : null;
  return {
    charged: kind,
    unit: info?.unit ?? null,
    requested,
    available,
    after,
    negative: after !== null && after < 0,
    overDailyCap,
  };
}

// Recuperi da fare ancora da smaltire (stessi della scelta nel form web).
export async function getOwnRecoveryCredits(actor: LeaveActor) {
  const credits = (await getRecoveryCreditsForUsers([actor.id])).get(actor.id) ?? [];
  return toOpenRecoveryCredits(credits);
}
