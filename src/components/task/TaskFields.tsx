"use client";

import { format } from "date-fns";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
} from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";

export const NO_CLIENT = "none";

export type TaskFieldValues = {
  title: string;
  clientId: string | null;
  // Il cliente attuale, che potrebbe non essere più tra quelli attivi.
  client?: { id: string; name: string } | null;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  assigneeIds: string[];
};

// Campi del task, condivisi tra "Nuovo task" e la modifica dalla riga: i due
// form restano identici.
export function TaskFields({
  idPrefix,
  users,
  clients,
  values,
}: {
  idPrefix: string;
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  values?: TaskFieldValues;
}) {
  // Un cliente disattivato resta selezionabile per il task che lo usa già,
  // altrimenti salvare lo toglierebbe senza volerlo.
  const clientItems =
    values?.client && !clients.some((c) => c.id === values.client!.id)
      ? [...clients, values.client]
      : clients;

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-title`}>Task</Label>
        <Input id={`${idPrefix}-title`} name="title" required defaultValue={values?.title} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Assegnatari</Label>
        <CheckboxGroupField
          name="assigneeIds"
          options={users.map((user) => ({ id: user.id, label: user.name }))}
          defaultSelected={values?.assigneeIds}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Cliente</Label>
        <NativeSelectField
          fullWidth
          name="clientId"
          defaultValue={values?.clientId ?? NO_CLIENT}
          items={[
            { value: NO_CLIENT, label: "Nessun cliente" },
            ...clientItems.map((client) => ({ value: client.id, label: client.name })),
          ]}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>Stato</Label>
          <NativeSelectField
            fullWidth
            name="status"
            defaultValue={values?.status ?? "not_started"}
            items={TASK_STATUSES.map((status) => ({
              value: status,
              label: TASK_STATUS_LABELS[status],
            }))}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Priorità</Label>
          <NativeSelectField
            fullWidth
            name="priority"
            defaultValue={values ? (values.priority ?? "") : "medium"}
            items={[
              // Solo in modifica: i task senza priorità restano tali.
              ...(values && !values.priority ? [{ value: "", label: "Nessuna" }] : []),
              ...TASK_PRIORITIES.map((priority) => ({
                value: priority,
                label: TASK_PRIORITY_LABELS[priority],
              })),
            ]}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idPrefix}-dueDate`}>Scadenza</Label>
        <DateField
          id={`${idPrefix}-dueDate`}
          name="dueDate"
          className="w-full"
          defaultValue={values?.dueDate ? format(values.dueDate, "yyyy-MM-dd") : undefined}
        />
      </div>
    </>
  );
}
