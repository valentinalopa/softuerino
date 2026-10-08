"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireUser,
  requireWritableUser,
  requireAdmin,
  requireSuperAdmin,
  revokeSessions,
} from "@/lib/auth/session";
import { getLeaveBalancesForUsers } from "@/lib/leave-balance";
import { hoursBetween } from "@/lib/leave-format";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { randomBytes } from "crypto";
import { isOidcConfigured, isSsoManaged } from "@/lib/auth/oidc";
import { absenceConflict } from "@/lib/absence-conflicts";
import {
  notifyEventInvite,
  notifyLeaveDecision,
  notifyTaskAssigned,
} from "@/lib/email/notifications";
import {
  EVENT_TYPES,
  leaveTypesFor,
  NOTE_REQUIRED_LEAVE_TYPES,
  type LeaveType,
  PRESENCE_SLOTS,
  PRESENCE_MODES,
  ROLES,
  assignableRoles,
  isAdminRole,
  EMPLOYMENT_TYPES,
  TASK_STATUSES,
  TASK_PRIORITIES,
  TASK_DONE_RETENTION_DAYS,
  CLIENT_CATEGORIES,
  LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE,
  balanceKindsFor,
  type BalanceKind,
  type EmploymentType,
  RECOVERY_UNITS,
  RECOVERY_STATUS_OVERRIDES,
  type RecoveryUnit,
} from "@/lib/constants";

// Costruisce una Date a mezzanotte locale da una stringa "yyyy-MM-dd", evitando che
// `new Date(str)` la interpreti come UTC (che sfaserebbe il giorno con fusi negativi).
function localDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

// Le action segnalano gli errori attesi (validazione, autorizzazione) restituendo
// { error } invece di lanciare: in produzione Next maschera i messaggi delle
// eccezioni lanciate lato server, quindi un throw non arriverebbe mai all'utente.
type ActionResult = { error: string } | undefined;

function isUniqueViolation(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "P2002"
  );
}

// Risposta delle azioni di scrittura durante un'impersonificazione.
const READ_ONLY_ERROR = {
  error: "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla",
};

// --- Team (admin e super admin) ---

// Un admin gestisce membri e admin; gli account dei super admin (e il ruolo
// super_admin stesso) li tocca solo un super admin.
const SUPER_ADMIN_ONLY_ERROR = {
  error: "Solo un super admin può gestire gli account dei super admin",
};

export async function createUser(formData: FormData) {
  const currentUser = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "membro");
  const employmentType = String(formData.get("employmentType") ?? "dipendente");
  // Con Keycloak la password locale serve solo ai super admin (emergenza): per
  // gli altri se ne genera una casuale mai comunicata, entreranno con l'SSO.
  const localPassword = !isOidcConfigured() || role === "super_admin";
  const password = localPassword
    ? String(formData.get("password") ?? "")
    : randomBytes(32).toString("base64");

  if (!name || !email || !password) {
    return {
      error: localPassword ? "Nome, email e password sono obbligatori" : "Nome ed email sono obbligatori",
    };
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return { error: "Ruolo non valido" };
  }
  if (!assignableRoles(currentUser.role).includes(role as (typeof ROLES)[number])) {
    return SUPER_ADMIN_ONLY_ERROR;
  }
  if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number])) {
    return { error: "Tipo di rapporto non valido" };
  }

  const passwordHash = await hashPassword(password);

  try {
    await prisma.user.create({
      data: { name, email, passwordHash, role, employmentType },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Questa email è già in uso" };
    }
    throw err;
  }

  revalidatePath("/team");
}

