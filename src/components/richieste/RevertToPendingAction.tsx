"use client";

import { useState, useTransition } from "react";
import { Undo2 } from "lucide-react";
import { revertLeaveToPending } from "@/lib/actions";
import { Button } from "@/components/ui/button";

// Solo admin: riporta in attesa una richiesta già decisa, per ridecidere.
export function RevertToPendingAction({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handle() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await revertLeaveToPending(requestId);
        if (result?.error) {
          setError(result.error);
        }
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={handle}
      >
        <Undo2 />
        Riporta in attesa
      </Button>
      {error && <p className="max-w-64 text-right text-xs text-destructive">{error}</p>}
    </div>
  );
}
