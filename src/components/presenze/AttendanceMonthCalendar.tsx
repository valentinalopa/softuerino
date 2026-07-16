"use client";

import { useMemo, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { addDays, isSameDay, startOfMonth, startOfWeek } from "@/lib/calendar-utils";
import { dateKey, lookupAttendance, type DayEntry } from "@/lib/attendance-utils";
import { createPresenceEntries, deletePresenceEntries } from "@/lib/actions";
import {
  PRESENCE_SLOTS,
  PRESENCE_SLOT_LABELS,
  PRESENCE_MODES,
  PRESENCE_MODE_LABELS,
  type PresenceMode,
  type PresenceSlot,
} from "@/lib/constants";
import { NativeSelectField } from "@/components/form/native-select-field";
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
import { MonthNav } from "./MonthNav";
import { AttendanceDayContent } from "./AttendanceDayContent";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Chiave di selezione: ogni box (fascia oraria) di un giorno è selezionabile
// singolarmente. Le celle vuote usano lo slot fittizio "_empty".
const EMPTY_SLOT = "_empty";
type SelectionSlot = PresenceSlot | typeof EMPTY_SLOT;

function makeSelectionKey(date: string, slot: SelectionSlot) {
  return `${date}::${slot}`;
}

function parseSelectionKey(key: string): { date: string; slot: SelectionSlot } {
  const [date, slot] = key.split("::");
  return { date, slot: slot as SelectionSlot };
}

export function AttendanceMonthCalendar({
  current,
  userId,
  entries,
  editable = false,
  todayHref,
  prevHref,
  nextHref,
  monthLabel,
}: {
  current: Date;
  userId: string;
  entries: [string, DayEntry][];
  editable?: boolean;
  todayHref: string;
  prevHref: string;
  nextHref: string;
  monthLabel: string;
}) {
  const map = useMemo(() => new Map(entries), [entries]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [slot, setSlot] = useState<string>(PRESENCE_SLOTS[2]);
  const [mode, setMode] = useState<string>(PRESENCE_MODES[0]);
  const [error, setError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const monthStart = startOfMonth(current);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const canDelete =
    selected.size > 0 &&
    Array.from(selected).every((key) => parseSelectionKey(key).slot !== EMPTY_SLOT);

  function toggleSelection(date: string, selectionSlot: SelectionSlot, syncMode?: PresenceMode) {
    setError(null);
    const key = makeSelectionKey(date, selectionSlot);

    if (selectionSlot === EMPTY_SLOT) {
      // Le celle vuote si possono selezionare insieme, ma un box già
      // selezionato deve prima essere sostituito (mai box + cella insieme).
      const hasBoxSelected = Array.from(selected).some(
        (k) => parseSelectionKey(k).slot !== EMPTY_SLOT
      );
      if (hasBoxSelected) {
        setSelected(new Set([key]));
        return;
      }
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
        return next;
      });
      return;
    }

    // Un box esistente si seleziona sempre da solo: cliccarne un altro
    // sostituisce l'intera selezione, non si accumula.
    const isSameSingleSelection = selected.size === 1 && selected.has(key);
    setSelected(isSameSingleSelection ? new Set() : new Set([key]));
    if (!isSameSingleSelection && syncMode) {
      setSlot(selectionSlot);
      setMode(syncMode);
    }
  }

  function applySelection() {
    setError(null);
    const parsed = Array.from(selected).map(parseSelectionKey);
    const dates = Array.from(new Set(parsed.map((item) => item.date)));
    // Box esistenti selezionati con una fascia diversa da quella scelta:
    // vanno sostituiti (rimossi nella stessa transazione), non affiancati.
    const replace = parsed
      .filter((item) => item.slot !== EMPTY_SLOT && item.slot !== slot)
      .map((item) => ({ date: item.date, slot: item.slot }));
    startTransition(async () => {
      try {
        const result = await createPresenceEntries({ userId, dates, slot, mode, replace });
        if (result?.error) {
          setError(result.error);
          return;
        }
        setSelected(new Set());
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  function deleteSelection() {
    setError(null);
    const items = Array.from(selected)
      .map(parseSelectionKey)
      .filter((item) => item.slot !== EMPTY_SLOT)
      .map((item) => ({ date: item.date, slot: item.slot }));
    startTransition(async () => {
      try {
        const result = await deletePresenceEntries({ userId, items });
        if (result?.error) {
          setError(result.error);
          return;
        }
        setSelected(new Set());
        setDeleteConfirmOpen(false);
      } catch {
        setError("Errore imprevisto");
      }
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          todayHref={todayHref}
          prevHref={prevHref}
          nextHref={nextHref}
          monthLabel={monthLabel}
        />

        {editable && selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-2.5 py-1.5 ring-1 ring-foreground/10">
            <span className="text-sm font-medium">
              {selected.size}{" "}
              {selected.size === 1 ? "elemento selezionato" : "elementi selezionati"}
            </span>
            <NativeSelectField
              key={slot}
              name="slot"
              defaultValue={slot}
              onValueChange={(value) => setSlot(value as PresenceSlot)}
              items={PRESENCE_SLOTS.map((s) => ({
                value: s,
                label: PRESENCE_SLOT_LABELS[s],
              }))}
            />
            <NativeSelectField
              key={mode}
              name="mode"
              defaultValue={mode}
              onValueChange={(value) => setMode(value as PresenceMode)}
              items={PRESENCE_MODES.map((m) => ({
                value: m,
                label: PRESENCE_MODE_LABELS[m],
              }))}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Annulla
            </Button>
            {canDelete && (
              <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <AlertDialogTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                    />
                  }
                >
                  Elimina
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Eliminare {selected.size === 1 ? "la presenza selezionata" : `le ${selected.size} presenze selezionate`}?
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
                      disabled={pending}
                      onClick={deleteSelection}
                    >
                      Elimina
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            <Button type="button" size="sm" onClick={applySelection} disabled={pending}>
              Applica
            </Button>
          </div>
        )}
      </div>
      {editable && error && (
        <p className="text-right text-sm text-destructive">{error}</p>
      )}

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = day.getMonth() === current.getMonth();
            const isToday = isSameDay(day, today);
            const entry = lookupAttendance(map, userId, day);
            const key = dateKey(day);
            const hasContent = Boolean(entry && entry.presences.length > 0);
            const selectable = editable && inMonth && !entry?.leave;
            const cellSelectable = selectable && !hasContent;
            const isEmptySelected = selected.has(makeSelectionKey(key, EMPTY_SLOT));

            return (
              <div
                key={key}
                role={cellSelectable ? "button" : undefined}
                tabIndex={cellSelectable ? 0 : undefined}
                aria-pressed={cellSelectable ? isEmptySelected : undefined}
                onClick={cellSelectable ? () => toggleSelection(key, EMPTY_SLOT) : undefined}
                onKeyDown={
                  cellSelectable
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleSelection(key, EMPTY_SLOT);
                        }
                      }
                    : undefined
                }
                className={cn(
                  "flex min-h-[110px] flex-col gap-1 border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0",
                  !inMonth && "bg-muted/20",
                  cellSelectable &&
                    "cursor-pointer outline-none transition-colors hover:bg-accent/40 focus-visible:bg-accent/40",
                  cellSelectable &&
                    isEmptySelected &&
                    "bg-primary/10 ring-2 ring-inset ring-primary hover:bg-primary/15"
                )}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs",
                    !inMonth && "text-muted-foreground",
                    isToday && "bg-primary font-medium text-primary-foreground"
                  )}
                >
                  {day.getDate()}
                </span>
                <AttendanceDayContent
                  entry={inMonth ? entry : undefined}
                  interactive={selectable && hasContent}
                  isSlotSelected={(s) => selected.has(makeSelectionKey(key, s))}
                  onToggleSlot={(s, m) => toggleSelection(key, s, m)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
