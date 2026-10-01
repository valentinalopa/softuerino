"use server";

import { requireSuperAdmin } from "@/lib/auth/session";
import {
  getUpdateStatusResponse,
  hasPendingRequest,
  writeUpdateRequest,
} from "@/lib/system/update";

type ActionResult = { error: string } | undefined;

const NOT_CONFIGURED = {
  error: "L'aggiornamento dal web non è configurato su questo server",
};

// Solo super admin. Le azioni scrivono una richiesta per il runner di sistema:
// l'esito si legge poi dallo stato (vedi /api/system/update-status).

export async function requestUpdateCheck(): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const { configured, status } = await getUpdateStatusResponse();
  if (!configured) return NOT_CONFIGURED;
  if (status?.run.state === "running" || status?.run.state === "queued") {
    return { error: "C'è un aggiornamento in corso" };
  }
  await writeUpdateRequest("check", user.email);
}

export async function requestUpdate(): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const { configured, status } = await getUpdateStatusResponse();
  if (!configured) return NOT_CONFIGURED;
  if (!status) {
    return { error: "Controlla prima se ci sono aggiornamenti" };
  }
  if (status.run.state === "running" || status.run.state === "queued") {
    return { error: "C'è già un aggiornamento in corso" };
  }
  if (await hasPendingRequest("check")) {
    return { error: "Controllo degli aggiornamenti in corso, riprova tra poco" };
  }
  if (status.pending.length === 0) {
    return { error: "Nessun aggiornamento disponibile" };
  }
  // Nuove variabili d'ambiente possibili: va fatto a mano via SSH, dove
  // softuerino-aggiorna mostra le differenze e chiede conferma.
  if (status.envExampleChanged) {
    return {
      error:
        "Questo aggiornamento cambia .env.example: va fatto via SSH con sudo softuerino-aggiorna",
    };
  }
  await writeUpdateRequest("update", user.email);
}