export async function updateUser(userId: string, formData: FormData) {
  const currentUser = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(formData.get("role") ?? "membro");
  const employmentType = String(formData.get("employmentType") ?? "dipendente");
  const active = String(formData.get("active") ?? "true") === "true";
  const password = String(formData.get("password") ?? "");

  if (!name || !email) {
    return { error: "Nome ed email sono obbligatori" };
  }
  if (!ROLES.includes(role as (typeof ROLES)[number])) {
    return { error: "Ruolo non valido" };
  }
  if (!EMPLOYMENT_TYPES.includes(employmentType as (typeof EMPLOYMENT_TYPES)[number])) {
    return { error: "Tipo di rapporto non valido" };
  }
  if (!active && userId === currentUser.id) {
    return { error: "Non puoi disattivare il tuo account" };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, name: true, email: true, oidcSubject: true },
  });
  if (!target) {
    return { error: "Utente non trovato" };
  }
  // Né modificare un super admin né promuovere qualcuno a super admin.
  if (
    !assignableRoles(currentUser.role).includes(target.role as (typeof ROLES)[number]) ||
    !assignableRoles(currentUser.role).includes(role as (typeof ROLES)[number])
  ) {
    return SUPER_ADMIN_ONLY_ERROR;
  }

  // Utente gestito da Keycloak: nome ed email restano quelli di Keycloak e la
  // password locale si imposta solo per un super admin (accesso d'emergenza).
  const ssoManaged = isSsoManaged(target);
  if (ssoManaged && password && role !== "super_admin") {
    return { error: "La password degli utenti con account aziendale si gestisce su Keycloak" };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: ssoManaged ? target.name : name,
        email: ssoManaged ? target.email : email,
        role,
        employmentType,
        active,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Questa email è già in uso" };
    }
    throw err;
  }

  // Reset password da parte dell'admin: le sessioni attive del membro vanno
  // revocate tutte (chi conosce la vecchia password non deve restare dentro).
  if (password) {
    await revokeSessions(userId);
  }

  revalidatePath("/team");
}

export async function deleteUser(userId: string) {
  const currentUser = await requireAdmin();

  if (userId === currentUser.id) {
    return { error: "Non puoi eliminare il tuo account" };
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!target) {
    return { error: "Utente non trovato" };
  }
  if (!assignableRoles(currentUser.role).includes(target.role as (typeof ROLES)[number])) {
    return SUPER_ADMIN_ONLY_ERROR;
  }

  const [leaveCount, presenceCount, timeEntryCount, taskCount] =
    await Promise.all([
      prisma.leaveRequest.count({ where: { userId } }),
      prisma.presenceEntry.count({ where: { userId } }),
      prisma.timeEntry.count({ where: { userId } }),
      prisma.taskAssignee.count({ where: { userId } }),
    ]);
  if (leaveCount + presenceCount + timeEntryCount + taskCount > 0) {
    return {
      error:
        "Questo membro ha uno storico (ferie, presenze, ore loggate o task assegnati): disattivalo invece di eliminarlo, per non perdere i dati.",
    };
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/team");
}

// --- Profilo (utente corrente) ---

export async function updateOwnProfile(formData: FormData) {
  const currentUser = await requireWritableUser();
  if (!currentUser) return READ_ONLY_ERROR;
  if (isSsoManaged(currentUser)) {
    return { error: "Nome ed email arrivano dall'account aziendale: per cambiarli contatta l'IT" };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();

  if (!name || !email) {
    return { error: "Nome ed email sono obbligatori" };
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing && existing.id !== currentUser.id) {
    return { error: "Questa email è già in uso" };
  }

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { name, email },
  });

  revalidatePath("/", "layout");
}

