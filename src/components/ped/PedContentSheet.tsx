"use client";

import { useState, useTransition } from "react";
import { savePedContent, deletePedContent } from "@/lib/actions";
import {
  PED_STATUSES,
  PED_STATUS_LABELS,
  PED_SOCIALS,
  PED_SOCIAL_LABELS,
} from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
import { CheckboxGroupField } from "@/components/form/checkbox-group-field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
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

const NO_ASSIGNEE = "none";

export type PedEntry = {
  id: string;
  title: string;
  dateKey: string; // yyyy-MM-dd
  status: string;
  socials: string[];
  script: string | null;
  clientId: string;
  clientName: string;
  assigneeId: string | null;
};

export type PedSheetState =
  | { mode: "create"; date: string; status?: string }
  | { mode: "edit"; entry: PedEntry };

// Offcanvas condiviso di creazione/modifica contenuto: usato dal calendario
// (mese) e dalla board per stato, così il form esiste in un punto solo.
export function PedContentSheet({
  state,
  onClose,
  members,
  clients,
  fixedClientId,
}: {
  state: PedSheetState | null;
  onClose: () => void;
  members: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  fixedClientId?: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePending, startDeleteTransition] = useTransition();

  const editing = state?.mode === "edit" ? state.entry : null;

  // Senza clienti comunicazione non c'è nulla su cui creare: meglio dirlo
  // subito che far fallire il submit con un errore server.
  const noClients = !fixedClientId && clients.length === 0 && !editing;

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await savePedContent(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      onClose();
    } catch {
      setError("Errore imprevisto");
    } finally {
      setPending(false);
    }
  }

  function handleDelete() {
    if (!editing) return;
    setError(null);
    startDeleteTransition(async () => {
      try {
        const result = await deletePedContent(editing.id);
        if (result?.error) {
          setError(result.error);
          return;
        }
        setDeleteOpen(false);
        onClose();
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <Sheet
      open={state !== null}
      onOpenChange={(next) => {
        if (!next) {
          setError(null);
          setDeleteOpen(false);
          onClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>
            {editing ? "Modifica contenuto" : "Nuovo contenuto"}
          </SheetTitle>
        </SheetHeader>
        <form
          key={
            editing?.id ??
            `new-${state?.mode === "create" ? `${state.date}-${state.status ?? ""}` : ""}`
          }
          action={handleSubmit}
          className="flex min-h-0 flex-1 flex-col"
        >
          {editing && <input type="hidden" name="id" value={editing.id} />}
          <SheetBody className="space-y-3">
            {noClients && (
              <p className="rounded-[0.4rem] border border-dashed px-3 py-4 text-sm text-muted-foreground">
                Nessun cliente comunicazione: attiva la categoria
                &ldquo;Comunicazione&rdquo; su un cliente dalla pagina Clienti
                per poter pianificare contenuti.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ped-title">Titolo</Label>
              <Input
                id="ped-title"
                name="title"
                required
                defaultValue={editing?.title ?? ""}
              />
            </div>

            {fixedClientId ? (
              <input type="hidden" name="clientId" value={fixedClientId} />
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Cliente</Label>
                <NativeSelectField
                  fullWidth
                  name="clientId"
                  defaultValue={editing?.clientId ?? clients[0]?.id}
                  items={clients.map((client) => ({
                    value: client.id,
                    label: client.name,
                  }))}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ped-date">Data di pubblicazione</Label>
              <DateField
                id="ped-date"
                name="date"
                className="w-full"
                defaultValue={
                  editing?.dateKey ??
                  (state?.mode === "create" ? state.date : undefined)
                }
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Stato</Label>
              <NativeSelectField
                fullWidth
                name="status"
                defaultValue={
                  editing?.status ??
                  (state?.mode === "create" ? state.status ?? "idea" : "idea")
                }
                items={PED_STATUSES.map((status) => ({
                  value: status,
                  label: PED_STATUS_LABELS[status],
                }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Social</Label>
              <CheckboxGroupField
                name="socials"
                defaultSelected={editing?.socials ?? []}
                options={PED_SOCIALS.map((social) => ({
                  id: social,
                  label: PED_SOCIAL_LABELS[social],
                }))}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Responsabile</Label>
              <NativeSelectField
                fullWidth
                name="assigneeId"
                defaultValue={editing?.assigneeId ?? NO_ASSIGNEE}
                items={[
                  { value: NO_ASSIGNEE, label: "Nessun responsabile" },
                  ...members.map((member) => ({
                    value: member.id,
                    label: member.name,
                  })),
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ped-script">Testo / script</Label>
              <Textarea
                id="ped-script"
                name="script"
                rows={6}
                defaultValue={editing?.script ?? ""}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter className="sm:justify-between">
            {editing ? (
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                    />
                  }
                >
                  Elimina
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Eliminare “{editing.title}”?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      L&apos;operazione non è reversibile.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Annulla</AlertDialogCancel>
                    <AlertDialogAction
                      type="button"
                      variant="destructive"
                      disabled={deletePending}
                      onClick={handleDelete}
                    >
                      Elimina
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending || noClients}>
              {pending ? "Salvataggio..." : "Salva"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
