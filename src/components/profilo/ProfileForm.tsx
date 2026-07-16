"use client";

import { useState } from "react";
import { updateOwnProfile } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { NameEmailFields } from "@/components/form/name-email-fields";

export function ProfileForm({ user }: { user: { name: string; email: string } }) {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setSuccess(false);
    setPending(true);
    try {
      const result = await updateOwnProfile(formData);
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
    <form action={handleSubmit} className="space-y-3">
      <NameEmailFields idPrefix="profile" defaultName={user.name} defaultEmail={user.email} />
      {error && <p className="text-sm text-destructive">{error}</p>}
      {success && <p className="text-sm text-emerald-600 dark:text-emerald-400">Modifiche salvate.</p>}
      <Button type="submit" disabled={pending}>
        {pending ? "Salvataggio..." : "Salva modifiche"}
      </Button>
    </form>
  );
}
