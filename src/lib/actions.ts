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
import { isWorkingDay } from "@/lib/leave-days";
import { addUpcomingClosuresFor } from "@/lib/closures";
import { applyImport, parseImportFile, planImport, type ImportReport } from "@/lib/import-saldi";
import { nextDeactivatedAt } from "@/lib/retention";
import { ForbiddenError, purgeTaskArchive } from "@/lib/task-archive";
import * as eventsService from "@/lib/services/events";
import * as presenceService from "@/lib/services/presence";
import * as leaveService from "@/lib/services/leave";
import * as timeService from "@/lib/services/time";
import * as tasksService from "@/lib/services/tasks";
import * as clientsService from "@/lib/services/clients";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/services/errors";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { randomBytes } from "crypto";
import { isOidcConfigured, isSsoManaged } from "@/lib/auth/oidc";
import { canOnPerson } from "@/lib/permissions";
import {
  notifyEventInvite,
  notifyLeaveDecision,
} from "@/lib/email/notifications";
import {
  ROLES,
  assignableRoles,
  isAdminRole,
  isSensitiveLeave,
  EMPLOYMENT_TYPES,
  CLIENT_CATEGORIES,
  PARTITA_IVA_ASSENZE_DAYS_PER_YEAR,
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
  // Solo admin e super admin. Gli altri, se hanno il permesso, chiedono un
  // nuovo utente (requestAccount): l'account si crea in Keycloak.
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

  let userId: string;
  try {
    const created = await prisma.user.create({
      data: { name, email, passwordHash, role, employmentType },
    });
    userId = created.id;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return { error: "Questa email è già in uso" };
    }
    throw err;
  }
  await addUpcomingClosuresFor(userId);

  revalidatePath("/team");
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
    select: { role: true, name: true, email: true, oidcSubject: true, active: true, deactivatedAt: true },
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

  // Utente gestito da Keycloak: nome ed email restano quelli di Keycloak. Con
  // l'SSO attivo la password locale si imposta solo per un super admin
  // (accesso d'emergenza): gli altri entrano solo con l'account aziendale.
  const ssoManaged = isSsoManaged(target);
  if (isOidcConfigured() && password && role !== "super_admin") {
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
        // Cessazione del rapporto: da qui partono i 10 anni di conservazione.
        deactivatedAt: nextDeactivatedAt(active, target, new Date()),
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

// Le regole (PR #50) stanno nel service (src/lib/services/leave.ts), usato anche
// dall'app iPhone: qui solo il passaggio dal form e il ritorno come ActionResult.
function leaveInputFromForm(formData: FormData): leaveService.LeaveRequestInput {
  return {
    type: formData.get("type"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
    startTime: formData.get("startTime"),
    endTime: formData.get("endTime"),
    note: formData.get("note"),
    recoveryCreditId: formData.get("recoveryCreditId"),
    unit: formData.get("unit"),
    userId: formData.get("userId"),
  };
}

// Un admin può registrare ferie/permesso/malattia per conto di un altro membro:
// la richiesta nasce già approvata/registrata (regole nel service).
export async function createLeaveRequest(formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  try {
    const { userId, notify } = await leaveService.createLeaveRequest(user, leaveInputFromForm(formData));
    revalidateLeavePaths(userId);
    after(notify);
  } catch (err) {
    return eventServiceError(err);
  }
}

// Chi ha fatto una richiesta può cambiarla finché è in attesa: torna in attesa
// con i nuovi dati e chi deve approvarla viene avvisato.
export async function updateOwnLeaveRequest(requestId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  try {
    const { notify } = await leaveService.updateOwnLeaveRequest(user, requestId, leaveInputFromForm(formData));
    revalidateLeavePaths(user.id);
    after(notify);
  } catch (err) {
    return eventServiceError(err);
  }
}

// Chi ha fatto una richiesta può ritirarla finché è in attesa: sparisce, e
// chi doveva approvarla viene avvisato. Una malattia registrata per errore la
// toglie un admin (riporta in attesa e rifiuta) o il super admin.
export async function withdrawOwnLeaveRequest(requestId: string): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  try {
    const { notify } = await leaveService.withdrawOwnLeaveRequest(user, requestId);
    revalidateLeavePaths(user.id);
    after(notify);
  } catch (err) {
    return eventServiceError(err);
  }
}

export async function updateLeaveStatus(
  requestId: string,
  status: "approved" | "rejected"
): Promise<ActionResult> {
  // Admin e super admin; oppure chi ha il permesso "Approvare le richieste"
  // sulla persona (es. il responsabile del suo reparto). Mai le proprie,
  // nemmeno per gli admin: le decide un altro admin.
  const currentUser = await requireWritableUser();
  if (!currentUser) return READ_ONLY_ERROR;

  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { type: true, userId: true },
  });
  if (!request) {
    return { error: "Richiesta non trovata" };
  }
  if (request.userId === currentUser.id) {
    return { error: "Non puoi decidere le tue richieste: le approva un altro admin" };
  }
  if (!isAdminRole(currentUser.role)) {
    // Il responsabile non vede malattie e permessi 104 (dati sanitari): non
    // li gestisce, li decide un admin.
    if (isSensitiveLeave(request.type) || !(await canOnPerson(currentUser, "approvare", request.userId))) {
      return { error: "Non autorizzato" };
    }
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

// Solo super admin: elimina una richiesta (ferie, permesso, malattia...) in
// qualunque stato, es. inserita per errore. I saldi si ricalcolano da soli
// (si basano sulle richieste approvate) e un recupero da fare collegato torna
// a contare solo le richieste rimaste.
export async function deleteLeaveRequest(requestId: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { userId: true },
  });
  if (!request) {
    return { error: "Richiesta non trovata (forse è già stata eliminata)" };
  }
  await prisma.leaveRequest.delete({ where: { id: requestId } });
  revalidateLeavePaths(request.userId);
}

