"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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

// Cestino con conferma (task, richieste). I clic restano qui dentro: spesso
// sta in una riga cliccabile, e anche i clic nel popup (portal) risalirebbero
// fino alla riga.
export function ConfirmDeleteButton({
  label,
  title,
  description,
  onConfirm,
  withText = false,
}: {
  // Per screen reader e tooltip (es. "Elimina task").
  label: string;
  title: string;
  description: string;
  onConfirm: () => Promise<{ error: string } | undefined>;
  // Pulsante con testo ("Elimina") invece della sola icona.
  withText?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await onConfirm();
        if (result?.error) {
          setError(result.error);
          return;
        }
        setOpen(false);
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <div
      className="inline-flex"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setError(null);
        }}
      >
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size={withText ? "sm" : "icon-sm"}
              className="text-destructive hover:text-destructive"
              aria-label={label}
              title={label}
            />
          }
        >
          <Trash2 className="size-4" />
          {withText && "Elimina"}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{title}</AlertDialogTitle>
            <AlertDialogDescription>{description}</AlertDialogDescription>
          </AlertDialogHeader>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={handleConfirm}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
