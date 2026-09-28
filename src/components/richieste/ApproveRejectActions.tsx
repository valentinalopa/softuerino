"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { updateLeaveStatus } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export function ApproveRejectActions({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handle(status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateLeaveStatus(requestId, status);
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
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          disabled={pending}
          variant="success"
          onClick={() => handle("approved")}
        >
          <Check />
          Approva
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive-soft"
          disabled={pending}
          onClick={() => handle("rejected")}
        >
          <X />
          Rifiuta
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
