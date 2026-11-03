"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import {
  eventTouchesDay,
  formatTime,
  isSameDay,
  layoutOverlappingEvents,
  minutesFromMidnight,
  shortDayLabel,
} from "@/lib/calendar-utils";
import { eventTypeStyle } from "./types";
import type { CalendarEventData } from "./types";

const HOUR_HEIGHT = 48;
const HOURS = Array.from({ length: 24 }, (_, i) => i);

export function TimeGrid({
  days,
  events,
  onSelectEvent,
  pageScroll = false,
}: {
  days: Date[];
  events: CalendarEventData[];
  onSelectEvent: (event: CalendarEventData) => void;
  // Vista giorno: la griglia non ha altezza massima né scroll interno, scorre
  // solo la pagina (niente doppia barra, soprattutto su iPhone).
  pageScroll?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    if (pageScroll) {
      startRef.current?.scrollIntoView({ block: "start" });
    } else {
      scrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT - 24 });
    }
  }, [pageScroll]);

  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden surface">
      <div
        className="grid border-b bg-muted/40 text-xs"
        style={{ gridTemplateColumns: columns }}
      >
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="border-l px-2 py-2 text-center"
          >
            <div className="text-muted-foreground">{shortDayLabel(day)}</div>
            <div
              className={cn(
                "mx-auto mt-0.5 flex size-6 items-center justify-center rounded-full font-medium",
                isSameDay(day, today) && "bg-primary text-primary-foreground"
              )}
            >
              {day.getDate()}
            </div>
          </div>
        ))}
      </div>

      <div
        ref={scrollRef}
        className={pageScroll ? undefined : "max-h-[600px] overflow-y-auto"}
      >
        <div
          className="relative grid"
          style={{ gridTemplateColumns: columns }}
        >
          {pageScroll && (
            <div
              ref={startRef}
              aria-hidden
              className="pointer-events-none absolute inset-x-0"
              style={{ top: 7 * HOUR_HEIGHT - 24 }}
            />
          )}
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-2 text-2xs text-muted-foreground"
                style={{ top: h * HOUR_HEIGHT }}
              >
                {String(h).padStart(2, "0")}:00
              </div>
            ))}
          </div>

          {days.map((day) => {
            const dayEvents = events.filter((e) => eventTouchesDay(e, day));
            const positioned = layoutOverlappingEvents(dayEvents);

            return (
              <div
                key={day.toISOString()}
                className="relative border-l"
                style={{ height: HOUR_HEIGHT * 24 }}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    className="absolute inset-x-0 border-t"
                    style={{ top: h * HOUR_HEIGHT }}
                  />
                ))}
                {positioned.map(({ event, col, totalCols }) => {
                  // Eventi multi-giorno: nei giorni successivi al primo il
                  // blocco parte da mezzanotte; nell'ultimo finisce all'ora di
                  // fine, nei giorni intermedi copre tutta la colonna.
                  const start = isSameDay(event.startAt, day)
                    ? minutesFromMidnight(event.startAt)
                    : 0;
                  const end = isSameDay(event.endAt, day)
                    ? minutesFromMidnight(event.endAt)
                    : 24 * 60;
                  const top = (start / 60) * HOUR_HEIGHT;
                  const height = Math.max(((end - start) / 60) * HOUR_HEIGHT, 20);
                  const width = 100 / totalCols;
                  const style = eventTypeStyle(event.type);

                  return (
                    // Contenitore opaco (bg-card) sopra le linee delle ore: la
                    // tinta semitrasparente del chip sta sopra e le linee non
                    // si vedono attraverso l'evento.
                    <div
                      key={event.id}
                      className="absolute z-10 rounded-sm bg-card"
                      style={{
                        top,
                        height,
                        left: `calc(${col * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectEvent(event)}
                        className={cn(
                          "block size-full overflow-hidden rounded-sm border px-1.5 py-0.5 text-left text-2xs leading-tight",
                          style.chip
                        )}
                      >
                        <span className="font-medium">{event.title}</span>
                        <span className="block text-3xs opacity-80">
                          {formatTime(event.startAt)}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
