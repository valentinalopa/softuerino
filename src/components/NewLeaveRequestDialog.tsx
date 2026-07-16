"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createLeaveRequest } from "@/lib/actions";
import {
  DIPENDENTE_LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  type EmploymentType,
  type LeaveType,
} from "@/lib/constants";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
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

export function NewLeaveRequestDialog({
  employmentType,
  targetUserId,
}: {
  // Tipo di rapporto della persona per cui si registra la richiesta.
  employmentType: EmploymentType;
  // Valorizzato solo nella scheda membro (/team/[id]): il super admin registra
  // la richiesta per conto di quel membro, che nasce già approvata/registrata.
  targetUserId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [type, setType] = useState<LeaveType>("ferie");

  // Le partite IVA non distinguono ferie/permesso/malattia: un solo tipo
  // "assenza" che scala l'unico monte di 30 giorni.
  const isAssenze = employmentType === "partita_iva";
  const isPermesso = !isAssenze && type === "permesso";

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createLeaveRequest(formData);
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
        if (next) {
          setError(null);
          setType("ferie");
        }
      }}
    >
      <SheetTrigger render={<Button type="button" />}>
        <Plus className="size-4" />
        Nuova richiesta
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuova richiesta</SheetTitle>
        </SheetHeader>
        <form action={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            {targetUserId && (
              <>
                <input type="hidden" name="userId" value={targetUserId} />
                <p className="text-xs text-muted-foreground">
                  Stai registrando per conto di questo membro: la richiesta
                  risulterà già approvata.
                </p>
              </>
            )}
            {isAssenze ? (
              <input type="hidden" name="type" value="assenza" />
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label>Tipo</Label>
                <NativeSelectField
                  fullWidth
                  name="type"
                  defaultValue="ferie"
                  onValueChange={(value) => setType(value as LeaveType)}
                  items={DIPENDENTE_LEAVE_TYPES.map((leaveType) => ({
                    value: leaveType,
                    label: LEAVE_TYPE_LABELS[leaveType],
                  }))}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-request-startDate">{isPermesso ? "Data" : "Dal"}</Label>
              <DateField id="new-request-startDate" name="startDate" className="w-full" />
            </div>

            {isPermesso ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-request-hours">Ore</Label>
                <Input
                  id="new-request-hours"
                  name="hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  required
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-request-endDate">Al</Label>
                <DateField id="new-request-endDate" name="endDate" className="w-full" />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-request-note">Nota</Label>
              <Input id="new-request-note" name="note" />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Invio..." : "Invia richiesta"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