export async function changeOwnPassword(formData: FormData) {
  const currentUser = await requireWritableUser();
  if (!currentUser) return READ_ONLY_ERROR;
  // Con Keycloak la password locale serve solo ai super admin (emergenza).
  if (isOidcConfigured() && currentUser.role !== "super_admin") {
    return { error: "La password si gestisce sull'account aziendale (Keycloak)" };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (!currentPassword || !newPassword || !confirmPassword) {
    return { error: "Compila tutti i campi" };
  }
  if (newPassword.length < 8) {
    return { error: "La nuova password deve avere almeno 8 caratteri" };
  }
  if (newPassword !== confirmPassword) {
    return { error: "Le due password non coincidono" };
  }

  // L'hash non è nel session user (omit globale): va richiesto esplicitamente.
  const dbUser = await prisma.user.findUnique({
    where: { id: currentUser.id },
    omit: { passwordHash: false },
  });
  const valid = await verifyPassword(currentPassword, dbUser?.passwordHash ?? "");
  if (!valid) {
    return { error: "La password attuale non è corretta" };
  }

  await prisma.user.update({
    where: { id: currentUser.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  // Dopo il cambio password le sessioni sugli altri dispositivi non devono
  // restare valide (es. password cambiata perché compromessa).
  await revokeSessions(currentUser.id, { exceptCurrent: true });
}

// --- Ferie / permesso / malattia ---

export async function createLeaveRequest(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const type = String(formData.get("type") ?? "");
  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? startDateRaw) || startDateRaw;
  const startTimeRaw = String(formData.get("startTime") ?? "").trim();
  const endTimeRaw = String(formData.get("endTime") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;

  // Un admin può registrare ferie/permesso/malattia per conto di un altro
  // membro (es. malattia comunicata a voce): in quel caso la richiesta nasce già
  // approvata/registrata, senza passare dal flusso di approvazione.
  const targetUserIdRaw = String(formData.get("userId") ?? "").trim();
  const targetUserId = targetUserIdRaw || user.id;
  const onBehalfOfOther = targetUserId !== user.id;
  if (onBehalfOfOther && !isAdminRole(user.role)) {
    return { error: "Non autorizzato" };
  }

  const targetUser = onBehalfOfOther
    ? await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { employmentType: true },
      })
    : user;
  if (!targetUser) {
    return { error: "Membro non trovato" };
  }

  // Dipendenti: ferie/permesso/recupero/malattia. Partite IVA: assenza
  // (monte unico), recupero e assenza extra (fuori monte).
  if (!leaveTypesFor(targetUser.employmentType).includes(type as LeaveType)) {
    return { error: "Tipo di richiesta non valido" };
  }
  if (!startDateRaw) {
    return { error: "La data è obbligatoria" };
  }
  // Un recupero può smaltire un recupero da fare registrato dal super admin:
  // in quel caso il motivo è già lì e la nota diventa facoltativa.
  const recoveryCreditIdRaw =
    type === "recupero" ? String(formData.get("recoveryCreditId") ?? "").trim() : "";
  const recoveryCredit = recoveryCreditIdRaw
    ? await prisma.recoveryCredit.findFirst({
        where: { id: recoveryCreditIdRaw, userId: targetUserId },
        select: { id: true, unit: true },
      })
    : null;
  if (recoveryCreditIdRaw && !recoveryCredit) {
    return { error: "Recupero da fare non trovato" };
  }
  if (NOTE_REQUIRED_LEAVE_TYPES.includes(type as LeaveType) && !note && !recoveryCredit) {
    return { error: "Per il recupero la nota è obbligatoria: indica il motivo (es. la trasferta)" };
  }
  // A ore = un solo giorno con un numero di ore: il permesso sempre, il
  // recupero quando si sceglie "A ore" (o quando il recupero da fare è in ore).
  const isHourly =
    type === "permesso" ||
    (type === "recupero" &&
      (recoveryCredit ? recoveryCredit.unit === "ore" : String(formData.get("unit") ?? "") === "ore"));
  const effectiveEndDateRaw = isHourly ? startDateRaw : endDateRaw;
  if (effectiveEndDateRaw < startDateRaw) {
    return { error: "La data di fine non può precedere quella di inizio" };
  }

  // A ore si indica la fascia (dalle/alle): le ore, che scalano il saldo, ne
  // sono la durata.
  let hours: number | null = null;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (isHourly) {
    if (!startTimeRaw || !endTimeRaw) {
      return { error: "Indica la fascia oraria (dalle / alle)" };
    }
    hours = hoursBetween(startTimeRaw, endTimeRaw);
    if (hours === null) {
      return { error: "Fascia oraria non valida: l'orario di fine deve seguire quello di inizio" };
    }
    startTime = startTimeRaw;
    endTime = endTimeRaw;
  }

  const startDate = localDate(startDateRaw);
  const endDate = localDate(effectiveEndDateRaw);

  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      userId: targetUserId,
      status: { not: "rejected" },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) {
    return {
      error: onBehalfOfOther
        ? "Questo membro ha già una richiesta che copre (in parte) queste date"
        : "Hai già una richiesta che copre (in parte) queste date",
    };
  }

  // La malattia si registra e basta, non richiede approvazione. Le richieste
  // inserite dall'admin per conto di altri nascono già approvate.
  const status =
    type === "malattia"
      ? "registrata"
      : onBehalfOfOther
        ? "approved"
        : "pending";

  await prisma.leaveRequest.create({
    data: {
      userId: targetUserId,
      type,
      startDate,
      endDate,
      hours,
      startTime,
      endTime,
      note,
      status,
      recoveryCreditId: recoveryCredit?.id ?? null,
    },
  });

  revalidatePath("/richieste");
  revalidatePath("/richieste-team");
  revalidatePath("/panoramica");
  revalidatePath("/");
}

export async function updateLeaveStatus(
  requestId: string,
  status: "approved" | "rejected"
): Promise<ActionResult> {
  const currentUser = await requireAdmin();

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { type: true, userId: true },
  });
  if (!request) {
    return { error: "Richiesta non trovata" };
  }

  // La malattia non si "approva": una malattia riportata in attesa e poi
  // confermata torna "registrata", come quando nasce.
  const nextStatus =
    status === "approved" && request.type === "malattia" ? "registrata" : status;

  // updateMany invece di update: se la richiesta non è più pending (es. già
  // gestita da un altro admin) non deve esplodere con P2025, solo non fare nulla.
  const updated = await prisma.leaveRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: { status: nextStatus },
  });
  if (updated.count === 0) {
    return { error: "Richiesta già gestita o non più in attesa" };
  }
  revalidateLeavePaths(request.userId);
  after(() => notifyLeaveDecision(requestId, currentUser.id));
}

