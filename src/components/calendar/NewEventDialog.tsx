"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createEvent } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import type { PlanningAbsence } from "@/lib/absence-conflicts";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { DiscardChangesDialog, useUnsavedChanges } from "@/components/form/unsaved-changes";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { EventFields } from "./EventFields";
import { toast } from "@/lib/toast";

export function NewEventDialog({
  users,
  absences,
  defaultStart,
}: {
  users: { id: string; name: string }[];
  absences: PlanningAbsence[];
  defaultStart?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { formRef, isDirty } = useUnsavedChanges();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createEvent(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast("Evento creato");
    } catch (error) {
      setError(unexpectedErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // Esc, X o clic fuori con dati inseriti: prima si chiede conferma.
        if (!next && isDirty()) {
          setConfirmDiscard(true);
          return;
        }
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <SheetTrigger render={<Button type="button" className="gap-1.5" />}>
        <Plus className="size-4" />
        Nuovo evento
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuovo evento</SheetTitle>
        </SheetHeader>
        <form ref={formRef} onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            {/* Si rimonta a ogni apertura: i campi ripartono vuoti. */}
            {open && (
              <EventFields idPrefix="new-event" users={users} absences={absences} defaultStart={defaultStart} />
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creazione..." : "Crea evento"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={() => setOpen(false)} />
    </Sheet>
  );
}
