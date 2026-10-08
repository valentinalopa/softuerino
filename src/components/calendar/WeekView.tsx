"use client";

import { addDays, formatTime, isSameDay, startOfWeek } from "@/lib/calendar-utils";
import { cn } from "@/lib/utils";
import { TimeGrid } from "./TimeGrid";
import { eventTypeStyle, type CalendarEventData } from "./types";

// Settimana: griglia oraria da md in su; su mobile un elenco giorno per giorno
// (sette colonne da 40 px non leggono un titolo).
export function WeekView({
  current,
  events,
  onSelectEvent,
}: {
  current: Date;
  events: CalendarEventData[];
  onSelectEvent: (event: CalendarEventData) => void;
}) {
  const weekStart = startOfWeek(current);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = new Date();

  return (
    <>
      <div className="hidden md:block">
        <TimeGrid days={days} events={events} onSelectEvent={onSelectEvent} />
      </div>
      <ol className="divide-y divide-border overflow-hidden rounded-2xl border border-surface-border bg-card md:hidden">
        {days.map((day) => {
          const dayEvents = events
            .filter((e) => isSameDay(e.startAt, day) || (e.startAt < day && e.endAt > day))
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
          return (
            <li key={day.toISOString()} className="flex gap-3 px-3 py-2.5">
              <div className="w-11 shrink-0 text-center">
                <p className="text-xs text-muted-foreground capitalize">
                  {new Intl.DateTimeFormat("it-IT", { weekday: "short" }).format(day)}
                </p>
                <p
                  className={cn(
                    "mx-auto flex size-7 items-center justify-center rounded-full text-sm font-semibold",
                    isSameDay(day, today) && "bg-primary text-primary-foreground"
                  )}
                >
                  {day.getDate()}
                </p>
              </div>
              <div className="min-w-0 flex-1 space-y-1.5 py-0.5">
                {dayEvents.length === 0 ? (
                  <p className="pt-1.5 text-xs text-muted-foreground">Nessun evento</p>
                ) : (
                  dayEvents.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => onSelectEvent(e)}
                      className={cn("block w-full rounded-lg border px-2.5 py-1.5 text-left", eventTypeStyle(e.type).chip)}
                    >
                      <span className="block text-xs opacity-80">
                        {formatTime(e.startAt)} – {formatTime(e.endAt)}
                      </span>
                      <span className="block text-sm font-medium break-words">{e.title}</span>
                    </button>
                  ))
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}
