"use client";

import { useState } from "react";
import { updateEvent } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import type { PlanningAbsence } from "@/lib/absence-conflicts";
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { DiscardChangesDialog, useUnsavedChanges } from "@/components/form/unsaved-changes";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { EventFields } from "./EventFields";
import type { CalendarEventData } from "./types";
import { toast } from "@/lib/toast";

// Pannello di modifica di un evento, aperto dal suo dettaglio.
export function EditEventSheet({
  event,
  users,
  absences,
  onClose,
}: {
  event: CalendarEventData | null;
  users: { id: string; name: string }[];
  absences: PlanningAbsence[];
  onClose: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const { formRef, isDirty } = useUnsavedChanges();

  return (
    <Sheet
      open={event !== null}
      onOpenChange={(open) => {
        if (open) return;
        // Annulla, Esc, X o clic fuori con modifiche: prima si chiede conferma.
        if (isDirty()) {
          setConfirmDiscard(true);
          return;
        }
        onClose();
      }}
    >
      <SheetContent>
        {event && (
          // Rimonta il form a ogni evento: i campi ripartono dai valori salvati.
          <EditEventForm
            key={event.id}
            formRef={formRef}
            event={event}
            users={users}
            absences={absences}
            onSaved={onClose}
          />
        )}
      </SheetContent>
      <DiscardChangesDialog open={confirmDiscard} onOpenChange={setConfirmDiscard} onDiscard={onClose} />
    </Sheet>
  );
}

function EditEventForm({
  formRef,
  event,
  users,
  absences,
  onSaved,
}: {
  formRef: (element: HTMLFormElement | null) => void;
  event: CalendarEventData;
  users: { id: string; name: string }[];
  absences: PlanningAbsence[];
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await updateEvent(event.id, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSaved();
      toast("Evento aggiornato");
    } catch (error) {
      setError(unexpectedErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Modifica evento</SheetTitle>
      </SheetHeader>
      <form ref={formRef} onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
        <SheetBody className="space-y-3">
          <EventFields idPrefix="edit-event" users={users} absences={absences} values={event} />
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        </SheetBody>
        <SheetFooter>
          <SheetClose render={<Button type="button" variant="outline" />}>Annulla</SheetClose>
          <Button type="submit" disabled={pending}>
            {pending ? "Salvataggio..." : "Salva modifiche"}
          </Button>
        </SheetFooter>
      </form>
    </>
  );
}
