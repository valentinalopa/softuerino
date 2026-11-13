"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Info, Plus, TriangleAlert } from "lucide-react";
import { createLeaveRequest, updateOwnLeaveRequest } from "@/lib/actions";
import {
  LEAVE_TYPE_HINTS,
  LEAVE_TYPE_LABELS,
  NOTE_REQUIRED_LEAVE_TYPES,
  OPTIONAL_HOURLY_LEAVE_TYPES,
  isSensitiveLeave,
  leaveTypesFor,
  type EmploymentType,
  type LeaveType,
} from "@/lib/constants";
import type { OpenRecoveryCredit } from "@/lib/recovery-credits";
import { availableAt, chargeAmount, chargeFor, type LeaveCharges } from "@/lib/leave-accrual";
import { countedLeaveDays, isWorkingDay } from "@/lib/leave-days";
import { formatAmount, hoursBetween } from "@/lib/leave-format";
import { SegmentedButtonTabs } from "@/components/SegmentedLinkTabs";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { NativeSelectField } from "@/components/form/native-select-field";
import { DateField } from "@/components/form/date-field";
import { TimeField } from "@/components/form/time-field";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { submitKeepingValues } from "@/components/form/submit-keeping-values";
import { unexpectedErrorMessage } from "@/lib/action-error";
import { toast } from "@/lib/toast";
import { TONE_SOFT } from "@/lib/tones";

// Richiesta in attesa che chi l'ha fatta sta modificando.
export type EditableLeaveRequest = {
  id: string;
  type: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  recoveryCreditId?: string | null;
};

