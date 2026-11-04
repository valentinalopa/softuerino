"use client";

import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { emptyTaskArchive } from "@/lib/actions";

// Solo per il super admin (la pagina lo mostra solo a lui; l'azione controlla comunque).
export function EmptyArchiveButton() {
  return (
    <ConfirmDeleteButton
      withText
      actionText="Svuota archivio"
      successMessage="Archivio svuotato"
      label="Svuota archivio"
      title="Svuotare l'archivio dei task?"
      description="Tutti i task archiviati (completati da più di 30 giorni) vengono eliminati per tutti. L'operazione non è reversibile."
      onConfirm={() => emptyTaskArchive()}
    />
  );
}
