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
import { absenceConflict, type PlanningAbsence } from "@/lib/absence-conflicts";
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
  absences,
  defaultStart,
}: {
  users: { id: string; name: string }[];
  // Assenze del team: chi è assente nelle date dell'evento non si può invitare.
  absences: PlanningAbsence[];
  defaultStart?: string;
}) {
  const [open, setOpen] = useState(false);
  const [startAt, setStartAt] = useState(defaultStart ?? "");
  const [endAt, setEndAt] = useState("");

  // Senza la fine si considera il solo giorno di inizio.
  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : start;
  const participantOptions = users.map((user) => {
    const conflict = start && end ? absenceConflict(absences, user.id, start, end) : null;
    return {
      id: user.id,
      label: user.name,
      disabled: conflict?.kind === "blocked",
      hint: conflict?.reason,
      hintTone: conflict?.kind === "warning" ? ("warning" as const) : ("muted" as const),
    };
  });
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
        if (next) {
          setError(null);
          setStartAt(defaultStart ?? "");
          setEndAt("");
        }
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
              <DateTimeField
                id="startAt"
                name="startAt"
                defaultValue={defaultStart}
                onValueChange={setStartAt}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="endAt">Fine</Label>
              <DateTimeField id="endAt" name="endAt" onValueChange={setEndAt} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="location">Luogo</Label>
              <Input id="location" name="location" />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Partecipanti</Label>
              <CheckboxGroupField
                name="participantIds"
                direction="column"
                options={participantOptions}
              />
              <p className="text-xs text-muted-foreground">
                Chi è assente in quelle date non è selezionabile.
              </p>
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
