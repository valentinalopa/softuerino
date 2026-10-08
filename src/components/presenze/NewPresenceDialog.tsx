"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createPresenceEntry } from "@/lib/actions";
import {
  PRESENCE_SLOTS,
  PRESENCE_SLOT_LABELS,
  PRESENCE_MODES,
  PRESENCE_MODE_LABELS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
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

export function NewPresenceDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createPresenceEntry(formData);
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
        Nuova presenza
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuova presenza</SheetTitle>
        </SheetHeader>
        <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-presence-date">Data</Label>
              <DateField id="new-presence-date" name="date" className="w-full" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Fascia oraria</Label>
              <NativeSelectField
                fullWidth
                name="slot"
                defaultValue={PRESENCE_SLOTS[2]}
                items={PRESENCE_SLOTS.map((slot) => ({
                  value: slot,
                  label: PRESENCE_SLOT_LABELS[slot],
                }))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Modalità</Label>
              <NativeSelectField
                fullWidth
                name="mode"
                defaultValue={PRESENCE_MODES[0]}
                items={PRESENCE_MODES.map((mode) => ({
                  value: mode,
                  label: PRESENCE_MODE_LABELS[mode],
                }))}
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio..." : "Salva"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
