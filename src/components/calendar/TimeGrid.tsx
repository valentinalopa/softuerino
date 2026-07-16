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
}: {
  days: Date[];
  events: CalendarEventData[];
  onSelectEvent: (event: CalendarEventData) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const today = new Date();

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 7 * HOUR_HEIGHT - 24 });
  }, []);

  const columns = `56px repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
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

      <div ref={scrollRef} className="max-h-[600px] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="relative" style={{ height: HOUR_HEIGHT * 24 }}>
            {HOURS.map((h) => (
              <div
                key={h}
                className="absolute right-2 -translate-y-2 text-[11px] text-muted-foreground"
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
                    <button
                      key={event.id}
                      type="button"
                      onClick={() => onSelectEvent(event)}
                      className={cn(
                        "absolute overflow-hidden rounded-[0.4rem] border px-1.5 py-0.5 text-left text-[11px] leading-tight",
                        style.chip
                      )}
                      style={{
                        top,
                        height,
                        left: `calc(${col * width}% + 2px)`,
                        width: `calc(${width}% - 4px)`,
                      }}
                    >
                      <span className="font-medium">{event.title}</span>
                      <span className="block text-[10px] opacity-80">
                        {formatTime(event.startAt)}
                      </span>
                    </button>
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
