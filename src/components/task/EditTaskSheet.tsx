"use client";

import { useState } from "react";
import { updateTask } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { TaskFields, type TaskFieldValues } from "@/components/task/TaskFields";
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

export type EditableTask = TaskFieldValues & { id: string };

// Pannello di modifica di un task, aperto dal clic sulla riga della tabella.
export function EditTaskSheet({
  task,
  users,
  clients,
  onClose,
}: {
  task: EditableTask | null;
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  onClose: () => void;
}) {
  return (
    <Sheet
      open={task !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent>
        {task && (
          // Rimonta il form a ogni task: i campi ripartono dai valori salvati.
          <EditTaskForm key={task.id} task={task} users={users} clients={clients} onSaved={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function EditTaskForm({
  task,
  users,
  clients,
  onSaved,
}: {
  task: EditableTask;
  users: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await updateTask(task.id, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onSaved();
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>Modifica task</SheetTitle>
      </SheetHeader>
      <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
        <SheetBody className="space-y-3">
          <TaskFields idPrefix="edit-task" users={users} clients={clients} values={task} />
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
