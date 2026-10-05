"use client";

import { useState } from "react";
import { Plus, TriangleAlert } from "lucide-react";
import { createLeaveRequest } from "@/lib/actions";
import {
  LEAVE_TYPE_HINTS,
  LEAVE_TYPE_LABELS,
  NOTE_REQUIRED_LEAVE_TYPES,
  leaveTypesFor,
  type EmploymentType,
  type LeaveType,
} from "@/lib/constants";
import type { OpenRecoveryCredit } from "@/lib/recovery-credits";
import type { RemainingByLeaveType } from "@/lib/leave-balance";
import { countedLeaveDays } from "@/lib/leave-days";
import { formatAmount } from "@/lib/leave-format";
import { SegmentedButtonTabs } from "@/components/SegmentedLinkTabs";
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
  recoveryCredits = [],
  remaining = {},
}: {
  // Tipo di rapporto della persona per cui si registra la richiesta.
  employmentType: EmploymentType;
  // Valorizzato solo nella scheda membro (/team/[id]): un admin registra
  // la richiesta per conto di quel membro, che nasce già approvata/registrata.
  targetUserId?: string;
  // Recuperi da fare ancora aperti, tra cui scegliere per una richiesta di recupero.
  recoveryCredits?: OpenRecoveryCredit[];
  // Residuo dei monti, per avvisare se la richiesta manda il saldo in negativo.
  remaining?: RemainingByLeaveType;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Dipendenti: ferie/permesso/recupero/malattia. Partite IVA: assenza
  // (scala il monte unico), recupero e assenza extra (fuori monte).
  const types = leaveTypesFor(employmentType);
  const [type, setType] = useState<LeaveType>(types[0]);
  // Solo per il recupero: a giorni (periodo) o a ore (un giorno).
  const [unit, setUnit] = useState<"giorni" | "ore">("giorni");
  // Recupero da fare che si sta smaltendo ("" = altro, motivo nella nota).
  const [creditId, setCreditId] = useState(recoveryCredits[0]?.id ?? "");
  const credit =
    type === "recupero" ? recoveryCredits.find((c) => c.id === creditId) ?? null : null;
  const effectiveUnit = credit ? credit.unit : unit;

  const isHourly = type === "permesso" || (type === "recupero" && effectiveUnit === "ore");
  const noteRequired = NOTE_REQUIRED_LEAVE_TYPES.includes(type) && !credit;

  // Saldo dopo questa richiesta, se il tipo scala un monte: andare in
  // negativo è permesso, ma va detto prima di inviare.
  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [hours, setHours] = useState("");
  const typeRemaining = remaining[type as keyof RemainingByLeaveType];
  const requested = isHourly
    ? Number(hours) || 0
    : startDate && endDate && endDate >= startDate
      ? countedLeaveDays(startDate, endDate)
      : 0;
  const after =
    typeRemaining !== undefined && requested > 0
      ? Math.round((typeRemaining - requested) * 100) / 100
      : null;

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
          setType(types[0]);
          setUnit("giorni");
          setCreditId(recoveryCredits[0]?.id ?? "");
          setStartDate(undefined);
          setEndDate(undefined);
          setHours("");
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
            <div className="flex flex-col gap-1.5">
              <Label>Tipo</Label>
              <NativeSelectField
                fullWidth
                name="type"
                defaultValue={types[0]}
                onValueChange={(value) => setType(value as LeaveType)}
                items={types.map((leaveType) => ({
                  value: leaveType,
                  label: LEAVE_TYPE_LABELS[leaveType],
                }))}
              />
              {LEAVE_TYPE_HINTS[type] && (
                <p className="text-xs text-muted-foreground">{LEAVE_TYPE_HINTS[type]}</p>
              )}
            </div>

            {type === "recupero" && recoveryCredits.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Cosa stai recuperando</Label>
                <NativeSelectField
                  fullWidth
                  name="recoveryCreditId"
                  defaultValue={creditId}
                  onValueChange={setCreditId}
                  items={[
                    ...recoveryCredits.map((c) => ({
                      value: c.id,
                      label: `${c.reason} · restano ${c.remaining.toLocaleString("it-IT")} ${c.unit === "ore" ? "h" : "gg"}`,
                    })),
                    { value: "", label: "Altro (scrivi il motivo nella nota)" },
                  ]}
                />
              </div>
            )}

            {type === "recupero" && !credit && (
              <div className="flex flex-col gap-1.5">
                <input type="hidden" name="unit" value={unit} />
                <SegmentedButtonTabs
                  items={[
                    { key: "giorni", label: "A giorni" },
                    { key: "ore", label: "A ore" },
                  ]}
                  value={unit}
                  onChange={setUnit}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-request-startDate">{isHourly ? "Data" : "Dal"}</Label>
              <DateField
                id="new-request-startDate"
                name="startDate"
                className="w-full"
                onValueChange={setStartDate}
              />
            </div>

            {isHourly ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-request-hours">Ore</Label>
                <Input
                  id="new-request-hours"
                  name="hours"
                  type="number"
                  min="0.5"
                  step="0.5"
                  required
                  value={hours}
                  onChange={(event) => setHours(event.target.value)}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-request-endDate">Al</Label>
                <DateField
                  id="new-request-endDate"
                  name="endDate"
                  className="w-full"
                  onValueChange={setEndDate}
                />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-request-note">
                {noteRequired ? "Nota (obbligatoria)" : "Nota"}
              </Label>
              <Input
                id="new-request-note"
                name="note"
                required={noteRequired}
                placeholder={noteRequired ? "Es. trasferta Milano 12/10" : undefined}
              />
            </div>

            {after !== null && after < 0 && (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Con questa richiesta il saldo va in negativo: {formatAmount(after)}{" "}
                {type === "permesso" ? "h" : "gg"}. Puoi comunque inviarla.
              </p>
            )}

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