// Monte assenze di una partita IVA, impostato dal super admin: si salva la
// rettifica che, nell'anno corrente, porta il residuo esattamente al numero
// inserito; da lì le richieste approvate lo scalano normalmente.
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
    if (user.employmentType !== "partita_iva" || entry.kind !== "assenze") {
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

  await prisma.$transaction(
    entries.map((entry) => {
      const balance = balances.get(entry.userId)!;
      const used = balance.kind === "assenze" ? balance.assenzeUsed : 0;
      // Rettifica = residuo voluto − monte annuale + già goduto quest'anno.
      const amount = entry.remaining - PARTITA_IVA_ASSENZE_DAYS_PER_YEAR + used;
      return prisma.leaveBalanceAdjustment.upsert({
        where: { userId_year_kind: { userId: entry.userId, year, kind: entry.kind } },
        create: { userId: entry.userId, year, kind: entry.kind, amount },
        update: { amount, setAt: new Date() },
      });
    })
  );

  for (const userId of userById.keys()) revalidateLeavePaths(userId);
}

// Numero scritto come nella busta paga ("22,42", anche negativo).
function parseHours(raw: FormDataEntryValue | null) {
  const normalized = String(raw ?? "").trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Math.abs(value) <= 9999 ? value : null;
}

// Saldi di un dipendente presi dalla busta paga (solo super admin): residuo di
// ferie e ROL alla fine del mese della busta, quote annue e ore al giorno.
// Da qui maturano 1/12 a fine mese e scalano le richieste approvate dal mese
// dopo. La stessa busta reinserita sovrascrive quella salvata.
export async function setBalanceStart(userId: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employmentType: true },
  });
  if (!user) return { error: "Membro non trovato" };
  if (user.employmentType === "partita_iva") {
    return { error: "Le partite IVA non hanno ferie e ROL in busta paga" };
  }

  const monthRaw = String(formData.get("month") ?? "");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthRaw)) return { error: "Indica il mese della busta paga" };
  const [y, m] = monthRaw.split("-").map(Number);
  const month = new Date(y, m - 1, 1);
  const now = new Date();
  if (month > new Date(now.getFullYear(), now.getMonth(), 1)) {
    return { error: "Il mese della busta paga non può essere nel futuro" };
  }

  const ferieHours = parseHours(formData.get("ferieHours"));
  const rolHours = parseHours(formData.get("rolHours"));
  const ferieHoursPerYear = parseHours(formData.get("ferieHoursPerYear"));
  const rolHoursPerYear = parseHours(formData.get("rolHoursPerYear"));
  const dailyHours = parseHours(formData.get("dailyHours"));
  if (ferieHours === null) return { error: "Residuo ferie: inserisci un numero (es. 22,42)" };
  if (rolHours === null) return { error: "Residuo ROL: inserisci un numero (es. -8,97)" };
  if (ferieHoursPerYear === null || ferieHoursPerYear < 0) return { error: "Ferie l'anno: inserisci le ore (es. 86,67)" };
  if (rolHoursPerYear === null || rolHoursPerYear < 0) return { error: "ROL l'anno: inserisci le ore (es. 14)" };
  if (dailyHours === null || dailyHours <= 0 || dailyHours > 12) return { error: "Ore al giorno: inserisci un numero tra 1 e 12" };

  const data = { ferieHours, rolHours, ferieHoursPerYear, rolHoursPerYear };
  await prisma.$transaction([
    prisma.leaveBalanceStart.upsert({
      where: { userId_month: { userId, month } },
      create: { userId, month, ...data },
      update: data,
    }),
    prisma.user.update({ where: { id: userId }, data: { dailyHours } }),
  ]);
  revalidateLeavePaths(userId);
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

