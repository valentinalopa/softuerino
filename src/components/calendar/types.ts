export type CalendarEventData = {
  id: string;
  title: string;
  type: string;
  startAt: Date;
  endAt: Date;
  location: string | null;
  description: string | null;
  createdById: string | null;
  participants: { user: { id: string; name: string } }[];
};

export const EVENT_TYPE_STYLES: Record<
  string,
  { chip: string; dot: string }
> = {
  riunione: {
    chip: "bg-blue-500/12 text-blue-800 dark:text-blue-300 border-blue-500/25",
    dot: "bg-blue-500",
  },
  shooting: {
    chip:
      "bg-purple-500/12 text-purple-700 dark:text-purple-300 border-purple-500/25",
    dot: "bg-purple-500",
  },
  altro: {
    chip:
      "bg-neutral-500/12 text-neutral-700 dark:text-neutral-300 border-neutral-500/25",
    dot: "bg-neutral-500",
  },
};

export function eventTypeStyle(type: string) {
  return EVENT_TYPE_STYLES[type] ?? EVENT_TYPE_STYLES.altro;
}
