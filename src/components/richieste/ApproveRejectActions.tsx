"use client";

import { useState, useTransition } from "react";
import { Check, X } from "lucide-react";
import { updateLeaveStatus } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";

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
        } else {
          toast(status === "approved" ? "Richiesta approvata" : "Richiesta rifiutata");
        }
      } catch (error) {
        setError(unexpectedErrorMessage(error));
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
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
