"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createClient } from "@/lib/actions";
import { CLIENT_CATEGORIES, CLIENT_CATEGORY_LABELS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

export function NewClientDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createClient(formData);
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
        Nuovo cliente
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuovo cliente</SheetTitle>
        </SheetHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-client-name">Nome cliente</Label>
              <Input id="new-client-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Categorie</Label>
              <CheckboxGroupField
                key={open ? "open" : "closed"}
                name="categories"
                options={CLIENT_CATEGORIES.map((category) => ({
                  id: category,
                  label: CLIENT_CATEGORY_LABELS[category],
                }))}
              />
              <p className="text-xs text-muted-foreground">
                &quot;Comunicazione&quot; abilita il PED del cliente.
              </p>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Aggiunta..." : "Aggiungi"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
