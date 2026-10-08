"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NewEventDialog } from "./NewEventDialog";
import { MonthView } from "./MonthView";
import { WeekView } from "./WeekView";
import { DayView } from "./DayView";
import { EventDetails } from "./EventDetails";
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
}: {
  events: CalendarEventData[];
  // Assenze del team (non rifiutate), mostrate nel dettaglio del giorno.
  absences: CalendarAbsence[];
  users: { id: string; name: string }[];
  currentUserId: string;
  isAdmin: boolean;
}) {
  const [view, setView] = useState<ViewMode>("month");
  const [current, setCurrent] = useState(() => startOfDay(new Date()));
  const [selected, setSelected] = useState<CalendarEventData | null>(null);
  const isWide = useSyncExternalStore(subscribeWide, readWide, () => true);

  function canDelete(event: CalendarEventData) {
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
          <EventDetails event={selected} onClose={() => setSelected(null)} canDelete={canDelete(selected)} />
        )}
      </div>

      {/* Mobile e tablet: il dettaglio in un popup, il calendario resta intero. */}
      <Dialog open={selected !== null && !isWide} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogTitle className="sr-only">{selected?.title ?? "Evento"}</DialogTitle>
          {selected && (
            <EventDetails event={selected} onClose={() => setSelected(null)} canDelete={canDelete(selected)} inDialog />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function toDateTimeLocal(date: Date) {
  return `${dateKey(date)}T09:00`;
}