export function NewLeaveRequestDialog({
  employmentType,
  targetUserId,
  recoveryCredits = [],
  charges = {},
  editing,
  trigger,
}: {
  // Tipo di rapporto della persona per cui si registra la richiesta.
  employmentType: EmploymentType;
  // Valorizzato solo nella scheda membro (/team/[id]): un admin registra
  // la richiesta per conto di quel membro, che nasce già approvata/registrata.
  targetUserId?: string;
  // Recuperi da fare ancora aperti, tra cui scegliere per una richiesta di recupero.
  recoveryCredits?: OpenRecoveryCredit[];
  // Saldi che i tipi di richiesta scalano (leave-accrual.ts), per dire quanto
  // scala la richiesta e avvisare se manda il saldo in negativo.
  charges?: LeaveCharges;
  // Modifica di una propria richiesta in attesa (al posto di una nuova).
  editing?: EditableLeaveRequest;
  // Pulsante che apre il pannello (default: "Nuova richiesta").
  trigger?: React.ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Dipendenti: ferie/permesso/recupero/malattia. Partite IVA: assenza
  // (scala il monte unico), recupero e assenza extra (fuori monte). La
  // malattia non passa dall'approvazione: non si modifica da qui.
  const types = leaveTypesFor(employmentType).filter((t) => !editing || t !== "malattia");
  const initialType = (editing && types.includes(editing.type as LeaveType) ? editing.type : types[0]) as LeaveType;
  const initialCreditId = editing ? (editing.recoveryCreditId ?? "") : (recoveryCredits[0]?.id ?? "");
  const initialUnit: "giorni" | "ore" =
    editing && OPTIONAL_HOURLY_LEAVE_TYPES.includes(editing.type as LeaveType) && editing.hours !== null
      ? "ore"
      : "giorni";
  const [type, setType] = useState<LeaveType>(initialType);
  // Recupero e assenza: a giorni (periodo) o a ore (un giorno).
  const [unit, setUnit] = useState<"giorni" | "ore">(initialUnit);
  // Recupero da fare che si sta smaltendo ("" = altro, motivo nella nota).
  const [creditId, setCreditId] = useState(initialCreditId);
  const credit =
    type === "recupero" ? recoveryCredits.find((c) => c.id === creditId) ?? null : null;
  const effectiveUnit = credit ? credit.unit : unit;

  const canBeHourly = OPTIONAL_HOURLY_LEAVE_TYPES.includes(type);
  const isHourly = type === "permesso" || (canBeHourly && effectiveUnit === "ore");
  const noteRequired = NOTE_REQUIRED_LEAVE_TYPES.includes(type) && !credit;

  // Saldo dopo questa richiesta, se il tipo scala un monte: andare in
  // negativo è permesso, ma va detto prima di inviare.
  const [startDate, setStartDate] = useState<Date | undefined>(editing?.startDate);
  const [endDate, setEndDate] = useState<Date | undefined>(editing?.endDate);
  const [startTime, setStartTime] = useState(editing?.startTime ?? "");
  const [endTime, setEndTime] = useState(editing?.endTime ?? "");
  // Durata della fascia (null finché non è completa e valida).
  const slotHours = startTime && endTime ? hoursBetween(startTime, endTime) : null;
  const info = chargeFor(charges, type);
  const days =
    !isHourly && startDate && endDate && endDate >= startDate ? countedLeaveDays(startDate, endDate) : 0;
  // A ore in un giorno festivo o nel weekend: non scala niente (e il server
  // non la accetta).
  const dayOff = isHourly && startDate !== undefined && !isWorkingDay(startDate);
  const requested = info
    ? chargeAmount(info, { days, hours: isHourly ? (dayOff ? 0 : (slotHours ?? 0)) : null })
    : 0;
  // Disponibile alla fine della richiesta, con quanto sarà maturato fino ad allora.
  const lastDay = isHourly ? startDate : endDate;
  const after =
    info && lastDay && requested > 0
      ? Math.round((availableAt(info, lastDay) - requested) * 100) / 100
      : null;
  // Un permesso più lungo di una giornata scala comunque una giornata.
  const overDailyCap =
    info?.maxPerDay != null && slotHours !== null && slotHours > info.maxPerDay ? info.maxPerDay : null;

  async function handleSubmit(formData: FormData) {
    setError(null);
    setPending(true);
    try {
      const result = editing
        ? await updateOwnLeaveRequest(editing.id, formData)
        : await createLeaveRequest(formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast(editing ? "Richiesta modificata" : "Richiesta inviata");
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
          setType(initialType);
          setUnit(initialUnit);
          setCreditId(initialCreditId);
          setStartDate(editing?.startDate);
          setEndDate(editing?.endDate);
          setStartTime(editing?.startTime ?? "");
          setEndTime(editing?.endTime ?? "");
        }
      }}
    >
      {trigger ? (
        <SheetTrigger render={trigger} />
      ) : (
        <SheetTrigger render={<Button type="button" />}>
          <Plus className="size-4" />
          Nuova richiesta
        </SheetTrigger>
      )}
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{editing ? "Modifica richiesta" : "Nuova richiesta"}</SheetTitle>
        </SheetHeader>
        <form onSubmit={submitKeepingValues(handleSubmit)} className="flex min-h-0 flex-1 flex-col">
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
                defaultValue={initialType}
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
                  defaultValue={initialCreditId}
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

            {canBeHourly && !credit && (
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
                defaultValue={editing ? format(editing.startDate, "yyyy-MM-dd") : undefined}
                onValueChange={setStartDate}
              />
            </div>

            {isHourly ? (
              <div className="flex flex-col gap-1.5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-request-startTime">Dalle</Label>
                    <input type="hidden" name="startTime" value={startTime} />
                    <TimeField
                      id="new-request-startTime"
                      value={startTime}
                      onChange={setStartTime}
                      className="w-full"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="new-request-endTime">Alle</Label>
                    <input type="hidden" name="endTime" value={endTime} />
                    <TimeField
                      id="new-request-endTime"
                      value={endTime}
                      onChange={setEndTime}
                      className="w-full"
                    />
                  </div>
                </div>
                {startTime && endTime && (
                  <p
                    className={`text-xs ${slotHours === null ? "text-destructive" : "text-muted-foreground"}`}
                  >
                    {slotHours === null
                      ? "L'orario di fine deve seguire quello di inizio."
                      : `Totale: ${formatAmount(slotHours)} ${slotHours === 1 ? "ora" : "ore"}`}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="new-request-endDate">Al</Label>
                <DateField
                  id="new-request-endDate"
                  name="endDate"
                  className="w-full"
                  defaultValue={editing ? format(editing.endDate, "yyyy-MM-dd") : undefined}
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
                defaultValue={editing?.note ?? undefined}
                required={noteRequired}
                placeholder={noteRequired ? "Es. trasferta Milano 12/10" : undefined}
              />
              {/* Privacy: la malattia è un dato sanitario, in nota non ci vanno diagnosi. */}
              <p
                data-testid="leave-note-health-warning"
                className={
                  isSensitiveLeave(type)
                    ? `rounded-lg px-3 py-2 text-sm font-medium ${TONE_SOFT.warning}`
                    : "text-xs text-muted-foreground"
                }
              >
                Non indicare diagnosi né altre informazioni sanitarie.
              </p>
            </div>

            {(dayOff || (!isHourly && startDate && endDate && endDate >= startDate && days === 0)) && (
              <p className="text-xs text-destructive">
                Solo weekend o festivi: non serve chiederli, non pesano su ferie, permessi o assenze.
              </p>
            )}

            {info && requested > 0 && (
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Scala {formatAmount(requested)} {info.unit === "h" ? "ore" : requested === 1 ? "giorno" : "giorni"}
                  {info.perDay !== null && days > 0
                    ? ` (${formatAmount(days)} ${days === 1 ? "giorno" : "giorni"} × ${formatAmount(info.perDay)} h)`
                    : ""}
                  {info.dayHours !== null && isHourly && slotHours !== null
                    ? ` (${formatAmount(Math.min(slotHours, info.dayHours))} h su ${formatAmount(info.dayHours)} h di una giornata)`
                    : ""}
                  {after !== null && after >= 0
                    ? `: ne restano ${formatAmount(after)}.`
                    : "."}
                </span>
              </p>
            )}

            {overDailyCap !== null && (
              <p className="text-xs text-muted-foreground">
                Un permesso scala al massimo {formatAmount(overDailyCap)} ore, una giornata di
                lavoro: per la giornata intera conviene chiedere ferie.
              </p>
            )}

            {after !== null && after < 0 && (
              <p className="flex items-start gap-1.5 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" />
                Con questa richiesta il saldo va in negativo: {formatAmount(after)}{" "}
                {info?.unit === "h" ? "h" : "gg"}. Puoi comunque inviarla.
              </p>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </SheetBody>
          <SheetFooter>
            <Button type="submit" disabled={pending}>
              {pending ? "Invio..." : editing ? "Salva modifiche" : "Invia richiesta"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
