// Ruoli utenza: "membro", non "dipendente", per non confondersi con
// l'employmentType (dipendente | partita_iva) che è il tipo di rapporto.
// super_admin: tutto, comprese le operazioni di sistema (aggiornamenti, SMTP).
// admin: gestisce la piattaforma come un super admin, ma non le operazioni di
// sistema e non gli account dei super admin.
// "Manager di un reparto" non è un ruolo di Softuerino: è un incarico
// dell'organigramma gestito in Keycloak (claim manager_of), vedi departments.ts.
export const ROLES = ["super_admin", "admin", "membro"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  super_admin: "Super Admin",
  admin: "Admin",
  membro: "Membro",
};

// Ruoli che admin e super admin possono "vedere come" (in sola lettura).
export const IMPERSONATABLE_ROLES: readonly string[] = ["membro"];

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
// monte si azzera ogni 1° gennaio. Il saldo può andare in negativo (nessun
// blocco sulle richieste): l'app lo segnala.
export const LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE = {
  dipendente: { ferieDaysPerYear: 26, permessoHoursPerYear: 36 },
  partita_iva: { assenzeDaysPerYear: 26 },
} as const;

// Saldi rettificabili dal super admin (LeaveBalanceAdjustment.kind).
export const BALANCE_KINDS = ["ferie", "permesso", "assenze"] as const;
export type BalanceKind = (typeof BALANCE_KINDS)[number];

// Monte annuale di un saldo: è il riferimento mostrato accanto al residuo
// ("5 / 26 giorni"). Non il disponibile (monte + riporto o rettifica), che
// dopo una rettifica coincide col residuo e non dice nulla.
export function annualAllowance(kind: BalanceKind): number {
  const { dipendente, partita_iva } = LEAVE_ALLOWANCE_BY_EMPLOYMENT_TYPE;
  if (kind === "ferie") return dipendente.ferieDaysPerYear;
  if (kind === "permesso") return dipendente.permessoHoursPerYear;
  return partita_iva.assenzeDaysPerYear;
}

// Recuperi da fare (es. dopo una trasferta): si misurano a giorni o a ore,
// come la richiesta di recupero che li smaltisce.
export const RECOVERY_UNITS = ["giorni", "ore"] as const;
export type RecoveryUnit = (typeof RECOVERY_UNITS)[number];

export const RECOVERY_STATUSES = ["da_fare", "in_parte", "fatto"] as const;
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number];

export const RECOVERY_STATUS_LABELS: Record<RecoveryStatus, string> = {
  da_fare: "Da fare",
  in_parte: "In parte",
  fatto: "Fatto",
};

// Il super admin può forzare solo questi due: "in parte" viene dalle richieste.
export const RECOVERY_STATUS_OVERRIDES = ["da_fare", "fatto"] as const;

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

// Tipi richiedibili per tipo di rapporto. "recupero" (riposo compensativo per
// lavoro in più, es. una trasferta) vale per tutti; "assenza_extra" (giorno
// fuori monte di una partita IVA, senza lavoro da compensare) solo per le
// partite IVA. Nessuno dei due consuma il monte annuale.
export const DIPENDENTE_LEAVE_TYPES = ["ferie", "permesso", "recupero", "malattia"] as const;
export const PARTITA_IVA_LEAVE_TYPES = ["assenza", "recupero", "assenza_extra"] as const;

export function leaveTypesFor(employmentType: string): readonly LeaveType[] {
  return employmentType === "partita_iva" ? PARTITA_IVA_LEAVE_TYPES : DIPENDENTE_LEAVE_TYPES;
}

// Il recupero va motivato (es. "trasferta Milano 12/10"): senza una banca ore
// la nota è l'unica traccia del perché.
export const NOTE_REQUIRED_LEAVE_TYPES: readonly LeaveType[] = ["recupero"];

// Spiegazione sotto il tipo nel form di richiesta, dove serve distinguere.
export const LEAVE_TYPE_HINTS: Partial<Record<LeaveType, string>> = {
  recupero: "Compensa lavoro in più (es. una trasferta): non scala dal monte annuale.",
  assenza_extra: "Giorno fuori monte, senza lavoro da compensare: non scala dal monte annuale.",
};

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

// --- Licenze e abbonamenti ---

export const LICENSE_KINDS = ["licenza", "abbonamento"] as const;
export type LicenseKind = (typeof LICENSE_KINDS)[number];

export const LICENSE_KIND_LABELS: Record<LicenseKind, string> = {
  licenza: "Licenza",
  abbonamento: "Abbonamento",
};

export const LICENSE_REMINDER_DAYS_DEFAULT = 7;

// Cosa possono fare i responsabili di reparto (incarico da Keycloak), reparto
// per reparto: lo decidono i super admin in Amministrazione → Ruoli e
// permessi. Valgono solo per le persone del reparto che guidano.
export const MANAGER_CAPS = ["licenze", "presenze_ore", "richieste", "approvare", "nuovi_membri"] as const;
export type ManagerCap = (typeof MANAGER_CAPS)[number];
export const DEFAULT_MANAGER_CAPS: readonly ManagerCap[] = ["licenze", "presenze_ore"];
export const MANAGER_CAP_LABELS: Record<ManagerCap, { label: string; hint: string }> = {
  licenze: { label: "Licenze e abbonamenti", hint: "Vede e gestisce le licenze del reparto." },
  presenze_ore: { label: "Presenze e ore", hint: "Vede presenze in ufficio e log ore delle persone del reparto." },
  richieste: { label: "Richieste e saldi", hint: "Vede richieste, assenze e saldi delle persone del reparto." },
  approvare: { label: "Approvare le richieste", hint: "Approva o rifiuta le richieste del reparto (le vede anche)." },
  nuovi_membri: { label: "Creare nuovi membri", hint: "Aggiunge persone con ruolo Membro." },
};

export function parseManagerCaps(csv: string): ManagerCap[] {
  return csv
    .split(",")
    .map((c) => c.trim())
    .filter((c): c is ManagerCap => (MANAGER_CAPS as readonly string[]).includes(c));
}
