"use client";

import { useState } from "react";
import { updateDepartmentPermissions } from "@/lib/roles/actions";
import { MANAGER_CAPS, MANAGER_CAP_LABELS, type ManagerCap } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { TONE_TEXT } from "@/lib/tones";

// Interruttori dei permessi dei responsabili di un reparto.
export function DepartmentPermissionsForm({ departmentId, caps }: { departmentId: string; caps: ManagerCap[] }) {
  const [checked, setChecked] = useState<Set<ManagerCap>>(new Set(caps));
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setMessage(null);
    setPending(true);
    try {
      const result = await updateDepartmentPermissions(departmentId, formData);
      setMessage(result?.error ? { kind: "error", text: result.error } : { kind: "success", text: "Salvato." });
    } catch {
      setMessage({ kind: "error", text: "Errore imprevisto" });
    } finally {
      setPending(false);
    }
  }

  function toggle(cap: ManagerCap, on: boolean) {
    setMessage(null);
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(cap);
      else next.delete(cap);
      return next;
    });
  }

  return (
    <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {MANAGER_CAPS.map((cap) => (
          <label
            key={cap}
            className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border px-3 py-2 has-checked:border-primary-border has-checked:bg-primary-soft"
          >
            <input
              type="checkbox"
              name="caps"
              value={cap}
              checked={checked.has(cap)}
              onChange={(event) => toggle(cap, event.target.checked)}
              className="mt-0.5 size-4 accent-primary"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{MANAGER_CAP_LABELS[cap].label}</span>
              <span className="block text-xs text-muted-foreground">{MANAGER_CAP_LABELS[cap].hint}</span>
            </span>
          </label>
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
