"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createCompanyClosure, deleteCompanyClosure } from "@/lib/actions";
import { countedLeaveDays } from "@/lib/leave-days";
import { formatRange } from "@/lib/leave-format";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { DateField } from "@/components/form/date-field";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";

export type CompanyClosureRow = {
  id: string;
  startDate: Date;
  endDate: Date;
  note: string | null;
};

// Giorni che la chiusura scala: weekend e feste comandate esclusi.
function closureDays(closure: { startDate: Date; endDate: Date }) {
  const days = countedLeaveDays(closure.startDate, closure.endDate);
  return `${days} ${days === 1 ? "giorno" : "giorni"}`;
}

export function NewCompanyClosureDialog() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = await createCompanyClosure(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast("Chiusura aziendale salvata");
    } catch (error) {
      setError(unexpectedErrorMessage(error));
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
          setStartDate(undefined);
          setEndDate(undefined);
        }
      }}
    >
      <SheetTrigger render={<Button type="button" />}>
        <Plus className="size-4" />
        Nuova chiusura
      </SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Nuova chiusura aziendale</SheetTitle>
        </SheetHeader>
        <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Vale per tutto il team: scala le ferie dei dipendenti e le assenze delle partite IVA.
              Sabati, domeniche e feste comandate non vengono scalati.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-closure-startDate">Dal</Label>
              <DateField
                id="new-closure-startDate"
                name="startDate"
                className="w-full"
                onValueChange={setStartDate}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-closure-endDate">Al</Label>
              <DateField
                id="new-closure-endDate"
                name="endDate"
                className="w-full"
                onValueChange={setEndDate}
              />
              {startDate && endDate && endDate >= startDate && (
                <p className="text-xs text-muted-foreground">
                  Scala {closureDays({ startDate, endDate })} a persona.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-closure-note">Nota</Label>
              <Input id="new-closure-note" name="note" placeholder="Es. chiusura estiva" />
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Salvataggio..." : "Salva chiusura"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function CompanyClosuresTable({ closures }: { closures: CompanyClosureRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Quando</TableHead>
          <TableHead>Giorni scalati</TableHead>
          <TableHead>Nota</TableHead>
          <TableHead className="text-right">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {closures.length === 0 ? (
          <TableRow>
            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
              Nessuna chiusura aziendale.
            </TableCell>
          </TableRow>
        ) : (
          closures.map((closure) => (
            <TableRow key={closure.id}>
              <TableCell>{formatRange(closure.startDate, closure.endDate)}</TableCell>
              <TableCell>{closureDays(closure)}</TableCell>
              <TableCell className="text-muted-foreground">{closure.note ?? "—"}</TableCell>
              <TableCell className="text-right">
                <ConfirmDeleteButton
                  successMessage="Chiusura eliminata"
                  label={`Elimina chiusura ${formatRange(closure.startDate, closure.endDate)}`}
                  title="Eliminare la chiusura aziendale?"
                  description={`${formatRange(closure.startDate, closure.endDate)}. La chiusura sparisce dai calendari di tutto il team e i saldi ferie/assenze si ricalcolano.`}
                  onConfirm={() => deleteCompanyClosure(closure.id)}
                />
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
