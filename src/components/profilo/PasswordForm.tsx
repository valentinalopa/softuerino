"use client";

import { useState } from "react";
import { changeOwnPassword } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TONE_TEXT } from "@/lib/tones";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";

export function PasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData, form: HTMLFormElement) {
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      const result = await changeOwnPassword(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      form.reset();
      setSuccess(true);
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submitKeepingValues(handleSubmit)} className="space-y-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="current-password">Password attuale</Label>
        <Input id="current-password" name="currentPassword" type="password" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-password">Nuova password</Label>
        <Input id="new-password" name="newPassword" type="password" required minLength={8} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="confirm-password">Conferma nuova password</Label>
        <Input id="confirm-password" name="confirmPassword" type="password" required minLength={8} />
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className={`text-sm ${TONE_TEXT.success}`}>Password aggiornata.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Aggiornamento..." : "Aggiorna password"}
      </Button>
    </form>
  );
}
