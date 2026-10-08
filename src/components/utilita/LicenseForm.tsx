"use client";

import { useState } from "react";
import { LICENSE_KINDS, LICENSE_KIND_LABELS, LICENSE_REMINDER_DAYS_DEFAULT } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
import { TONE_TEXT } from "@/lib/tones";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";

export type LicenseFormValues = {
  name: string;
  kind: string;
  vendor: string | null;
  departmentId: string;
  activationLimit: number | null;
  expiresAt: string | null; // yyyy-MM-dd
  reminderDays: number;
  notes: string | null;
  hasKey: boolean;
  sharedDepartmentIds: string[];
  visibleToAll: boolean;
  hasAccount: boolean;
  hasPassword: boolean;
};

export function LicenseForm({
  departments,
  allDepartments,
  initial,
  submitLabel,
  onSubmit,
}: {
  // Reparti principali possibili (dove si può gestire) e tutti i reparti, con
  // cui condividerla.
  departments: { id: string; name: string }[];
  allDepartments: { id: string; name: string }[];
  initial?: LicenseFormValues;
  submitLabel: string;
  onSubmit: (formData: FormData) => Promise<{ error: string } | undefined | { id: string }>;
}) {
  const [unlimited, setUnlimited] = useState(initial ? initial.activationLimit === null : false);
  const [clearKey, setClearKey] = useState(false);
  const [clearPassword, setClearPassword] = useState(false);
  const [clearAccount, setClearAccount] = useState(false);
  const [visibleToAll, setVisibleToAll] = useState(initial?.visibleToAll ?? false);
  const [mainDepartment, setMainDepartment] = useState(initial?.departmentId ?? departments[0]?.id ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      const result = await onSubmit(formData);
      if (result && "error" in result) {
        setError(result.error);
        return;
      }
      setSuccess(true);
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  if (departments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nessun reparto disponibile: i reparti arrivano dai gruppi Keycloak al primo accesso con
        l&apos;account aziendale.
      </p>
    );
  }

  return (
    <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
      <input type="hidden" name="unlimited" value={unlimited ? "true" : "false"} />
      <input type="hidden" name="clearKey" value={clearKey ? "true" : "false"} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license-name">Nome</Label>
          <Input id="license-name" name="name" required defaultValue={initial?.name} placeholder="Breakdance" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license-vendor">Fornitore</Label>
          <Input id="license-vendor" name="vendor" defaultValue={initial?.vendor ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Tipo</Label>
          <NativeSelectField
            fullWidth
            name="kind"
            defaultValue={initial?.kind ?? "licenza"}
            items={LICENSE_KINDS.map((k) => ({ value: k, label: LICENSE_KIND_LABELS[k] }))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Reparto</Label>
          <NativeSelectField
            fullWidth
            name="departmentId"
            defaultValue={initial?.departmentId ?? departments[0].id}
            items={departments.map((d) => ({ value: d.id, label: d.name }))}
            onValueChange={setMainDepartment}
          />
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1.5 text-sm font-medium">Chi la vede</legend>
        <div className="flex flex-wrap gap-2">
          {allDepartments
            .filter((d) => d.id !== mainDepartment)
            .map((d) => (
              <label
                key={d.id}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-border px-3 py-1 text-sm has-checked:border-primary-border has-checked:bg-primary-soft"
              >
                <input
                  type="checkbox"
                  name="sharedDepartmentIds"
                  value={d.id}
                  defaultChecked={initial?.sharedDepartmentIds.includes(d.id)}
                  className="size-3.5 accent-primary"
                />
                {d.name}
              </label>
            ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Oltre al reparto principale, condividila con altri reparti: la vedono secondo i loro permessi.
        </p>
        <Label className="flex items-center gap-2 text-sm font-normal">
          <Checkbox checked={visibleToAll} onCheckedChange={(next) => setVisibleToAll(Boolean(next))} />
          Visibile a tutti (chiunque usi Softuerino può vederla e usarla, registrando dove)
        </Label>
        <input type="hidden" name="visibleToAll" value={visibleToAll ? "true" : "false"} />
      </fieldset>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="license-key">Chiave di licenza</Label>
        <Input
          id="license-key"
          name="key"
          type="password"
          autoComplete="off"
          disabled={clearKey}
          placeholder={initial?.hasKey ? "Salvata: lascia vuoto per non cambiarla" : "Facoltativa"}
        />
        {initial?.hasKey && (
          <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <Checkbox checked={clearKey} onCheckedChange={(next) => setClearKey(Boolean(next))} />
            Rimuovi la chiave salvata
          </Label>
        )}
      </div>

      {/* Account con cui è stata acquistata o si accede (es. Adobe) e password:
          cifrati; l'account lo vedono in chiaro solo i super admin, gli altri
          (come la password) registrando dove li usano. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license-account">Account</Label>
          <Input
            id="license-account"
            name="account"
            autoComplete="off"
            maxLength={200}
            disabled={clearAccount}
            placeholder={initial?.hasAccount ? "Salvato: lascia vuoto per non cambiarlo" : "Facoltativo (account di acquisto o accesso)"}
          />
          {initial?.hasAccount && (
            <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Checkbox checked={clearAccount} onCheckedChange={(next) => setClearAccount(Boolean(next))} />
              Rimuovi l&apos;account salvato
            </Label>
          )}
          <input type="hidden" name="clearAccount" value={clearAccount ? "true" : "false"} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license-password">Password</Label>
          <Input
            id="license-password"
            name="password"
            type="password"
            autoComplete="new-password"
            disabled={clearPassword}
            placeholder={initial?.hasPassword ? "Salvata: lascia vuoto per non cambiarla" : "Facoltativa"}
          />
          {initial?.hasPassword && (
            <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
              <Checkbox checked={clearPassword} onCheckedChange={(next) => setClearPassword(Boolean(next))} />
              Rimuovi la password salvata
            </Label>
          )}
          <input type="hidden" name="clearPassword" value={clearPassword ? "true" : "false"} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="license-limit">Attivazioni massime</Label>
          <Input
            id="license-limit"
            name="activationLimit"
            type="number"
            min={1}
            disabled={unlimited}
            defaultValue={initial?.activationLimit ?? 1}
          />
          <Label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <Checkbox checked={unlimited} onCheckedChange={(next) => setUnlimited(Boolean(next))} />
            Illimitate
          </Label>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license-expires">Scadenza</Label>
          <DateField
            id="license-expires"
            name="expiresAt"
            defaultValue={initial?.expiresAt ?? undefined}
            placeholder="Nessuna"
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="license-reminder">Avviso (giorni prima)</Label>
          <Input
            id="license-reminder"
            name="reminderDays"
            type="number"
            min={1}
            max={365}
            defaultValue={initial?.reminderDays ?? LICENSE_REMINDER_DAYS_DEFAULT}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="license-notes">Note</Label>
        <Textarea id="license-notes" name="notes" defaultValue={initial?.notes ?? ""} rows={3} />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className={`text-sm ${TONE_TEXT.success}`}>Salvato.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvataggio..." : submitLabel}
      </Button>
    </form>
  );
}
