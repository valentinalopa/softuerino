"use client";

import { addDays, startOfWeek } from "@/lib/calendar-utils";
import { TimeGrid } from "./TimeGrid";
import type { CalendarEventData } from "./types";

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

  return <TimeGrid days={days} events={events} onSelectEvent={onSelectEvent} />;
}
