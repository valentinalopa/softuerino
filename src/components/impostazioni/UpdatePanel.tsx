"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { CheckCircle2, CircleDashed, Loader2, RefreshCw, XCircle } from "lucide-react";
import { requestUpdate, requestUpdateCheck } from "@/lib/system/actions";
import {
  UPDATE_RUN_STATE_LABELS,
  UPDATE_STEPS,
  type UpdateRun,
  type UpdateStatusResponse,
} from "@/lib/system/update-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TONE_TEXT } from "@/lib/tones";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const POLL_MS = 3000;

function formatDateTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const short = (sha: string | null) => (sha ? sha.slice(0, 7) : "—");

function runVariant(state: UpdateRun["state"]) {
  if (state === "success" || state === "up_to_date") return "success" as const;
  if (state === "failed" || state === "blocked") return "danger" as const;
  if (state === "running" || state === "queued") return "warning" as const;
  return "neutral" as const;
}

export function UpdatePanel({ initial }: { initial: UpdateStatusResponse }) {
  const [data, setData] = useState(initial);
  // L'app si riavvia durante l'aggiornamento: finché non risponde lo si dice.
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Versione con cui è stata aperta la pagina: se cambia, va ricaricata.
  const [loadedSha] = useState(initial.status?.current?.sha ?? null);
  const checkStartedAt = useRef<string | null>(null);

  const status = data.status;
  const run = status?.run;
  const busy = run?.state === "running" || run?.state === "queued";

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/system/update-status", { cache: "no-store" });
      // Durante il riavvio Nginx risponde con la pagina di manutenzione (HTML).
      if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
        setOffline(true);
        return;
      }
      const next = (await res.json()) as UpdateStatusResponse;
      setOffline(false);
      setData(next);
      if (checkStartedAt.current !== null && next.status?.checkedAt !== checkStartedAt.current) {
        checkStartedAt.current = null;
        setChecking(false);
      }
    } catch {
      setOffline(true);
    }
  }, []);

  useEffect(() => {
    if (!busy && !checking && !offline) return;
    const id = setInterval(refresh, POLL_MS);
    return () => clearInterval(id);
  }, [busy, checking, offline, refresh]);

  function handleCheck() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestUpdateCheck();
        if (result?.error) {
          setError(result.error);
          return;
        }
        checkStartedAt.current = status?.checkedAt ?? "";
        setChecking(true);
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  function handleUpdate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await requestUpdate();
        if (result?.error) {
          setError(result.error);
          return;
        }
        setConfirmOpen(false);
        await refresh();
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  if (!data.configured) {
    return (
      <Card>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            L&apos;aggiornamento dal web non è configurato su questo server. Si può comunque
            aggiornare via SSH con <code>sudo softuerino-aggiorna</code>.
          </p>
        </CardContent>
      </Card>
    );
  }

  const updatedSinceLoad =
    run?.state === "success" && run.to !== null && run.to !== loadedSha;
  const currentStepIndex = UPDATE_STEPS.findIndex((s) => s.key === run?.step);
  const canUpdate =
    !busy && !checking && !offline && (status?.pending.length ?? 0) > 0 && !status?.envExampleChanged;

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {offline && (
        <p className="text-sm text-muted-foreground">
          L&apos;app si sta riavviando: la pagina riprende da sola appena torna disponibile.
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Versione installata</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {status?.current ? (
            <div className="text-sm">
              <p>
                <code className="font-semibold">{short(status.current.sha)}</code>{" "}
                {status.current.subject}
              </p>
              <p className="text-muted-foreground">{formatDateTime(status.current.date)}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Non ancora rilevata.</p>
          )}
          <p className="text-xs text-muted-foreground">
            Ultimo controllo: {formatDateTime(status?.checkedAt ?? null)}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleCheck}
              disabled={pending || checking || busy || offline}
            >
              {checking ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {checking ? "Controllo in corso..." : "Controlla aggiornamenti"}
            </Button>
            {updatedSinceLoad && (
              <Button type="button" onClick={() => window.location.reload()}>
                Ricarica la pagina
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {status && status.pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aggiornamento disponibile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-1.5 text-sm">
              {status.pending.map((c) => (
                <li key={c.sha}>
                  <code className="font-semibold">{short(c.sha)}</code> {c.subject}
                  <span className="text-muted-foreground">
                    {" "}
                    · {c.author}, {formatDateTime(c.date)}
                  </span>
                </li>
              ))}
            </ul>
            {status.newMigrations > 0 && (
              <p className="text-sm">
                Include {status.newMigrations}{" "}
                {status.newMigrations === 1 ? "migrazione" : "migrazioni"} del database.
              </p>
            )}
            {status.envExampleChanged ? (
              <p className="text-sm text-destructive">
                Questo aggiornamento cambia <code>.env.example</code> (possibili nuove variabili
                d&apos;ambiente): va fatto via SSH con <code>sudo softuerino-aggiorna</code>.
              </p>
            ) : (
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger render={<Button type="button" disabled={!canUpdate || pending} />}>
                  Aggiorna ora
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Aggiornare Softuerino?</AlertDialogTitle>
                    <AlertDialogDescription>
                      L&apos;app resterà non disponibile per qualche minuto, per tutti. Prima viene
                      fatto un backup del database; se qualcosa va storto si torna in automatico
                      alla versione attuale.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction type="button" disabled={pending} onClick={handleUpdate}>
                      Aggiorna ora
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </CardContent>
        </Card>
      )}

      {status && status.pending.length === 0 && status.checkedAt && !busy && (
        <p className="text-sm text-muted-foreground">Softuerino è aggiornato.</p>
      )}

      {run && run.state !== "idle" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Ultimo aggiornamento
              <Badge variant={runVariant(run.state)}>{UPDATE_RUN_STATE_LABELS[run.state]}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Avviato {formatDateTime(run.startedAt)}
              {run.requestedBy ? ` da ${run.requestedBy}` : ""}
              {run.finishedAt ? `, terminato ${formatDateTime(run.finishedAt)}` : ""}
              {run.from && run.to ? ` · ${short(run.from)} → ${short(run.to)}` : ""}
            </p>
            {run.message && <p className="text-sm">{run.message}</p>}
            {run.state === "running" && (
              <ol className="space-y-1 text-sm">
                {UPDATE_STEPS.map((step, index) => (
                  <li key={step.key} className="flex items-center gap-2">
                    {index < currentStepIndex ? (
                      <CheckCircle2 className={`size-4 ${TONE_TEXT.success}`} />
                    ) : index === currentStepIndex ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <CircleDashed className="size-4 text-muted-foreground" />
                    )}
                    {step.label}
                  </li>
                ))}
              </ol>
            )}
            {run.state === "failed" && <XCircle className="size-5 text-destructive" />}
            {run.backup && (
              <p className="text-xs text-muted-foreground">
                Backup: <code>{run.backup}</code>
              </p>
            )}
            {data.log.length > 0 && (
              <details open={run.state === "running" || run.state === "failed"}>
                <summary className="cursor-pointer text-sm text-muted-foreground">Log</summary>
                <pre className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {data.log.join("\n")}
                </pre>
              </details>
            )}
          </CardContent>
        </Card>
      )}

      {status && status.history.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Storico</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {status.history.map((h, i) => (
                <li key={`${h.startedAt}-${i}`} className="flex flex-wrap items-center gap-2">
                  <Badge variant={runVariant(h.state)}>{UPDATE_RUN_STATE_LABELS[h.state]}</Badge>
                  <span>{formatDateTime(h.startedAt)}</span>
                  {h.from && h.to && (
                    <code className="text-xs">
                      {short(h.from)} → {short(h.to)}
                    </code>
                  )}
                  {h.requestedBy && (
                    <span className="text-muted-foreground">{h.requestedBy}</span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