// Un admin può sempre riportare in attesa una richiesta già decisa
// (approvata, rifiutata o malattia registrata) per ridecidere. Il dipendente
// non può fare nulla sulla richiesta.
export async function revertLeaveToPending(requestId: string): Promise<ActionResult> {
  await requireAdmin();

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, status: true, startDate: true, endDate: true },
  });
  if (!request) {
    return { error: "Richiesta non trovata" };
  }
  if (request.status === "pending") {
    return { error: "La richiesta è già in attesa" };
  }

  // Una richiesta rifiutata non occupa le date: nel frattempo il membro può
  // averne fatta un'altra sugli stessi giorni. Riportarla in attesa creerebbe
  // una sovrapposizione, quindi la blocchiamo.
  if (request.status === "rejected") {
    const overlapping = await prisma.leaveRequest.findFirst({
      where: {
        id: { not: requestId },
        userId: request.userId,
        status: { not: "rejected" },
        startDate: { lte: request.endDate },
        endDate: { gte: request.startDate },
      },
    });
    if (overlapping) {
      return {
        error:
          "Il membro ha già un'altra richiesta su queste date: non è possibile riportarla in attesa",
      };
    }
  }

  const updated = await prisma.leaveRequest.updateMany({
    where: { id: requestId, status: { not: "pending" } },
    data: { status: "pending" },
  });
  if (updated.count === 0) {
    return { error: "La richiesta è già in attesa" };
  }
  revalidateLeavePaths(request.userId);
}

// Saldi residui impostati dal super admin (es. ricopiati dall'Excel). Per
// ogni valore si salva la rettifica che, nell'anno corrente, porta il residuo
// esattamente al numero inserito; da lì in poi le richieste approvate lo
// scalano normalmente.
export async function setLeaveBalances(
  entries: { userId: string; kind: BalanceKind; remaining: number }[]
): Promise<ActionResult> {
  await requireSuperAdmin();
  if (entries.length === 0) return;

  const year = new Date().getFullYear();
  const users = await prisma.user.findMany({
    where: { id: { in: [...new Set(entries.map((e) => e.userId))] } },
    select: { id: true, employmentType: true },
  });
  const userById = new Map(users.map((u) => [u.id, u]));

  for (const entry of entries) {
    const user = userById.get(entry.userId);
    if (!user) return { error: "Membro non trovato" };
    if (!balanceKindsFor(user.employmentType).includes(entry.kind)) {
      return { error: "Tipo di saldo non valido per questo membro" };
    }
    if (!Number.isFinite(entry.remaining) || Math.abs(entry.remaining) > 9999) {
      return { error: "Valore del saldo non valido" };
    }
  }

  const balances = await getLeaveBalancesForUsers(
    users.map((u) => ({ id: u.id, employmentType: u.employmentType as EmploymentType })),
    year
  );
  const monte = LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE;

  await prisma.$transaction(
    entries.map((entry) => {
      const balance = balances.get(entry.userId)!;
      // Rettifica = residuo voluto − monte annuale + già goduto quest'anno.
      const amount =
        balance.kind === "assenze"
          ? entry.remaining - monte.partita_iva.assenzeDaysPerYear + balance.assenzeUsed
          : entry.kind === "ferie"
            ? entry.remaining - monte.dipendente.ferieDaysPerYear + balance.ferieUsed
            : entry.remaining - monte.dipendente.permessoHoursPerYear + balance.permessoUsed;
      return prisma.leaveBalanceAdjustment.upsert({
        where: { userId_year_kind: { userId: entry.userId, year, kind: entry.kind } },
        create: { userId: entry.userId, year, kind: entry.kind, amount },
        update: { amount },
      });
    })
  );

  for (const userId of userById.keys()) revalidateLeavePaths(userId);
}

// --- Recuperi da fare (solo super admin) ---

