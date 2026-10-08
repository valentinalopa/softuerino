"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { TONE_TEXT } from "@/lib/tones";
import { cn } from "@/lib/utils";
import {
  CAPABILITIES,
  CAPABILITY_KEYS,
  PERMISSION_ROLE_LABELS,
  scopeLabel,
  type PermissionRole,
  type Rules,
} from "@/lib/permission-rules";

// Griglia dei permessi: per ogni permesso e ruolo, fin dove arriva (No / Il
// suo reparto / Tutti). Usata per le impostazioni generali (per ruolo) e per i
// reparti personalizzati. Con `departmentMode` si sceglie tra impostazioni
// generali (`general`, sola lettura) e personalizzate.
export function PermissionMatrix({
  rules,
  general,
  roles,
  onSave,
  departmentMode,
}: {
  rules: Rules;
  general?: Rules;
  roles: readonly PermissionRole[];
  onSave: (formData: FormData) => Promise<{ error: string } | undefined>;
  departmentMode?: "general" | "custom";
}) {
  const [mode, setMode] = useState(departmentMode);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  const readOnly = mode === "general";
  const shown = readOnly && general ? general : rules;

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    setPending(true);
    try {
      const result = await onSave(formData);
      setMessage(result?.error ? { kind: "error", text: result.error } : { kind: "success", text: "Salvato." });
    } catch {
      setMessage({ kind: "error", text: "Errore imprevisto" });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-4">
      {departmentMode && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Permessi del reparto">
          {(["general", "custom"] as const).map((m) => (
            <label
              key={m}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
                mode === m ? "border-primary-border bg-primary-soft" : "border-border"
              )}
            >
              <input
                type="radio"
                name="mode"
                value={m}
                checked={mode === m}
                onChange={() => {
                  setMode(m);
                  setMessage(null);
                }}
                className="accent-primary"
              />
              {m === "general" ? "Usa le impostazioni generali" : "Personalizza per questo reparto"}
            </label>
          ))}
        </div>
      )}

      <div className="divide-y divide-border rounded-xl border border-border">
        {CAPABILITY_KEYS.map((cap) => (
          <div key={cap} className="grid grid-cols-1 gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">{CAPABILITIES[cap].label}</p>
              <p className="text-xs text-muted-foreground">{CAPABILITIES[cap].hint}</p>
            </div>
            <div className={cn("grid gap-2", roles.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
              {roles.map((role) => {
                const options = CAPABILITIES[cap].options[role];
                const value = shown[cap][role];
                return (
                  <label key={role} className="flex min-w-0 flex-col gap-1 md:w-36">
                    <span className="text-xs text-muted-foreground">{PERMISSION_ROLE_LABELS[role]}</span>
                    {options.length === 1 || readOnly ? (
                      <span className="flex h-9 items-center rounded-lg bg-muted px-2.5 text-sm text-muted-foreground">
                        {scopeLabel(cap, value)}
                      </span>
                    ) : (
                      <select
                        name={`rule:${cap}:${role}`}
                        defaultValue={value}
                        onChange={() => setMessage(null)}
                        className="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm text-foreground"
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {scopeLabel(cap, o)}
                          </option>
                        ))}
                      </select>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Salvataggio..." : "Salva"}
        </Button>
        {message && (
          <span className={`text-sm ${message.kind === "error" ? "text-destructive" : TONE_TEXT.success}`}>
            {message.text}
          </span>
        )}
      </div>
    </form>
  );
}
