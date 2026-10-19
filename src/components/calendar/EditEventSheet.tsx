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
import { unexpectedErrorMessage } from "@/lib/action-error";
import { EventFields } from "./EventFields";
import type { CalendarEventData } from "./types";

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
  return (
    <Sheet
      open={event !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        {event && (
          // Rimonta il form a ogni evento: i campi ripartono dai valori salvati.
          <EditEventForm key={event.id} event={event} users={users} absences={absences} onSaved={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditEventForm({
  event,
  users,
  absences,
  onSaved,
}: {
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
      <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
        <SheetBody className="space-y-3">
          <EventFields idPrefix="edit-event" users={users} absences={absences} values={event} />
          {error && <p className="text-sm text-destructive">{error}</p>}
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
