"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { handleAccountRequest } from "@/lib/accounts/actions";
import { Button } from "@/components/ui/button";

// "Creato" (account fatto in Keycloak) o "Rifiuta": chi l'ha chiesta riceve un'email.
export function AccountRequestActions({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(status: "done" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await handleAccountRequest(requestId, status);
        if (result?.error) setError(result.error);
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1">
        <Button type="button" variant="success" size="sm" disabled={pending} onClick={() => run("done")}>
          <Check className="size-4" />
          Creato
        </Button>
        <Button type="button" variant="destructive-soft" size="sm" disabled={pending} onClick={() => run("rejected")}>
          <X className="size-4" />
          Rifiuta
        </Button>
      </div>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