export async function createRecoveryCredit(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const userId = String(formData.get("userId") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();
  const unit = String(formData.get("unit") ?? "");
  const amount = Number(String(formData.get("amount") ?? "").trim().replace(",", "."));
  const earnedOnRaw = String(formData.get("earnedOn") ?? "");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return { error: "Membro non trovato" };
  if (!reason) return { error: "Indica il motivo (es. trasferta Milano)" };
  if (!RECOVERY_UNITS.includes(unit as RecoveryUnit)) return { error: "Unità non valida" };
  if (!Number.isFinite(amount) || amount <= 0 || amount > 999) {
    return { error: "Indica una quantità valida" };
  }
  if (!earnedOnRaw) return { error: "Indica la data" };

  await prisma.recoveryCredit.create({
    data: { userId, reason, unit, amount, earnedOn: localDate(earnedOnRaw) },
  });
  revalidateLeavePaths(userId);
}

// override null = torna allo stato calcolato dalle richieste.
export async function setRecoveryCreditStatus(
  creditId: string,
  override: "da_fare" | "fatto" | null
): Promise<ActionResult> {
  await requireSuperAdmin();
  if (override !== null && !RECOVERY_STATUS_OVERRIDES.includes(override)) {
    return { error: "Stato non valido" };
  }
  const credit = await prisma.recoveryCredit.findUnique({
    where: { id: creditId },
    select: { userId: true },
  });
  if (!credit) return { error: "Recupero non trovato" };

  await prisma.recoveryCredit.update({
    where: { id: creditId },
    data: { statusOverride: override },
  });
  revalidateLeavePaths(credit.userId);
}

// Le richieste collegate restano: perdono solo il collegamento.
export async function deleteRecoveryCredit(creditId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const credit = await prisma.recoveryCredit.findUnique({
    where: { id: creditId },
    select: { userId: true },
  });
  if (!credit) return { error: "Recupero non trovato" };

  await prisma.recoveryCredit.delete({ where: { id: creditId } });
  revalidateLeavePaths(credit.userId);
}

function revalidateLeavePaths(userId: string) {
  revalidatePath("/team");
  revalidatePath("/richieste");
  revalidatePath("/panoramica");
  revalidatePath("/richieste-team");
  revalidatePath(`/team/${userId}`);
  revalidatePath("/");
}

// --- Calendario eventi (riunioni / shooting / altro) ---

export async function createEvent(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const startAtRaw = String(formData.get("startAt") ?? "");
  const endAtRaw = String(formData.get("endAt") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;
  const description =
    String(formData.get("description") ?? "").trim() || null;
  const participantIds = formData.getAll("participantIds").map(String);

  if (!title || !EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
    return { error: "Dati evento non validi" };
  }
  if (!startAtRaw || !endAtRaw) {
    return { error: "Le date/ora sono obbligatorie" };
  }
  const startAt = new Date(startAtRaw);
  const endAt = new Date(endAtRaw);
  if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
    return { error: "Le date/ora non sono valide" };
  }
  if (endAt < startAt) {
    return { error: "La fine non può precedere l'inizio" };
  }

  // Chi è assente (giornata intera, già approvata/registrata) nelle date
  // dell'evento non può essere invitato: il form lo impedisce, qui lo si garantisce.
  if (participantIds.length > 0) {
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
      prisma.user.findMany({
        where: { id: { in: participantIds } },
        select: { id: true, name: true },
      }),
    ]);
    for (const participant of participants) {
      // Il motivo finisce nel messaggio d'errore: niente "Malattia" dei colleghi.
      const conflict = absenceConflict(
        absences.map((absence) => maskLeaveForViewer(absence, user)),
        participant.id,
        startAt,
        endAt
      );
      if (conflict?.kind === "blocked") {
        return {
          error: `${participant.name} è assente in quelle date (${conflict.reason}). Rimuovi questa persona dai partecipanti`,
        };
      }
    }
  }

  const event = await prisma.calendarEvent.create({
    data: {
      title,
      type,
      startAt,
      endAt,
      location,
      description,
      createdById: user.id,
      participants: {
        create: participantIds.map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/calendario");
  after(() => notifyEventInvite(event.id, participantIds, user.id));
}

export async function deleteEvent(eventId: string) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  // Può eliminare: admin, chi ha creato l'evento, o un partecipante.
  if (!isAdminRole(user.role)) {
    const event = await prisma.calendarEvent.findUnique({
      where: { id: eventId },
      select: { createdById: true },
    });
    if (!event) {
      return { error: "Evento non trovato" };
    }
    if (event.createdById !== user.id) {
      const isParticipant = await prisma.eventParticipant.findUnique({
        where: { eventId_userId: { eventId, userId: user.id } },
      });
      if (!isParticipant) {
        return { error: "Non autorizzato" };
      }
    }
  }

  await prisma.calendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/");
  revalidatePath("/calendario");
}

// --- Calendario presenze (self-log, nessuna approvazione) ---

// Slot incompatibili sullo stesso giorno: "giornata intera" non può convivere
// con mattina/pomeriggio (e viceversa). Impostare uno slot rimuove i conflitti.
function conflictingSlots(slot: string) {
  return slot === "giornata_intera" ? ["mattina", "pomeriggio"] : ["giornata_intera"];
}

export async function createPresenceEntry(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const date = String(formData.get("date") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const mode = String(formData.get("mode") ?? "");

  if (!date) {
    return { error: "La data è obbligatoria" };
  }
  if (!PRESENCE_SLOTS.includes(slot as (typeof PRESENCE_SLOTS)[number])) {
    return { error: "Fascia oraria non valida" };
  }
  if (!PRESENCE_MODES.includes(mode as (typeof PRESENCE_MODES)[number])) {
    return { error: "Modalità non valida" };
  }

  await prisma.$transaction([
    prisma.presenceEntry.deleteMany({
      where: {
        userId: user.id,
        date: localDate(date),
        slot: { in: conflictingSlots(slot) },
      },
    }),
    prisma.presenceEntry.upsert({
      where: {
        userId_date_slot: { userId: user.id, date: localDate(date), slot },
      },
      update: { mode },
      create: { userId: user.id, date: localDate(date), slot, mode },
    }),
  ]);

  revalidatePath("/presenze");
}

// Applica la stessa fascia oraria/modalità a più giorni in un colpo solo
// (es. "tutti i lunedì e giovedì in ufficio la mattina"). Un admin può
// farlo anche sul calendario di un altro membro del team.
export async function createPresenceEntries({
  userId: targetUserId,
  dates,
  slot,
  mode,
  replace = [],
}: {
  userId?: string;
  dates: string[];
  slot: string;
  mode: string;
  // Presenze esistenti da rimuovere nella stessa transazione: usato quando si
  // "modifica" un box esistente cambiandogli fascia oraria (sostituzione, non
  // aggiunta).
  replace?: { date: string; slot: string }[];
}) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  const userId = targetUserId ?? user.id;
  if (userId !== user.id && !isAdminRole(user.role)) {
    return { error: "Non autorizzato" };
  }

  if (dates.length === 0) {
    return { error: "Seleziona almeno un giorno" };
  }
  if (!PRESENCE_SLOTS.includes(slot as (typeof PRESENCE_SLOTS)[number])) {
    return { error: "Fascia oraria non valida" };
  }
  if (!PRESENCE_MODES.includes(mode as (typeof PRESENCE_MODES)[number])) {
    return { error: "Modalità non valida" };
  }

  await prisma.$transaction([
    ...replace.map((item) =>
      prisma.presenceEntry.deleteMany({
        where: { userId, date: localDate(item.date), slot: item.slot },
      })
    ),
    ...dates.map((date) =>
      prisma.presenceEntry.deleteMany({
        where: {
          userId,
          date: localDate(date),
          slot: { in: conflictingSlots(slot) },
        },
      })
    ),
    ...dates.map((date) =>
      prisma.presenceEntry.upsert({
        where: {
          userId_date_slot: { userId, date: localDate(date), slot },
        },
        update: { mode },
        create: { userId, date: localDate(date), slot, mode },
      })
    ),
  ]);

  revalidatePath("/presenze");
}

export async function deletePresenceEntry(entryId: string) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  await prisma.presenceEntry.delete({
    where: { id: entryId, userId: user.id },
  });
  revalidatePath("/presenze");
}

// Elimina più presenze selezionate dal calendario (per data + fascia oraria,
// così non serve conoscere l'id della riga lato client). Un admin può
// farlo anche sul calendario di un altro membro del team.
export async function deletePresenceEntries({
  userId: targetUserId,
  items,
}: {
  userId?: string;
  items: { date: string; slot: string }[];
}) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  const userId = targetUserId ?? user.id;
  if (userId !== user.id && !isAdminRole(user.role)) {
    return { error: "Non autorizzato" };
  }

  if (items.length === 0) {
    return { error: "Seleziona almeno un giorno" };
  }

  await prisma.$transaction(
    items.map((item) =>
      prisma.presenceEntry.deleteMany({
        where: { userId, date: localDate(item.date), slot: item.slot },
      })
    )
  );

  revalidatePath("/presenze");
}

