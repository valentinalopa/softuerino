"use client";

import { useState } from "react";
import { updateUser } from "@/lib/actions";
import {
  ROLE_LABELS,
  EMPLOYMENT_TYPES,
  EMPLOYMENT_TYPE_LABELS,
  type Role,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { NativeSelectField } from "@/components/form/native-select-field";
import { NameEmailFields } from "@/components/form/name-email-fields";
import { TONE_TEXT } from "@/lib/tones";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";

type TeamUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  employmentType: string;
  active: boolean;
};

export function EditTeamMemberForm({
  user,
  isSelf,
  roles,
  ssoManaged,
  ssoEnabled,
}: {
  user: TeamUser;
  isSelf: boolean;
  // Ruoli che l'utente corrente può assegnare.
  roles: readonly Role[];
  // Account aziendale collegato: nome ed email da Keycloak, password locale
  // solo per i super admin (accesso d'emergenza).
  ssoManaged: boolean;
  // Accesso con Keycloak attivo: la password locale serve solo ai super admin
  // (accesso d'emergenza); per gli altri il campo non c'è.
  ssoEnabled: boolean;
}) {
  const [active, setActive] = useState(user.active);
  const [role, setRole] = useState(user.role);
  const showPassword = !ssoEnabled || role === "super_admin";
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      const result = await updateUser(user.id, formData);
      if (result?.error) {
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

  return (
    <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
      <NameEmailFields
        idPrefix={`member-${user.id}`}
        defaultName={user.name}
        defaultEmail={user.email}
        readOnly={ssoManaged}
      />
      {ssoManaged && (
        <p className="text-xs text-muted-foreground">
          Account aziendale: nome ed email si cambiano su Keycloak (IT).
        </p>
      )}
      {showPassword && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`password-${user.id}`}>
            {ssoManaged ? "Password d'emergenza" : "Nuova password"}
          </Label>
          <Input
            id={`password-${user.id}`}
            name="password"
            type="password"
            placeholder="Lascia vuoto per non modificarla"
          />
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>Ruolo</Label>
        <NativeSelectField
          name="role"
          defaultValue={user.role}
          onValueChange={setRole}
          items={roles.map((role) => ({ value: role, label: ROLE_LABELS[role] }))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Tipo rapporto</Label>
        <NativeSelectField
          name="employmentType"
          defaultValue={user.employmentType}
          items={EMPLOYMENT_TYPES.map((type) => ({
            value: type,
            label: EMPLOYMENT_TYPE_LABELS[type],
          }))}
        />
      </div>
      <input type="hidden" name="active" value={active ? "true" : "false"} />
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={active}
          onCheckedChange={(next) => setActive(Boolean(next))}
          disabled={isSelf}
        />
        Attivo
      </Label>
      {isSelf && (
        <p className="text-xs text-muted-foreground">Non puoi disattivare il tuo account.</p>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && (
        <p className={`text-sm ${TONE_TEXT.success}`}>Modifiche salvate.</p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvataggio..." : "Salva modifiche"}
      </Button>
    </form>
  );
}
