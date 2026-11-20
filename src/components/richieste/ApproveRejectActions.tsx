"use client";

import { useState, useTransition } from "react";
import { Check, MessageSquarePlus, X } from "lucide-react";
import { updateLeaveStatus } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";

// Stesso limite del service (DECISION_NOTE_MAX): qui solo per il contatore, la
// regola vera la applica il server.
const NOTE_MAX = 500;

export function ApproveRejectActions({ requestId, version }: { requestId: string; version?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Nota facoltativa per chi ha fatto la richiesta: si apre solo se serve.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");

  function handle(status: "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        const result = await updateLeaveStatus(requestId, status, version, note);
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
        {!noteOpen && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => setNoteOpen(true)}
          >
            <MessageSquarePlus />
            Nota
          </Button>
        )}
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
      {noteOpen && (
        <div className="flex w-64 flex-col items-end gap-0.5">
          <Textarea
            aria-label="Nota per chi ha fatto la richiesta (facoltativa)"
            placeholder="Nota per chi ha fatto la richiesta (facoltativa)"
            className="min-h-16 px-3 py-2 text-sm"
            maxLength={NOTE_MAX}
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">
            {note.length}/{NOTE_MAX}
          </span>
        </div>
      )}
      {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
