"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/lib/actions";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const NO_CLIENT = "none";

export function NewTaskDialog({
  users,
  clients,
}: {
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createTask(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setError(null);
      }}
    >
      <SheetTrigger render={<Button type="button" />}>
        <Plus className="size-4" />
        Nuovo task
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuovo task</SheetTitle>
        </SheetHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-title">Task</Label>
              <Input id="new-task-title" name="title" required />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Assegnatari</Label>
              <CheckboxGroupField
                name="assigneeIds"
                options={users.map((user) => ({ id: user.id, label: user.name }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Cliente</Label>
              <NativeSelectField
                fullWidth
                name="clientId"
                defaultValue={NO_CLIENT}
                items={[
                  { value: NO_CLIENT, label: "Nessun cliente" },
                  ...clients.map((client) => ({ value: client.id, label: client.name })),
                ]}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Stato</Label>
                <NativeSelectField
                  fullWidth
                  name="status"
                  defaultValue="not_started"
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
                  defaultValue="medium"
                  items={TASK_PRIORITIES.map((priority) => ({
                    value: priority,
                    label: TASK_PRIORITY_LABELS[priority],
                  }))}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-task-dueDate">Scadenza</Label>
              <DateField id="new-task-dueDate" name="dueDate" className="w-full" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creazione..." : "Crea task"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
