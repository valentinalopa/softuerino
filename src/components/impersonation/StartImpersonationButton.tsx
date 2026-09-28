"use client";

import { useState, useTransition } from "react";
import { Eye } from "lucide-react";
import { startImpersonationAction } from "@/lib/auth/actions";
import { Button } from "@/components/ui/button";

// Solo super admin, dalla scheda membro: apre l'app come la vede il membro,
// in sola lettura.
export function StartImpersonationButton({
  userId,
  userName,
}: {
  userId: string;
  userName: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handle() {
    setError(null);
    startTransition(async () => {
      // In caso di successo l'azione fa redirect: arriva un risultato solo
      // se qualcosa è andato storto.
      const result = await startImpersonationAction(userId);
      if (result?.error) {
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" variant="outline" size="sm" disabled={pending} onClick={handle}>
        <Eye />
        Vedi come {userName.split(" ")[0]}
      </Button>
      {error && <p className="max-w-64 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
