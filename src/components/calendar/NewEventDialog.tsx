"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createEvent } from "@/lib/actions";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { NativeSelectField } from "@/components/form/native-select-field";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";
import { DateTimeField } from "@/components/form/datetime-field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

export function NewEventDialog({
  users,
  defaultStart,
}: {
  users: { id: string; name: string }[];
  defaultStart?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

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
      <SheetTrigger render={<Button type="button" className="gap-1.5" />}>
        <Plus className="size-4" />
        Nuovo evento
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuovo evento</SheetTitle>
        </SheetHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Titolo</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <NativeSelectField
                fullWidth
                name="type"
                defaultValue={EVENT_TYPES[0]}
                items={EVENT_TYPES.map((type) => ({
                  value: type,
                  label: EVENT_TYPE_LABELS[type],
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="startAt">Inizio</Label>
              <DateTimeField id="startAt" name="startAt" defaultValue={defaultStart} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endAt">Fine</Label>
              <DateTimeField id="endAt" name="endAt" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Luogo</Label>
              <Input id="location" name="location" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Partecipanti</Label>
              <CheckboxGroupField
                name="participantIds"
                options={users.map((user) => ({ id: user.id, label: user.name }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Descrizione</Label>
              <Textarea id="description" name="description" rows={2} />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Creazione..." : "Crea evento"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
