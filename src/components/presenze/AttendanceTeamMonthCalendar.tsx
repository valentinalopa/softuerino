import { cn } from "@/lib/utils";
import { addDays, isSameDay, startOfMonth, startOfWeek } from "@/lib/calendar-utils";
import type { DayEntry } from "@/lib/attendance-utils";
import { buildDayCategories, disambiguatedInitials, type DayCategory } from "./attendance-styles";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MAX_VISIBLE_AVATARS = 6;

export function AttendanceTeamMonthCalendar({
  current,
  users,
  map,
}: {
  current: Date;
  users: { id: string; name: string }[];
  map: Map<string, DayEntry>;
}) {
  const monthStart = startOfMonth(current);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();
  const initialsById = disambiguatedInitials(users);

  return (
    <div className="overflow-hidden surface">
      <div className="grid grid-cols-month border-b bg-muted/40 text-xs font-medium text-muted-foreground">
        {WEEKDAY_LABELS.map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-month">
        {days.map((day) => {
          const inMonth = day.getMonth() === current.getMonth();
          const isToday = isSameDay(day, today);
          const categories = inMonth ? buildDayCategories(users, map, day) : [];

          return (
            <div
              key={day.toISOString()}
              className={cn(
                "flex min-h-[150px] min-w-0 flex-col gap-1 overflow-hidden border-b border-r p-1.5 [&:nth-child(7n)]:border-r-0",
                !inMonth && "bg-muted/20",
                // Weekend: colonna più stretta e appena velata.
                inMonth && (day.getDay() === 0 || day.getDay() === 6) && "bg-muted/15",
              )}
            >
              <span
                className={cn(
                  "flex size-6 items-center justify-center rounded-full text-xs",
                  !inMonth && "text-muted-foreground",
                  isToday && "bg-primary font-medium text-primary-foreground"
                )}
              >
                {day.getDate()}
              </span>
              <div className="flex flex-col gap-1">
                {categories.map((category) => (
                  <CategoryRow
                    key={category.key}
                    category={category}
                    initialsById={initialsById}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoryRow({
  category,
  initialsById,
}: {
  category: DayCategory;
  initialsById: Map<string, string>;
}) {
  const Icon = category.icon;
  const visible = category.people.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = category.people.length - visible.length;

  return (
    <div
      title={`${category.label}: ${category.people.map((p) => p.name).join(", ")}`}
      className={cn(
        "flex min-w-0 flex-col gap-1 overflow-hidden rounded-sm border px-1.5 py-1",
        category.chip
      )}
    >
      <div className="flex min-w-0 items-start gap-1 text-3xs font-medium leading-tight">
        <Icon className="size-3 shrink-0" aria-hidden />
        {/* Su schermo stretto (colonne di 30-70 px) l'etichetta non ci sta:
            restano icona e iniziali, il testo intero è nel title del riquadro
            e per gli screen reader. Da md in su va a capo (anche a metà parola
            se la colonna è stretta, come il sabato e la domenica). */}
        <span className="sr-only md:not-sr-only md:min-w-0 md:break-words">
          {category.label}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {visible.map((person) => (
          <div
            key={person.id}
            className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-background bg-background text-4xs font-semibold text-foreground"
          >
            {initialsById.get(person.id) ?? ""}
          </div>
        ))}
        {overflow > 0 && (
          <div className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-4xs font-semibold text-muted-foreground">
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}
