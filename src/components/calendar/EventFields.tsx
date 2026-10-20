"use client";

import { useState } from "react";
import { format } from "date-fns";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelectField } from "@/components/form/native-select-field";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";
import { DateTimeField } from "@/components/form/datetime-field";
import { absenceConflict, type PlanningAbsence } from "@/lib/absence-conflicts";
import type { CalendarEventData } from "./types";

// Valore "yyyy-MM-ddTHH:mm" per DateTimeField, nell'ora locale di chi guarda.
function toDateTimeValue(date: Date) {
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

// Campi dell'evento, condivisi tra "Nuovo evento" e la modifica dal dettaglio:
// i due form restano identici.
export function EventFields({
  idPrefix,
  users,
  absences,
  defaultStart,
  values,
}: {
  idPrefix: string;
  users: { id: string; name: string }[];
  // Assenze del team: chi è assente nelle date dell'evento non si può invitare.
  absences: PlanningAbsence[];
  // Solo per un evento nuovo: inizio proposto (giorno visualizzato).
  defaultStart?: string;
  values?: CalendarEventData;
}) {
  const initialStart = values ? toDateTimeValue(values.startAt) : (defaultStart ?? "");
  const initialEnd = values ? toDateTimeValue(values.endAt) : "";
  const [startAt, setStartAt] = useState(initialStart);
  const [endAt, setEndAt] = useState(initialEnd);

  // Un partecipante non più attivo resta nell'elenco dell'evento che lo
  // include già, altrimenti salvare lo toglierebbe senza volerlo.
  const participantUsers = [
    ...users,
    ...(values?.participants
      .map((p) => p.user)
      .filter((participant) => !users.some((u) => u.id === participant.id)) ?? []),
  ];

  // Senza la fine si considera il solo giorno di inizio.
  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : start;
  const participantOptions = participantUsers.map((user) => {
    const conflict = start && end ? absenceConflict(absences, user.id, start, end) : null;
    return {
      id: user.id,
      label: user.name,
      disabled: conflict?.kind === "blocked",
      hint: conflict?.reason,
      hintTone: conflict?.kind === "warning" ? ("warning" as const) : ("muted" as const),
    };
  });

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-title`}>Titolo</Label>
        <Input id={`${idPrefix}-title`} name="title" required defaultValue={values?.title} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Tipo</Label>
        <NativeSelectField
          fullWidth
          name="type"
          defaultValue={values?.type ?? EVENT_TYPES[0]}
          items={EVENT_TYPES.map((type) => ({
            value: type,
            label: EVENT_TYPE_LABELS[type],
          }))}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-startAt`}>Inizio</Label>
        <DateTimeField
          id={`${idPrefix}-startAt`}
          name="startAt"
          defaultValue={initialStart || undefined}
          onValueChange={setStartAt}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-endAt`}>Fine</Label>
        <DateTimeField
          id={`${idPrefix}-endAt`}
          name="endAt"
          defaultValue={initialEnd || undefined}
          onValueChange={setEndAt}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-location`}>Luogo</Label>
        <Input
          id={`${idPrefix}-location`}
          name="location"
          defaultValue={values?.location ?? undefined}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Partecipanti</Label>
        <CheckboxGroupField
          name="participantIds"
          direction="column"
          options={participantOptions}
          defaultSelected={values?.participants.map((p) => p.user.id)}
        />
        <p className="text-xs text-muted-foreground">
          Chi è assente in quelle date non è selezionabile.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-description`}>Descrizione</Label>
        <Textarea
          id={`${idPrefix}-description`}
          name="description"
          rows={2}
          defaultValue={values?.description ?? undefined}
        />
      </div>
    </>
  );
}
