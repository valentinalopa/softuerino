"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createTask } from "@/lib/actions";
import { Button } from "@/components/ui/button";
import { TaskFields } from "@/components/task/TaskFields";
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
        <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <TaskFields idPrefix="new-task" users={users} clients={clients} />

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
