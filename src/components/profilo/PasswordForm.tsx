"use client";

import { useRef, useState } from "react";
import { changeOwnPassword } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      const result = await changeOwnPassword(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      formRef.current?.reset();
      setSuccess(true);
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-3">
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
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Password aggiornata.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Aggiornamento..." : "Aggiorna password"}
      </Button>
    </form>
  );
}
