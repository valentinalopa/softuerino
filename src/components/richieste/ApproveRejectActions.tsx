"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { updateLeaveStatus } from "@/lib/actions";
import { Button } from "@/components/ui/button";

export const APPROVE_BUTTON_CLASS =
  "bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:bg-green-500/15 dark:text-green-300 dark:hover:bg-green-500/25";

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
          className={APPROVE_BUTTON_CLASS}
          onClick={() => handle("approved")}
        >
          <Check />
          Approva
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
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
