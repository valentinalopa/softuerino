import { cn } from "@/lib/utils";
import { startOfDay } from "@/lib/calendar-utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { formatHourlySlot } from "@/lib/leave-format";
import {
  HOURLY_STYLES,
  LEAVE_STYLES,
  NEUTRAL_CHIP,
} from "@/components/presenze/attendance-styles";

export type CalendarAbsence = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
  startTime?: string | null;
  endTime?: string | null;
};

// Chi è assente nel giorno mostrato: serve a pianificare eventi e shooting
// senza dover aprire Presenze. Stessi colori e icone di Presenze.
export function DayAbsences({
  day,
  absences,
}: {
  day: Date;
  absences: CalendarAbsence[];
}) {
  const target = startOfDay(day);
  const todays = absences.filter(
    (absence) =>
      startOfDay(absence.startDate) <= target && target <= startOfDay(absence.endDate)
  );

  return (
    <div className="surface flex flex-wrap items-center gap-2 px-4 py-3 text-sm">
      <span className="font-medium text-foreground">Assenti</span>
      {todays.length === 0 && (
        <span className="text-muted-foreground">Nessuno, c&apos;è tutto il team.</span>
      )}
      {todays.map((absence) => {
        // A ore: permesso e recupero a ore, sempre su un solo giorno.
        const hourly = absence.hours !== null;
        const style = hourly
          ? HOURLY_STYLES[absence.type as keyof typeof HOURLY_STYLES]
          : LEAVE_STYLES[absence.type as keyof typeof LEAVE_STYLES];
        const Icon = style?.icon;
        const pending = absence.status === "pending";
        const label =
          LEAVE_TYPE_LABELS[absence.type as keyof typeof LEAVE_TYPE_LABELS] ?? absence.type;
        return (
          <span
            key={absence.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
              pending || !style ? NEUTRAL_CHIP : style.chip
            )}
          >
            {Icon && <Icon className="size-3.5" />}
            <span className="font-semibold">{absence.userName}</span>
            <span>
              · {label}
              {absence.hours !== null && ` ${formatHourlySlot({ ...absence, hours: absence.hours })}`}
              {pending && " (in attesa)"}
            </span>
          </span>
        );
      })}
    </div>
  );
}
