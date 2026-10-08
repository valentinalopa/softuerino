"use client";

import { useState, useTransition } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { deleteClient, updateClient } from "@/lib/actions";
import {
  CLIENT_CATEGORIES,
  CLIENT_CATEGORY_LABELS,
  parseClientCategories,
} from "@/lib/constants";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";

type ClientRow = { id: string; name: string; active: boolean; categories: string };

export function ClientRowActions({ client }: { client: ClientRow }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [active, setActive] = useState(client.active);
  const [error, setError] = useState<string | null>(null);
  const [editPending, setEditPending] = useState(false);
  const [pending, startTransition] = useTransition();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setEditPending(true);
    try {
      const result = await updateClient(client.id, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setEditOpen(false);
    } catch {
      setError("Errore imprevisto");
    } finally {
      setEditPending(false);
    }
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteClient(client.id);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setDeleteOpen(false);
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <div className="flex justify-end gap-1">
      <Sheet
        open={editOpen}
        onOpenChange={(open) => {
          setEditOpen(open);
          if (open) {
            setActive(client.active);
            setError(null);
          }
        }}
      >
        <SheetTrigger
          render={
            <Button type="button" variant="ghost" size="icon-sm" aria-label="Modifica" />
          }
        >
          <Pencil className="size-4" />
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Modifica cliente</SheetTitle>
          </SheetHeader>
          <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
            <SheetBody className="space-y-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor={`client-name-${client.id}`}>Nome cliente</Label>
                <Input
                  id={`client-name-${client.id}`}
                  name="name"
                  defaultValue={client.name}
                  required
                />
              </div>
              <input type="hidden" name="active" value={active ? "true" : "false"} />
              <Label className="flex items-center gap-2 text-sm font-normal">
                <Checkbox checked={active} onCheckedChange={(next) => setActive(Boolean(next))} />
                Attivo
              </Label>
              <div className="flex flex-col gap-1.5">
                <Label>Categorie</Label>
                <CheckboxGroupField
                  key={editOpen ? "open" : "closed"}
                  name="categories"
                  defaultSelected={parseClientCategories(client.categories)}
                  options={CLIENT_CATEGORIES.map((category) => ({
                    id: category,
                    label: CLIENT_CATEGORY_LABELS[category],
                  }))}
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </SheetBody>
            <SheetFooter>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Salvataggio..." : "Salva"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label="Elimina"
            />
          }
        >
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {client.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminate definitivamente anche tutte le ore loggate su questo
              cliente. L&apos;operazione non è reversibile.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleDelete}
            >
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