// --- Chiusure aziendali (admin e super admin) ---

// Una chiusura vale per tutto il team: per ogni membro attivo nasce una
// richiesta "chiusura" già approvata, che scala ferie o assenze. Le ferie già
// approvate negli stessi giorni restano: il giorno si scala una volta sola.
export async function createCompanyClosure(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const startDateRaw = String(formData.get("startDate") ?? "");
  const endDateRaw = String(formData.get("endDate") ?? "") || startDateRaw;
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!startDateRaw) return { error: "La data è obbligatoria" };
  if (endDateRaw < startDateRaw) {
    return { error: "La data di fine non può precedere quella di inizio" };
  }
  const startDate = localDate(startDateRaw);
  const endDate = localDate(endDateRaw);

  const overlapping = await prisma.companyClosure.findFirst({
    where: { startDate: { lte: endDate }, endDate: { gte: startDate } },
  });
  if (overlapping) {
    return { error: "C'è già una chiusura aziendale che copre (in parte) queste date" };
  }

  const members = await prisma.user.findMany({ where: { active: true }, select: { id: true } });
  await prisma.companyClosure.create({
    data: {
      startDate,
      endDate,
      note,
      requests: {
        create: members.map((member) => ({
          userId: member.id,
          type: "chiusura",
          status: "approved",
          startDate,
          endDate,
          note,
        })),
      },
    },
  });
  revalidateClosurePaths();
}

// Elimina la chiusura e le richieste collegate di tutti i membri.
export async function deleteCompanyClosure(closureId: string): Promise<ActionResult> {
  await requireAdmin();
  const deleted = await prisma.companyClosure.deleteMany({ where: { id: closureId } });
  if (deleted.count === 0) {
    return { error: "Chiusura non trovata (forse è già stata eliminata)" };
  }
  revalidateClosurePaths();
}

// Una chiusura tocca le richieste e i saldi di tutto il team.
function revalidateClosurePaths() {
  revalidatePath("/team", "layout");
  revalidatePath("/richieste");
  revalidatePath("/panoramica");
  revalidatePath("/calendario");
  revalidatePath("/calendario");
  revalidatePath("/");
}

function revalidateLeavePaths(userId: string) {
  revalidatePath("/team");
  revalidatePath("/richieste");
  revalidatePath("/panoramica");
  revalidatePath(`/team/${userId}`);
  revalidatePath("/calendario");
  revalidatePath("/");
}

// --- Calendario eventi (riunioni / shooting / altro) ---

// Le regole stanno nel service (src/lib/services/events.ts), usato anche
// dall'app iPhone: qui solo il passaggio dal form e il ritorno come ActionResult.
function eventInputFromForm(formData: FormData): eventsService.EventInput {
  return {
    title: formData.get("title"),
    type: formData.get("type"),
    startAt: formData.get("startAt"),
    endAt: formData.get("endAt"),
    location: formData.get("location"),
    description: formData.get("description"),
    participantIds: formData.getAll("participantIds"),
  };
}

// Errori attesi del service → { error } (un throw non arriverebbe all'utente).
function eventServiceError(err: unknown): { error: string } {
  if (
    err instanceof ValidationError ||
    err instanceof ConflictError ||
    err instanceof NotFoundError ||
    err instanceof ForbiddenError
  ) {
    return { error: err.message };
  }
  throw err;
}

