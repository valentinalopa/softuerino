import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type {
  UpdateCommit,
  UpdateRun,
  UpdateRunState,
  UpdateStatus,
} from "@/lib/system/update-types";

// Aggiornamento dal frontend, separazione dei privilegi:
// - l'app (isolata, senza sudo) può solo creare un file di richiesta, "check"
//   o "update", in UPDATE_REQUEST_DIR. Il contenuto è solo l'email di chi lo
//   chiede, a scopo di storico: nessun comando, branch o argomento.
// - un servizio systemd di root (softuerino-update-runner) vede il file, lo
//   cancella, esegue l'operazione fissa corrispondente e scrive l'esito in
//   UPDATE_STATUS_DIR, una cartella di root che l'app può solo leggere.
// Senza le due cartelle (es. in sviluppo) la funzione risulta non configurata.
// I percorsi sono cartelle di sistema fuori dal progetto: turbopackIgnore evita
// che il bundler provi a tracciarli includendo tutto il progetto.

const REQUEST_DIR =
  process.env.SOFTUERINO_UPDATE_REQUEST_DIR || "/var/lib/softuerino/update-requests";
const STATUS_DIR =
  process.env.SOFTUERINO_UPDATE_STATUS_DIR || "/var/lib/softuerino-update";

export type UpdateRequestKind = "check" | "update";

const REQUEST_FILES: Record<UpdateRequestKind, string> = {
  check: path.join(REQUEST_DIR, "check"),
  update: path.join(REQUEST_DIR, "update"),
};

export async function isUpdateConfigured() {
  try {
    const [requests, status] = await Promise.all([
      fs.stat(/*turbopackIgnore: true*/ REQUEST_DIR),
      fs.stat(/*turbopackIgnore: true*/ STATUS_DIR),
    ]);
    return requests.isDirectory() && status.isDirectory();
  } catch {
    return false;
  }
}

export async function writeUpdateRequest(kind: UpdateRequestKind, requestedBy: string) {
  // "w": se una richiesta uguale è già in attesa la si sovrascrive, non se ne
  // accodano due.
  await fs.writeFile(/*turbopackIgnore: true*/ REQUEST_FILES[kind], `${requestedBy}\n`, {
    mode: 0o640,
  });
}

export async function hasPendingRequest(kind: UpdateRequestKind) {
  try {
    await fs.access(/*turbopackIgnore: true*/ REQUEST_FILES[kind]);
    return true;
  } catch {
    return false;
  }
}

// --- Lettura difensiva di status.json (lo scrive un altro processo) ---

const RUN_STATES: readonly UpdateRunState[] = [
  "idle",
  "queued",
  "running",
  "success",
  "up_to_date",
  "blocked",
  "failed",
];

function str(value: unknown, max = 500): string | null {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function commit(value: unknown): UpdateCommit | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const sha = str(c.sha, 64);
  if (!sha) return null;
  return {
    sha,
    subject: str(c.subject) ?? "",
    author: str(c.author, 200) ?? "",
    date: str(c.date, 64) ?? "",
  };
}

function run(value: unknown): UpdateRun {
  const r = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const state = RUN_STATES.includes(r.state as UpdateRunState)
    ? (r.state as UpdateRunState)
    : "idle";
  return {
    state,
    step: str(r.step, 32),
    requestedBy: str(r.requestedBy, 200),
    startedAt: str(r.startedAt, 64),
    finishedAt: str(r.finishedAt, 64),
    from: str(r.from, 64),
    to: str(r.to, 64),
    backup: str(r.backup, 300),
    message: str(r.message, 1000),
  };
}

export async function readUpdateStatus(): Promise<UpdateStatus | null> {
  let raw: string;
  try {
    raw = await fs.readFile(/*turbopackIgnore: true*/ path.join(STATUS_DIR, "status.json"), "utf8");
  } catch {
    return null;
  }
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  return {
    current: commit(data.current),
    remoteSha: str(data.remoteSha, 64),
    pending: Array.isArray(data.pending)
      ? data.pending.slice(0, 100).map(commit).filter((c): c is UpdateCommit => c !== null)
      : [],
    envExampleChanged: data.envExampleChanged === true,
    newMigrations: typeof data.newMigrations === "number" ? data.newMigrations : 0,
    checkedAt: str(data.checkedAt, 64),
    run: run(data.run),
    history: Array.isArray(data.history) ? data.history.slice(0, 20).map(run) : [],
  };
}

// Ultime righe del log dell'ultimo aggiornamento.
export async function readUpdateLog(lines = 60) {
  try {
    const raw = await fs.readFile(/*turbopackIgnore: true*/ path.join(STATUS_DIR, "update.log"), "utf8");
    return raw.split("\n").filter(Boolean).slice(-lines).map((line) => line.slice(0, 500));
  } catch {
    return [];
  }
}

// Stato completo per la pagina e per il polling. Una richiesta di
// aggiornamento già scritta ma non ancora presa dal runner risulta "in coda".
export async function getUpdateStatusResponse() {
  const configured = await isUpdateConfigured();
  if (!configured) {
    return { configured, status: null, log: [] };
  }
  const [status, log, updateQueued] = await Promise.all([
    readUpdateStatus(),
    readUpdateLog(),
    hasPendingRequest("update"),
  ]);
  if (status && updateQueued && status.run.state !== "running") {
    status.run = { ...status.run, state: "queued", step: null };
  }
  return { configured, status, log };
}
