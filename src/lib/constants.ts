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

// Saldi per tipo di rapporto.
// - Dipendenti: ferie e permessi (ROL) in ore, come nella busta paga. Ogni
//   persona ha le sue quote (part-time, anzianità): il super admin le copia
//   dalla busta insieme al residuo (LeaveBalanceStart). Maturano 1/12 a fine
//   mese; il residuo, anche negativo, passa all'anno dopo.
// - Partite IVA: un monte di assenze in giorni, tutto disponibile dal 1°
//   gennaio, che si azzera ogni anno.
// Il saldo può andare in negativo (nessun blocco sulle richieste): l'app lo
// segnala.
export const PARTITA_IVA_ASSENZE_DAYS_PER_YEAR = 26;

// Ore di una giornata di lavoro se non impostate (siamo tutti part-time).
export const DEFAULT_DAILY_HOURS = 4;

// Tipi di saldo: ferie e permesso (ore) per i dipendenti, assenze (giorni)
// per le partite IVA.
export const BALANCE_KINDS = ["ferie", "permesso", "assenze"] as const;
export type BalanceKind = (typeof BALANCE_KINDS)[number];

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
  "permesso_104",
  "chiusura",
] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

// Tipi richiedibili per tipo di rapporto. "recupero" (riposo compensativo per
// lavoro in più, es. una trasferta) vale per tutti; "assenza_extra" (giorno
// fuori monte di una partita IVA, senza lavoro da compensare) solo per le
// partite IVA. Nessuno dei due consuma il monte annuale. "chiusura" non si
// richiede: nasce da una chiusura aziendale inserita da un admin.
// "permesso_104" (legge 104) solo per i dipendenti: non scala ferie né ROL.
export const DIPENDENTE_LEAVE_TYPES = [
  "ferie",
  "permesso",
  "recupero",
  "permesso_104",
  "malattia",
] as const;
export const PARTITA_IVA_LEAVE_TYPES = ["assenza", "recupero", "assenza_extra"] as const;

// Tipi che toccano la salute (GDPR art. 9): li vedono solo l'interessato e
// gli admin, agli altri arrivano come una generica "assenza".
export const SENSITIVE_LEAVE_TYPES: readonly string[] = ["malattia", "permesso_104"];

export function isSensitiveLeave(type: string) {
  return SENSITIVE_LEAVE_TYPES.includes(type);
}

export function leaveTypesFor(employmentType: string): readonly LeaveType[] {
  return employmentType === "partita_iva" ? PARTITA_IVA_LEAVE_TYPES : DIPENDENTE_LEAVE_TYPES;
}

// A ore = un solo giorno con una fascia oraria: il permesso sempre; recupero,
// assenza (partite IVA) e permesso 104 quando si sceglie "A ore".
export const OPTIONAL_HOURLY_LEAVE_TYPES: readonly LeaveType[] = [
  "recupero",
  "assenza",
  "permesso_104",
];

export function isHourlyLeave(request: { type: string; hours: number | null }) {
  return (
    request.type === "permesso" ||
    (OPTIONAL_HOURLY_LEAVE_TYPES.includes(request.type as LeaveType) && request.hours !== null)
  );
}

// Il recupero va motivato (es. "trasferta Milano 12/10"): senza una banca ore
// la nota è l'unica traccia del perché.
export const NOTE_REQUIRED_LEAVE_TYPES: readonly LeaveType[] = ["recupero"];

// Spiegazione sotto il tipo nel form di richiesta, dove serve distinguere.
export const LEAVE_TYPE_HINTS: Partial<Record<LeaveType, string>> = {
  recupero:
    "Compensa ore lavorate in più, prima (es. una trasferta) o dopo (manchi e recuperi): non scala dal monte annuale.",
  assenza_extra: "Giorno fuori monte, senza lavoro da compensare: non scala dal monte annuale.",
  permesso_104: "Permesso della legge 104: non scala ferie né ROL. Lo vedono solo gli admin.",
};

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  recupero: "Recupero",
  malattia: "Malattia",
  assenza: "Assenza",
  assenza_extra: "Assenza extra",
  permesso_104: "Permesso 104",
  chiusura: "Chiusura aziendale",
};

// Pagina di atterraggio dopo il login: Oggi per tutti. Le cose da fare del
// team (richieste da approvare) sono lì anche per gli admin; i grafici in
// Report.
export const HOME_PATH = "/";

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

export const EVENT_TYPES = ["riunione", "riunione_cliente", "shooting", "trasferta", "altro"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  riunione: "Riunione di team",
  riunione_cliente: "Riunione cliente",
  shooting: "Shooting",
  trasferta: "Evento con trasferta",
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

// Task "done": dopo TASK_ARCHIVE_AFTER_DAYS dal completamento finiscono in
// archivio (visibile a responsabili, project manager, admin); dopo
// TASK_DELETE_AFTER_DAYS li elimina il timer di conservazione (retention.ts).
export const TASK_ARCHIVE_AFTER_DAYS = 30;
export const TASK_DELETE_AFTER_DAYS = 365;

// Ruolo del client Keycloak "softuerino" per i project manager: vedono
// l'archivio dei task di tutti. Arriva nel claim multivalore SOFTUERINO_ROLES_CLAIM
// (ID token); il flag finisce in User.projectManager.
export const PROJECT_MANAGER_ROLE = "project-manager";
export const SOFTUERINO_ROLES_CLAIM = "softuerino_roles";

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
