// Ruoli utenza: "membro", non "dipendente", per non confondersi con
// l'employmentType (dipendente | partita_iva) che è il tipo di rapporto.
export const ROLES = ["super_admin", "membro"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  membro: "Membro",
};

export const EMPLOYMENT_TYPES = ["dipendente", "partita_iva"] as const;
export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  dipendente: "Dipendente",
  partita_iva: "Partita IVA",
};

// Monte annuale per tipo di rapporto: i dipendenti hanno ferie (giorni) e
// permessi (ore) separati, le partite IVA un unico monte di assenze (giorni).
export const LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE = {
  dipendente: { ferieDaysPerYear: 26, permessoHoursPerYear: 88 },
  partita_iva: { assenzeDaysPerYear: 30 },
} as const;

export const LEAVE_TYPES = ["ferie", "permesso", "malattia", "assenza"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

// Tipi richiedibili dai dipendenti; le partite IVA usano solo "assenza".
export const DIPENDENTE_LEAVE_TYPES = ["ferie", "permesso", "malattia"] as const;

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  malattia: "Malattia",
  assenza: "Assenza",
};

// Pagina di atterraggio dopo il login: il super admin parte dalla Panoramica
// (vista del team), gli altri dalla propria Dashboard.
export function homePathFor(role: string) {
  return role === "super_admin" ? "/panoramica" : "/";
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
  not_started: "Not started",
  in_progress: "In progress",
  in_pausa: "In pausa",
  done: "Done",
};

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
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
