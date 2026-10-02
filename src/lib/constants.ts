// Ruoli utenza: "membro", non "dipendente", per non confondersi con
// l'employmentType (dipendente | partita_iva) che è il tipo di rapporto.
// super_admin: tutto, comprese le operazioni di sistema (aggiornamenti, SMTP).
// admin: gestisce la piattaforma come un super admin, ma non le operazioni di
// sistema e non gli account dei super admin.
export const ROLES = ["super_admin", "admin", "membro"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  membro: "Membro",
};

// Ruoli con accesso all'amministrazione della piattaforma (team, richieste,
// clienti, panoramica...).
export function isAdminRole(role: string) {
  return role === "super_admin" || role === "admin";
}

// Ruoli che un utente può assegnare: solo un super admin crea o nomina altri
// super admin.
export function assignableRoles(actorRole: string): readonly Role[] {
  return actorRole === "super_admin" ? ROLES : ROLES.filter((r) => r !== "super_admin");
}

export const EMPLOYMENT_TYPES = ["dipendente", "partita_iva"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  dipendente: "Dipendente",
  partita_iva: "Partita IVA",
};

// Monte annuale per tipo di rapporto: i dipendenti hanno ferie (giorni) e
// permessi (ore) separati, le partite IVA un unico monte di assenze (giorni).
// Dipendenti: il residuo non goduto passa all'anno dopo. Partite IVA: il
// monte si azzera ogni 1° gennaio.
export const LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE = {
  dipendente: { ferieDaysPerYear: 26, permessoHoursPerYear: 36 },
  partita_iva: { assenzeDaysPerYear: 30 },
} as const;

// Saldi rettificabili dal super admin (LeaveBalanceAdjustment.kind).
export const BALANCE_KINDS = ["ferie", "permesso", "assenze"] as const;
export type BalanceKind = (typeof BALANCE_KINDS)[number];

export function balanceKindsFor(employmentType: string): readonly BalanceKind[] {
  return employmentType === "partita_iva" ? ["assenze"] : ["ferie", "permesso"];
}

export const LEAVE_TYPES = [
  "ferie",
  "permesso",
  "recupero",
  "malattia",
  "assenza",
  "assenza_extra",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

// Tipi richiedibili per tipo di rapporto. "recupero" (riposo compensativo,
// es. dopo una trasferta) e "assenza_extra" (assenza di una partita IVA che
// non vuole scalarla dal monte) non consumano il monte annuale.
export const DIPENDENTE_LEAVE_TYPES = ["ferie", "permesso", "recupero", "malattia"] as const;
export const PARTITA_IVA_LEAVE_TYPES = ["assenza", "assenza_extra"] as const;

export function leaveTypesFor(employmentType: string): readonly LeaveType[] {
  return employmentType === "partita_iva" ? PARTITA_IVA_LEAVE_TYPES : DIPENDENTE_LEAVE_TYPES;
}

// Il recupero va motivato (es. "trasferta Milano 12/10"): senza una banca ore
// la nota è l'unica traccia del perché.
export const NOTE_REQUIRED_LEAVE_TYPES: readonly LeaveType[] = ["recupero"];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  recupero: "Recupero",
  malattia: "Malattia",
  assenza: "Assenza",
  assenza_extra: "Assenza extra",
};

// Pagina di atterraggio dopo il login: admin e super admin partono dalla
// Panoramica (vista del team), i membri dalla propria Dashboard.
export function homePathFor(role: string) {
  return isAdminRole(role) ? "/panoramica" : "/";
}

export const LEAVE_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "registrata",
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "In attesa",
  approved: "Approvata",
  rejected: "Rifiutata",
  registrata: "Registrata",
};

export const EVENT_TYPES = ["riunione", "shooting", "altro"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  riunione: "Riunione di team",
  shooting: "Shooting",
  altro: "Altro",
};

export const PRESENCE_SLOTS = [
  "mattina",
  "pomeriggio",
  "giornata_intera",
] as const;
export type PresenceSlot = (typeof PRESENCE_SLOTS)[number];

export const PRESENCE_SLOT_LABELS: Record<PresenceSlot, string> = {
  mattina: "Mattina",
  pomeriggio: "Pomeriggio",
  giornata_intera: "Full",
};

export const PRESENCE_MODES = ["ufficio", "smartworking"] as const;
export type PresenceMode = (typeof PRESENCE_MODES)[number];

export const PRESENCE_MODE_LABELS: Record<PresenceMode, string> = {
  ufficio: "In ufficio",
  smartworking: "Smartworking",
};

export const TASK_STATUSES = [
  "not_started",
  "in_progress",
  "in_pausa",
  "done",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: "Da iniziare",
  in_progress: "In corso",
  in_pausa: "In pausa",
  done: "Completato",
};

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
};

// I task "done" vengono eliminati questi giorni dopo il completamento
export const TASK_DONE_RETENTION_DAYS = 30;

// --- Clienti ---

// Categorie di servizio del cliente, combinabili (un cliente può essere
// "incrociato").
export const CLIENT_CATEGORIES = [
  "comunicazione",
  "it_design",
  "produzione",
] as const;
export type ClientCategory = (typeof CLIENT_CATEGORIES)[number];

export const CLIENT_CATEGORY_LABELS: Record<ClientCategory, string> = {
  comunicazione: "Comunicazione",
  it_design: "IT & Design",
  produzione: "Produzione",
};

// Le categorie viaggiano in DB come CSV (SQLite non ha array).
export function parseClientCategories(csv: string): ClientCategory[] {
  return csv
    ? (csv
        .split(",")
        .filter((c) =>
          CLIENT_CATEGORIES.includes(c as ClientCategory)
        ) as ClientCategory[])
    : [];
}

// --- Email ---

// Cifratura della connessione SMTP: STARTTLS (di solito porta 587), TLS
// implicito (465) o nessuna (solo server interni fidati).
export const EMAIL_SECURITY = ["starttls", "tls", "none"] as const;
export type EmailSecurity = (typeof EMAIL_SECURITY)[number];

export const EMAIL_SECURITY_LABELS: Record<EmailSecurity, string> = {
  starttls: "STARTTLS (porta 587)",
  tls: "TLS (porta 465)",
  none: "Nessuna",
};
