"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewEventDialog } from "./NewEventDialog";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventDetails } from "./EventDetails";
import { EditEventSheet } from "./EditEventSheet";
import { DayAbsences, type CalendarAbsence } from "./DayAbsences";
import type { CalendarEventData } from "./types";
import { dateKey } from "@/lib/attendance-utils";
import {
  addDays,
  addMonths,
  formatFullDate,
  formatMonthYear,
  formatWeekRange,
  startOfDay,
  startOfWeek,
} from "@/lib/calendar-utils";
import { SegmentedButtonTabs } from "@/components/SegmentedLinkTabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { MonthYearPicker } from "./MonthYearPicker";
import { useIsMobile } from "@/hooks/use-mobile";

type ViewMode = "month" | "week" | "day";

// Schermo largo (lg): dettaglio evento accanto al calendario invece che in un popup.
const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function readWide() {
  return window.matchMedia(WIDE_QUERY).matches;
}

const VIEW_LABELS: Record<ViewMode, string> = {
  day: "Giorno",
  week: "Settimana",
  month: "Mese",
};

export function CalendarView({
  events,
  absences,
  users,
  currentUserId,
  isAdmin,
  initialEventId,
}: {
  events: CalendarEventData[];
  // Assenze del team (non rifiutate), mostrate nel dettaglio del giorno.
  absences: CalendarAbsence[];
  users: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
  // Evento da aprire subito (link dalla dashboard): si parte dal suo giorno.
  initialEventId?: string;
}) {
  const initialEvent = initialEventId ? events.find((event) => event.id === initialEventId) : undefined;
  // Finché non si sceglie una vista: Mese su schermi larghi, Giorno sul
  // telefono (sette colonne strette rendono gli eventi illeggibili).
  const isMobile = useIsMobile();
  const [chosenView, setView] = useState<ViewMode | null>(null);
  const view = chosenView ?? (isMobile ? "day" : "month");
  const [current, setCurrent] = useState(() => startOfDay(initialEvent?.startAt ?? new Date()));
  // Si tiene l'id, non l'evento: dopo una modifica il dettaglio mostra i dati
  // aggiornati, e se l'evento sparisce (eliminato) il dettaglio si chiude.
  const [selectedId, setSelectedId] = useState<string | null>(initialEvent?.id ?? null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const selected = events.find((event) => event.id === selectedId) ?? null;
  const editing = events.find((event) => event.id === editingId) ?? null;
  const isWide = useSyncExternalStore(subscribeWide, readWide, () => true);

  function setSelected(event: CalendarEventData | null) {
    setSelectedId(event?.id ?? null);
  }

  function canManage(event: CalendarEventData) {
    return (
      isAdmin ||
      event.createdById === currentUserId ||
      event.participants.some((p) => p.user.id === currentUserId)
    );
  }

  function goToday() {
    setCurrent(startOfDay(new Date()));
  }

  function step(direction: 1 | -1) {
    setCurrent((d) => {
      if (view === "month") return addMonths(d, direction);
      if (view === "week") return addDays(d, 7 * direction);
      return addDays(d, direction);
    });
  }

  function openDay(date: Date) {
    setCurrent(date);
    setView("day");
  }

  const periodLabel = useMemo(() => {
    if (view === "month") return formatMonthYear(current);
    if (view === "week") return formatWeekRange(startOfWeek(current));
    return formatFullDate(current);
  }, [view, current]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={goToday}>
            Oggi
          </Button>
          <div className="flex items-center">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => step(-1)}
              aria-label="Periodo precedente"
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={() => step(1)}
              aria-label="Periodo successivo"
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
          {/* Titolo cliccabile: scelta di mese e anno, poi vista del mese. */}
          <MonthYearPicker
            label={periodLabel}
            year={current.getFullYear()}
            month={current.getMonth()}
            onSelect={(y, m) => {
              setCurrent(new Date(y, m, 1));
              setView("month");
            }}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SegmentedButtonTabs
            items={(Object.keys(VIEW_LABELS) as ViewMode[]).map((mode) => ({
              key: mode,
              label: VIEW_LABELS[mode],
            }))}
            value={view}
            onChange={setView}
          />
          <NewEventDialog
            users={users}
            absences={absences}
            defaultStart={toDateTimeLocal(current)}
          />
        </div>
      </div>

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {view === "month" && (
            <MonthView
              current={current}
              events={events}
              onSelectDay={openDay}
              onSelectEvent={setSelected}
            />
          )}
          {view === "week" && (
            <WeekView
              current={current}
              events={events}
              onSelectEvent={setSelected}
            />
          )}
          {view === "day" && <DayAbsences day={current} absences={absences} />}
          {view === "day" && (
            <DayView
              current={current}
              events={events}
              onSelectEvent={setSelected}
            />
          )}
        </div>
        {selected && isWide && (
          <EventDetails
            event={selected}
            onClose={() => setSelected(null)}
            onEdit={() => setEditingId(selected.id)}
            canManage={canManage(selected)}
          />
        )}
      </div>

      {/* Mobile e tablet: il dettaglio in un popup, il calendario resta intero. */}
      <Dialog open={selected !== null && !isWide} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle className="sr-only">{selected?.title ?? "Evento"}</DialogTitle>
          {selected && (
            <EventDetails
              event={selected}
              onClose={() => setSelected(null)}
              onEdit={() => setEditingId(selected.id)}
              canManage={canManage(selected)}
              inDialog
            />
          )}
        </DialogContent>
      </Dialog>

      <EditEventSheet
        event={editing}
        users={users}
        absences={absences}
        onClose={() => setEditingId(null)}
      />
    </div>
  );
}

function toDateTimeLocal(date: Date) {
  return `${dateKey(date)}T09:00`;
}
