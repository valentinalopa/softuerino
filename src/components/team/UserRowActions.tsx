"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteUser } from "@/lib/actions";
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

type TeamUser = {
  id: string;
  name: string;
};

export function UserRowActions({
  user,
  isSelf,
}: {
  user: TeamUser;
  isSelf: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteUser(user.id);
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
    <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="text-destructive hover:text-destructive"
              aria-label="Elimina"
              disabled={isSelf}
            />
          }
        >
          <Trash2 className="size-4" />
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Verranno eliminati definitivamente anche le sue richieste di ferie/permesso,
              le presenze registrate, le ore loggate e le partecipazioni agli eventi.
              L&apos;operazione non è reversibile.
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