// --- Clienti (admin e super admin) ---

export async function createClient(formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const categories = formData.getAll("categories").map(String);
  if (!name) {
    return { error: "Il nome del cliente è obbligatorio" };
  }
  if (
    categories.some(
      (c) => !CLIENT_CATEGORIES.includes(c as (typeof CLIENT_CATEGORIES)[number])
    )
  ) {
    return { error: "Categoria non valida" };
  }

  try {
    await prisma.client.create({
      data: { name, categories: categories.join(",") },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Esiste già un cliente con questo nome" };
    }
    throw err;
  }
  revalidatePath("/clienti");
  revalidatePath("/ore");
}

export async function updateClient(clientId: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const active = String(formData.get("active") ?? "true") === "true";
  const categories = formData.getAll("categories").map(String);

  if (!name) {
    return { error: "Il nome del cliente è obbligatorio" };
  }
  if (
    categories.some(
      (c) => !CLIENT_CATEGORIES.includes(c as (typeof CLIENT_CATEGORIES)[number])
    )
  ) {
    return { error: "Categoria non valida" };
  }

  try {
    await prisma.client.update({
      where: { id: clientId },
      data: { name, active, categories: categories.join(",") },
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Esiste già un cliente con questo nome" };
    }
    throw err;
  }
  revalidatePath("/clienti");
  revalidatePath("/ore");
}

export async function deleteClient(clientId: string) {
  await requireAdmin();

  const [timeEntryCount, taskCount] = await Promise.all([
    prisma.timeEntry.count({ where: { clientId } }),
    prisma.task.count({ where: { clientId } }),
  ]);
  if (timeEntryCount + taskCount > 0) {
    return {
      error:
        "Questo cliente ha ore o task collegati: disattivalo invece di eliminarlo, per non perdere i dati.",
    };
  }

  await prisma.client.delete({ where: { id: clientId } });
  revalidatePath("/clienti");
  revalidatePath("/ore");
}

// --- Log ore su cliente/progetto ---

// Sostituisce interamente le ore loggate per il giorno indicato con quelle
// inviate dal form (una riga per cliente con ore > 0; tutte a zero = giornata
// svuotata). Un admin può farlo anche sul log di un altro membro.
export async function saveDailyTimeEntries(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const targetUserIdRaw = String(formData.get("userId") ?? "").trim();
  const targetUserId = targetUserIdRaw || user.id;
  if (targetUserId !== user.id && !isAdminRole(user.role)) {
    return { error: "Non autorizzato" };
  }

  const dateRaw = String(formData.get("date") ?? "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateRaw)) {
    return { error: "Data non valida" };
  }

  const clientIds = formData.getAll("clientId").map(String);
  const hoursRaw = formData.getAll("hours").map(String);

  const day = localDate(dateRaw);
  const nextDay = new Date(day);
  nextDay.setDate(nextDay.getDate() + 1);

  const entries = clientIds
    .map((clientId, i) => ({ clientId, hours: Number(hoursRaw[i]) }))
    .filter((e) => e.clientId && Number.isFinite(e.hours) && e.hours > 0);

  // Una giornata già registrata la corregge solo un admin (dalla scheda
  // membro): il form la nasconde, ma il vincolo va garantito anche qui.
  if (!isAdminRole(user.role)) {
    const alreadyLogged = await prisma.timeEntry.count({
      where: { userId: targetUserId, date: { gte: day, lt: nextDay } },
    });
    if (alreadyLogged > 0) {
      return { error: "Questa giornata è già registrata" };
    }
  }

  await prisma.$transaction([
    prisma.timeEntry.deleteMany({
      where: { userId: targetUserId, date: { gte: day, lt: nextDay } },
    }),
    ...entries.map((e) =>
      prisma.timeEntry.create({
        data: {
          userId: targetUserId,
          clientId: e.clientId,
          date: day,
          hours: e.hours,
          description: "",
        },
      })
    ),
  ]);

  revalidatePath("/ore");
  revalidatePath(`/team/${targetUserId}`);
  revalidatePath("/");
}

// --- Task ---

// Campi del form task (nuovo e modifica), già validati.
type TaskFormData = {
  title: string;
  clientId: string | null;
  status: string;
  priority: string | null;
  dueDate: Date | null;
};

function parseTaskForm(
  formData: FormData
): { error: string } | { data: TaskFormData; assigneeIds: string[] } {
  const title = String(formData.get("title") ?? "").trim();
  const clientIdRaw = String(formData.get("clientId") ?? "").trim();
  const clientId = clientIdRaw && clientIdRaw !== "none" ? clientIdRaw : null;
  const status = String(formData.get("status") ?? "not_started");
  const priorityRaw = String(formData.get("priority") ?? "").trim();
  const priority = priorityRaw || null;
  const dueDateRaw = String(formData.get("dueDate") ?? "").trim();
  const assigneeIds = [...new Set(formData.getAll("assigneeIds").map(String))];

  if (!title) {
    return { error: "Il task è obbligatorio" };
  }
  if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    return { error: "Stato non valido" };
  }
  if (priority && !TASK_PRIORITIES.includes(priority as (typeof TASK_PRIORITIES)[number])) {
    return { error: "Priorità non valida" };
  }
  if (dueDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) {
    return { error: "Scadenza non valida" };
  }

  return {
    data: {
      title,
      clientId,
      status,
      priority,
      // localDate, non new Date(): una stringa data-only verrebbe letta come
      // mezzanotte UTC e mostrata un giorno prima nei fusi negativi.
      dueDate: dueDateRaw ? localDate(dueDateRaw) : null,
    },
    assigneeIds,
  };
}

export async function createTask(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const parsed = parseTaskForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { data, assigneeIds } = parsed;

  const task = await prisma.task.create({
    data: {
      ...data,
      completedAt: data.status === "done" ? new Date() : null,
      assignees: {
        create: assigneeIds.map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/task");
  after(() => notifyTaskAssigned(task.id, assigneeIds, user.id));
}

// Eliminare un task resta ad admin e assegnatari: modificarlo (stato e campi)
// invece può chiunque nel team, i task sono condivisi.
async function canDeleteTask(taskId: string) {
  const user = await requireUser();
  if (isAdminRole(user.role)) return true;

  const isAssignee = await prisma.taskAssignee.findUnique({
    where: { taskId_userId: { taskId, userId: user.id } },
  });
  return Boolean(isAssignee);
}

export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<ActionResult> {
  if (!(await requireWritableUser())) return READ_ONLY_ERROR;

  if (!TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    return { error: "Stato non valido" };
  }

  const updated = await prisma.task.updateMany({
    where: { id: taskId },
    data: { status, completedAt: status === "done" ? new Date() : null },
  });
  if (updated.count === 0) return { error: "Task non trovato (forse è stato eliminato)" };
  revalidatePath("/task");
}

// Modifica dal pannello della riga: tutti i campi, assegnatari compresi.
export async function updateTask(taskId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const parsed = parseTaskForm(formData);
  if ("error" in parsed) return { error: parsed.error };
  const { data, assigneeIds } = parsed;

  const current = await prisma.task.findUnique({
    where: { id: taskId },
    select: { status: true, completedAt: true, assignees: { select: { userId: true } } },
  });
  if (!current) return { error: "Task non trovato" };

  // completedAt fa partire il conto per l'eliminazione: si azzera solo se il
  // task esce da "done", e non si sposta se ci resta.
  const completedAt =
    data.status !== "done" ? null : current.status === "done" ? current.completedAt : new Date();

  await prisma.task.update({
    where: { id: taskId },
    data: {
      ...data,
      completedAt,
      assignees: {
        deleteMany: {},
        create: assigneeIds.map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/task");
  // Avvisa solo chi è stato aggiunto adesso.
  const previous = new Set(current.assignees.map((a) => a.userId));
  const added = assigneeIds.filter((id) => !previous.has(id));
  if (added.length > 0) after(() => notifyTaskAssigned(taskId, added, user.id));
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  if (!(await requireWritableUser())) return READ_ONLY_ERROR;
  if (!(await canDeleteTask(taskId))) {
    return { error: "Solo gli assegnatari o un admin possono eliminare questo task" };
  }
  await prisma.task.delete({ where: { id: taskId } });
  revalidatePath("/task");
}

// Elimina i task "done" completati da più di TASK_DONE_RETENTION_DAYS giorni.
// Chiamata in modo lazy dalla pagina /task ad ogni caricamento: nessun cron necessario.
export async function purgeExpiredDoneTasks() {
  await requireUser();
  const cutoff = new Date(
    Date.now() - TASK_DONE_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  await prisma.task.deleteMany({
    where: { status: "done", completedAt: { lt: cutoff } },
  });
}
