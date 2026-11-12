"use client";

import { useState, useTransition } from "react";
import { applySaldiImport, previewSaldiImport } from "@/lib/actions";
import type { ImportReport } from "@/lib/import-saldi";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Carica il file, mostra cosa cambierebbe e solo dopo la conferma lo applica.
export function ImportPanel() {
  const [text, setText] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [applied, setApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function choose(file: File | undefined) {
    setReport(null);
    setApplied(false);
    setError(null);
    if (!file) return;
    const content = await file.text();
    setText(content);
    setFileName(file.name);
    startTransition(async () => {
      try {
        const result = await previewSaldiImport(content);
        if ("error" in result) setError(result.error);
        else setReport(result.report);
      } catch (err) {
        setError(unexpectedErrorMessage(err));
      }
    });
  }

  function apply() {
    if (!text) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await applySaldiImport(text);
        if ("error" in result) {
          setError(result.error);
          return;
        }
        setReport(result.report);
        setApplied(true);
        toast("Import completato");
      } catch (err) {
        setError(unexpectedErrorMessage(err));
      }
    });
  }

  const toCreate = report
    ? report.closures.filter((c) => c.action === "crea").length +
      report.people.reduce((sum, p) => sum + p.created.length, 0)
    : 0;
  const settings = report ? report.people.filter((p) => p.payslip || p.adjustment).length : 0;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>File da importare</CardTitle>
          <CardDescription>
            Prima vedi cosa cambierebbe; niente viene salvato finché non premi &quot;Applica&quot;. Si può
            caricare lo stesso file più volte: quello che c&apos;è già non si duplica.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <input
            type="file"
            accept=".json,application/json"
            disabled={pending}
            onChange={(e) => choose(e.target.files?.[0])}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-surface-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:font-medium"
          />
          {pending && <p className="text-sm text-muted-foreground">Un momento…</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {report && (
        <Card>
          <CardHeader>
            <CardTitle>{applied ? "Importato" : "Anteprima"}</CardTitle>
            <CardDescription>
              {fileName}: {toCreate} da aggiungere, {settings} saldi da impostare
              {applied ? " — fatto." : "."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            {report.warnings.length > 0 && (
              <ul className="space-y-1 text-destructive">
                {report.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}

            {report.closures.length > 0 && (
              <section className="space-y-1">
                <h3 className="font-medium text-foreground">Chiusure aziendali</h3>
                <ul className="space-y-0.5">
                  {report.closures.map((c) => (
                    <li key={c.label} className={c.action === "salta" ? "text-muted-foreground" : undefined}>
                      {c.action === "crea" ? "＋ " : "– "}
                      {c.label}
                      {c.reason ? ` (${c.reason})` : ""}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {report.people
              .filter((p) => p.found)
              .map((p) => (
                <section key={p.name} className="space-y-1 border-t border-border-subtle pt-4">
                  <h3 className="font-medium text-foreground">{p.name}</h3>
                  {p.payslip && <p>{p.payslip}</p>}
                  {p.adjustment && <p>{p.adjustment}</p>}
                  {p.created.length > 0 && (
                    <ul className="space-y-0.5">
                      {p.created.map((r, i) => (
                        <li key={`${r.label}-${i}`}>＋ {r.label}</li>
                      ))}
                    </ul>
                  )}
                  {p.skipped.length > 0 && (
                    <details className="text-muted-foreground">
                      <summary className="cursor-pointer">{p.skipped.length} già presenti o saltate</summary>
                      <ul className="mt-1 space-y-0.5">
                        {p.skipped.map((r, i) => (
                          <li key={`${r.label}-${i}`}>
                            – {r.label} ({r.reason})
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </section>
              ))}

            {!applied && (
              <div className="flex justify-end border-t border-border-subtle pt-4">
                <Button onClick={apply} disabled={pending || (toCreate === 0 && settings === 0)}>
                  Applica
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
