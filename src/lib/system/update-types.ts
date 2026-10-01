// Stato degli aggiornamenti scritto dal runner di sistema (root) in
// status.json e letto dall'app. Condiviso tra server e client.

export type UpdateCommit = {
  sha: string;
  subject: string;
  author: string;
  date: string;
};

export type UpdateRunState =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "up_to_date"
  | "blocked"
  | "failed";

export type UpdateRun = {
  state: UpdateRunState;
  step: string | null;
  requestedBy: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  from: string | null;
  to: string | null;
  backup: string | null;
  message: string | null;
};

export type UpdateStatus = {
  current: UpdateCommit | null;
  remoteSha: string | null;
  pending: UpdateCommit[];
  envExampleChanged: boolean;
  newMigrations: number;
  checkedAt: string | null;
  run: UpdateRun;
  history: UpdateRun[];
};

export type UpdateStatusResponse = {
  configured: boolean;
  status: UpdateStatus | null;
  log: string[];
};

// Passi di softuerino-aggiorna, nell'ordine in cui avvengono.
export const UPDATE_STEPS = [
  { key: "backup", label: "Backup del database" },
  { key: "stop", label: "Arresto dell'app" },
  { key: "pull", label: "Download del codice" },
  { key: "install", label: "Installazione dipendenze" },
  { key: "migrate", label: "Migrazioni del database" },
  { key: "build", label: "Compilazione" },
  { key: "start", label: "Riavvio dell'app" },
  { key: "verify", label: "Verifica" },
] as const;

export const UPDATE_RUN_STATE_LABELS: Record<UpdateRunState, string> = {
  idle: "Nessun aggiornamento in corso",
  queued: "In coda",
  running: "In corso",
  success: "Completato",
  up_to_date: "Già aggiornato",
  blocked: "Bloccato: serve l'intervento via SSH",
  failed: "Fallito: ripristinata la versione precedente",
};
