"use client";

import { TimeGrid } from "./TimeGrid";
import type { CalendarEventData } from "./types";

export function DayView({
  current,
  events,
  onSelectEvent,
}: {
  current: Date;
  events: CalendarEventData[];
  onSelectEvent: (event: CalendarEventData) => void;
}) {
  return <TimeGrid days={[current]} events={events} onSelectEvent={onSelectEvent} />;
}
