"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";

// Eliminazione definitiva di un account, dalla scheda del membro: è rara e
// irreversibile, quindi non sta nella lista del Team accanto a ogni persona.
export function DeleteMemberButton({ user }: { user: { id: string; name: string } }) {
  const router = useRouter();
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
        toast("Membro eliminato");
        router.push("/team");
      } catch (error) {
        setError(unexpectedErrorMessage(error));
      }
    });
  }

  return (
    <>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive"
            />
          }
        >
          <Trash2 className="size-4" />
          Elimina account
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
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
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
    </>
  );
}
