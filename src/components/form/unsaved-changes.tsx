"use client";

import { useCallback, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Valori del form così come verrebbero inviati: copre anche i campi
// controllati (date, orari, checkbox) che scrivono in input nascosti.
function serialize(form: HTMLFormElement) {
  return JSON.stringify([...new FormData(form).entries()]);
}

// Modifiche non salvate in un form dentro un pannello: fotografa i valori
// quando il form compare e li confronta quando si prova a chiudere.
export function useUnsavedChanges() {
  const form = useRef<HTMLFormElement | null>(null);
  const initial = useRef<string | null>(null);

  // Ref stabile: scatta solo quando il form entra o esce dalla pagina.
  const formRef = useCallback((element: HTMLFormElement | null) => {
    form.current = element;
    initial.current = element ? serialize(element) : null;
  }, []);

  const isDirty = useCallback(
    () => form.current !== null && initial.current !== null && serialize(form.current) !== initial.current,
    []
  );

  return { formRef, isDirty };
}

// Conferma prima di chiudere un pannello con modifiche non salvate.
export function DiscardChangesDialog({
  open,
  onOpenChange,
  onDiscard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDiscard: () => void;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Chiudere senza salvare?</AlertDialogTitle>
          <AlertDialogDescription>Le modifiche fatte in questo pannello andranno perse.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continua a modificare</AlertDialogCancel>
          <AlertDialogAction
            type="button"
            variant="destructive"
            onClick={() => {
              onOpenChange(false);
              onDiscard();
            }}
          >
            Chiudi senza salvare
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
