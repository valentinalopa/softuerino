"use client";

import { useState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteVpnSection } from "@/lib/vpn/actions";
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

export function DeleteVpnSectionButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await deleteVpnSection(id);
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
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" />}
      >
        <Trash2 className="size-4" />
        Elimina
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Eliminare la VPN {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Sparisce dalla pagina VPN per tutti. Il server VPN e i profili già importati non cambiano.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <AlertDialogFooter>
          <AlertDialogCancel>Annulla</AlertDialogCancel>
          <AlertDialogAction type="button" variant="destructive" disabled={pending} onClick={handleDelete}>
            Elimina
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
