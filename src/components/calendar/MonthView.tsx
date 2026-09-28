"use client";

import { cn } from "@/lib/utils";
import {
  addDays,
  eventTouchesDay,
  isSameDay,
  startOfMonth,
  startOfWeek,
} from "@/lib/calendar-utils";
import { eventTypeStyle } from "./types";
import type { CalendarEventData } from "./types";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export function MonthView({
  current,
  events,
  onSelectDay,
  onSelectEvent,
}: {
  current: Date;
  events: CalendarEventData[];
  onSelectDay: (date: Date) => void;
  onSelectEvent: (event: CalendarEventData) => void;
}) {
  const monthStart = startOfMonth(current);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  return (
    <div className="overflow-hidden surface">
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
          const dayEvents = events
            .filter((e) => eventTouchesDay(e, day))
            .sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
          const visible = dayEvents.slice(0, 3);
          const overflow = dayEvents.length - visible.length;

          return (
            <div
              key={day.toISOString()}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(day)}
              onKeyDown={(e) => {
                // Solo la cella stessa: i keydown dei chip evento interni
                // risalgono fin qui e non devono aprire la vista giorno.
                if (e.target !== e.currentTarget) return;
                if (e.key === "Enter" || e.key === " ") onSelectDay(day);
              }}
              className={cn(
                "flex min-h-[110px] cursor-pointer flex-col gap-1 border-b border-r p-1.5 text-left [&:nth-child(7n)]:border-r-0 hover:bg-muted/30",
                !inMonth && "bg-muted/20 text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs",
                  isToday && "bg-primary font-medium text-primary-foreground"
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-0.5">
                {visible.map((event) => {
                  const style = eventTypeStyle(event.type);
                  return (
                    <span
                      key={event.id}
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectEvent(event);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          e.stopPropagation();
                          onSelectEvent(event);
                        }
                      }}
                      className={cn(
                        "truncate rounded-sm border px-1.5 py-0.5 text-2xs",
                        style.chip
                      )}
                    >
                      {event.title}
                    </span>
                  );
                })}
                {overflow > 0 && (
                  <span className="px-1.5 text-2xs text-muted-foreground">
                    +{overflow} altri
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