export async function createEvent(formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  let created;
  try {
    created = await eventsService.createEvent(user, eventInputFromForm(formData));
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/");
  revalidatePath("/calendario");
  after(() => notifyEventInvite(created.event.id, created.newParticipantIds, user.id));
}

// Modifica dal dettaglio dell'evento: tutti i campi, partecipanti compresi.
export async function updateEvent(eventId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  let updated;
  try {
    updated = await eventsService.updateEvent(user, eventId, eventInputFromForm(formData));
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/");
  revalidatePath("/calendario");
  // Invita solo chi è stato aggiunto adesso.
  const added = updated.newParticipantIds;
  if (added.length > 0) after(() => notifyEventInvite(eventId, added, user.id));
}

export async function deleteEvent(eventId: string): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  try {
    await eventsService.deleteEvent(user, eventId);
  } catch (err) {
    return eventServiceError(err);
  }
  revalidatePath("/");
  revalidatePath("/calendario");
}

// --- Calendario presenze (self-log, nessuna approvazione) ---

// Le regole (slot incompatibili, validazione) stanno nel service
// src/lib/services/presence.ts, usato anche dall'app iPhone.
export async function createPresenceEntry(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const date = String(formData.get("date") ?? "");
  const slot = String(formData.get("slot") ?? "");
  const mode = String(formData.get("mode") ?? "");

  if (!date) {
    return { error: "La data è obbligatoria" };
  }

  try {
    await presenceService.savePresenceFor(user.id, { dates: [date], slot, mode });
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/calendario");
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

  try {
    await presenceService.savePresenceFor(userId, { dates, slot, mode, replace });
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/calendario");
}

export async function deletePresenceEntry(entryId: string) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  await prisma.presenceEntry.delete({
    where: { id: entryId, userId: user.id },
  });
  revalidatePath("/calendario");
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

  try {
    await presenceService.removePresenceFor(userId, items);
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/calendario");
}

// --- Clienti (admin e super admin) ---

// "Fa parte di" e "Chi può loggare" (solo admin). Un solo livello: il padre
// non può essere a sua volta una voce, né un cliente che ha già voci.
async function parseClientStructure(
  formData: FormData,
  clientId?: string
): Promise<{ error: string } | { parentId: string | null; loggerIds: string[] }> {
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const loggerIds = [...new Set(formData.getAll("loggerIds").map(String).filter(Boolean))];

  if (parentId) {
    if (parentId === clientId) return { error: "Un cliente non può far parte di sé stesso" };
    const parent = await prisma.client.findUnique({ where: { id: parentId }, select: { parentId: true } });
    if (!parent) return { error: "Cliente padre non trovato" };
    if (parent.parentId) return { error: "Il cliente padre è già una voce di un altro cliente" };
    if (clientId && (await prisma.client.count({ where: { parentId: clientId } })) > 0) {
      return { error: "Questo cliente ha già delle voci: non può far parte di un altro cliente" };
    }
  }
  if (loggerIds.length > 0) {
    const found = await prisma.user.count({ where: { id: { in: loggerIds } } });
    if (found !== loggerIds.length) return { error: "Persona non valida" };
  }
  return { parentId, loggerIds };
}

export async function createClient(formData: FormData) {
  // Admin e super admin, o chi ha il permesso "Aggiungere clienti". Regole nel
  // service (condiviso con l'app iPhone). Chi non è admin aggiunge solo clienti
  // semplici, aperti a tutti: il form web non invia padre e persone, qui si
  // scartano comunque.
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  const isAdmin = isAdminRole(user.role);

  try {
    await clientsService.createClient(
      { id: user.id, role: user.role },
      {
        name: formData.get("name"),
        categories: formData.getAll("categories"),
        ...(isAdmin ? { parentId: formData.get("parentId"), loggerIds: formData.getAll("loggerIds") } : {}),
      }
    );
  } catch (err) {
    return eventServiceError(err);
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
  const structure = await parseClientStructure(formData, clientId);
  if ("error" in structure) return structure;

  try {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        name,
        active,
        categories: categories.join(","),
        parentId: structure.parentId,
        loggers: {
          deleteMany: {},
          create: structure.loggerIds.map((userId) => ({ userId })),
        },
      },
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

  const [timeEntryCount, taskCount, childCount] = await Promise.all([
    prisma.timeEntry.count({ where: { clientId } }),
    prisma.task.count({ where: { clientId } }),
    prisma.client.count({ where: { parentId: clientId } }),
  ]);
  if (childCount > 0) {
    return { error: "Questo cliente ha delle voci collegate: spostale o eliminale prima." };
  }
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

  // Regole nel service (condiviso con l'app). userId: un admin può farlo anche sul
  // log di un altro membro.
  const targetUserId = String(formData.get("userId") ?? "").trim() || user.id;
  const dateRaw = String(formData.get("date") ?? "");
  const clientIds = formData.getAll("clientId").map(String);
  const hoursRaw = formData.getAll("hours").map(String);
  const entries = clientIds
    .map((clientId, i) => ({ clientId, hours: Number(hoursRaw[i]) }))
    .filter((e) => e.clientId && Number.isFinite(e.hours) && e.hours > 0);

  try {
    await timeService.replaceDayFor({ id: user.id, role: user.role }, targetUserId, dateRaw, entries);
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/ore");
  revalidatePath(`/team/${targetUserId}`);
  revalidatePath("/");
}

// "Oggi non ho lavorato" nel log ore: segna (o toglie) una giornata da non
// registrare, senza promemoria né avvisi di ore mancanti. Non vale per una
// giornata che ha già ore. Un admin può farlo anche per un altro membro.
export async function setDayNotWorked(formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  const targetUserId = String(formData.get("userId") ?? "").trim() || user.id;
  try {
    await timeService.setDayNotWorkedFor(
      { id: user.id, role: user.role },
      targetUserId,
      String(formData.get("date") ?? ""),
      formData.get("notWorked") === "1"
    );
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/ore");
  revalidatePath(`/team/${targetUserId}`);
  revalidatePath("/");
}

// --- Import saldi e assenze (Impostazioni → Importa dati) ---

// Anteprima: cosa cambierebbe il file, senza scrivere niente.
export async function previewSaldiImport(
  text: string
): Promise<{ error: string } | { report: ImportReport }> {
  await requireSuperAdmin();
  const parsed = parseImportFile(text);
  if ("error" in parsed) return parsed;
  return { report: (await planImport(parsed.data)).report };
}

// Applica il file. Il piano si ricalcola qui, sul database di adesso: non si
// fida dell'anteprima mandata dal browser.
export async function applySaldiImport(
  text: string
): Promise<{ error: string } | { report: ImportReport }> {
  await requireSuperAdmin();
  const parsed = parseImportFile(text);
  if ("error" in parsed) return parsed;
  const plan = await planImport(parsed.data);
  await applyImport(plan);
  revalidatePath("/", "layout");
  return { report: plan.report };
}

// --- Task ---

// Regole nel service (condiviso con l'app iPhone): qui solo il passaggio dal form
// e il ritorno come ActionResult. Durante un "vedi come" la scrittura è rifiutata.
function taskInputFromForm(formData: FormData) {
  return {
    title: formData.get("title"),
    notes: formData.get("notes"),
    clientId: formData.get("clientId"),
    status: formData.get("status") ?? undefined,
    priority: formData.get("priority"),
    dueDate: formData.get("dueDate"),
    assigneeIds: formData.getAll("assigneeIds"),
  };
}

const taskActor = (user: { id: string; role: string; projectManager: boolean }) => ({
  id: user.id,
  role: user.role,
  projectManager: user.projectManager,
});

export async function createTask(formData: FormData) {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  let created;
  try {
    created = await tasksService.createTask(taskActor(user), taskInputFromForm(formData));
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/task");
  after(created.notify);
}

export async function updateTaskStatus(
  taskId: string,
  status: string
): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  try {
    await tasksService.setTaskStatus(taskActor(user), taskId, status);
  } catch (err) {
    return eventServiceError(err);
  }
  revalidatePath("/task");
}

// Modifica dal pannello della riga: tutti i campi, assegnatari compresi.
export async function updateTask(taskId: string, formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;

  let updated;
  try {
    updated = await tasksService.updateTask(taskActor(user), taskId, taskInputFromForm(formData));
  } catch (err) {
    return eventServiceError(err);
  }

  revalidatePath("/task");
  after(updated.notify);
}

export async function deleteTask(taskId: string): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return READ_ONLY_ERROR;
  // I task sono condivisi: chiunque nel team li modifica e li elimina.
  try {
    await tasksService.deleteTask(taskActor(user), taskId);
  } catch (err) {
    return eventServiceError(err);
  }
  revalidatePath("/task");
}

// Svuota l'archivio dei task (completati da più di 30 giorni): solo super admin.
// I task archiviati sono comunque eliminati dal timer di conservazione dopo un anno.
export async function emptyTaskArchive(): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  await purgeTaskArchive(user);
  revalidatePath("/task");
  return undefined;
}
