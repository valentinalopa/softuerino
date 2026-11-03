"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { addDays, formatFullDate, isSameDay, startOfMonth, startOfWeek } from "@/lib/calendar-utils";
import { dateKey, lookupAttendance, type DayEntry } from "@/lib/attendance-utils";
import { LEAVE_STATUS_LABELS, PRESENCE_SLOT_LABELS } from "@/lib/constants";
import { formatTimeRange } from "@/lib/leave-format";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  buildDayCategories,
  disambiguatedInitials,
  HOURLY_STYLES,
  LEAVE_STYLES,
  MODE_STYLES,
  type DayCategory,
} from "./attendance-styles";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
const MAX_VISIBLE_AVATARS = 6;

type Selected = { category: DayCategory; day: Date };

// Una voce del popup: tutto ciò che la pagina sa già di quella persona in quel giorno.
type Detail = {
  key: string;
  title: string;
  when: string | null;
  status: string | null;
  note: string | null;
};

// `entries` è la mappa presenze/assenze già mascherata lato server (la malattia
// degli altri arriva come "assenza"). `notes` contiene solo le note che chi guarda
// può già leggere altrove (le proprie, o tutte se admin): vedi TeamAttendanceView.
export function AttendanceTeamMonthCalendar({
  current,
  users,
  entries,
  notes,
}: {
  current: Date;
  users: { id: string; name: string }[];
  entries: [string, DayEntry][];
  notes: Record<string, string>;
}) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const map = useMemo(() => new Map(entries), [entries]);
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
                "flex min-h-[150px] min-w-0 flex-col gap-1 overflow-hidden border-b border-r p-1 md:p-1.5 [&:nth-child(7n)]:border-r-0",
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
                    onSelect={() => setSelected({ category, day })}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          {selected && <CategoryDetails selected={selected} map={map} notes={notes} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CategoryRow({
  category,
  initialsById,
  onSelect,
}: {
  category: DayCategory;
  initialsById: Map<string, string>;
  onSelect: () => void;
}) {
  const Icon = category.icon;
  const visible = category.people.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = category.people.length - visible.length;
  const names = category.people.map((p) => p.name).join(", ");

  return (
    <button
      type="button"
      onClick={onSelect}
      title={`${category.label}: ${names}`}
      aria-label={`${category.label}: ${names}. Apri i dettagli`}
      className={cn(
        "flex w-full min-w-0 cursor-pointer flex-col gap-1 overflow-hidden rounded-sm border px-1 py-1 text-left md:px-1.5",
        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring",
        category.chip
      )}
    >
      <div className="flex min-w-0 items-start gap-1 text-3xs font-medium leading-tight">
        <Icon className="size-3 shrink-0" aria-hidden />
        {/* Su schermo stretto (colonne di 30-70 px) l'etichetta non ci sta:
            restano icona e iniziali, il testo intero è nel popup e per gli
            screen reader. Da md in su va a capo (anche a metà parola se la
            colonna è stretta, come il sabato e la domenica). */}
        <span className="sr-only md:not-sr-only md:min-w-0 md:break-words">
          {category.label}
        </span>
      </div>
      {/* Iniziali più piccole su mobile: nella colonna del fine settimana
          (circa 45 px) un cerchio da 20 px verrebbe tagliato. */}
      <div className="flex flex-wrap gap-0.5 md:gap-1">
        {visible.map((person) => (
          <div
            key={person.id}
            className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-background text-4xs font-semibold text-foreground md:size-5"
          >
            {initialsById.get(person.id) ?? ""}
          </div>
        ))}
        {overflow > 0 && (
          <div className="flex size-[18px] shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-4xs font-semibold text-muted-foreground md:size-5">
            +{overflow}
          </div>
        )}
      </div>
    </button>
  );
}

// Tutte le voci di una persona nel giorno (anche di altre categorie), dalla
// stessa mappa che disegna il calendario.
function personDetails(
  entry: DayEntry | undefined,
  notes: Record<string, string>,
  userId: string,
  day: Date
): Detail[] {
  if (!entry) return [];
  const base = `${userId}__${dateKey(day)}`;
  const details: Detail[] = [];

  if (entry.leave) {
    details.push({
      key: "leave",
      title: LEAVE_STYLES[entry.leave.type].title,
      when: "Giornata intera",
      status: LEAVE_STATUS_LABELS[entry.leave.status],
      note: notes[`${base}__leave`] ?? null,
    });
  }
  if (entry.hourly) {
    details.push({
      key: "hourly",
      title: HOURLY_STYLES[entry.hourly.type].title,
      when: formatTimeRange(entry.hourly) ?? `${entry.hourly.hours} h`,
      status: LEAVE_STATUS_LABELS[entry.hourly.status],
      note: notes[`${base}__hourly`] ?? null,
    });
  }
  entry.presences.forEach((presence, index) => {
    details.push({
      key: `presence-${index}`,
      title: MODE_STYLES[presence.mode].title,
      when: PRESENCE_SLOT_LABELS[presence.slot],
      status: null,
      note: null,
    });
  });
  return details;
}

function CategoryDetails({
  selected,
  map,
  notes,
}: {
  selected: Selected;
  map: Map<string, DayEntry>;
  notes: Record<string, string>;
}) {
  const { category, day } = selected;
  const Icon = category.icon;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5 pr-8">
        <DialogTitle className="first-letter:uppercase">{formatFullDate(day)}</DialogTitle>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            category.chip
          )}
        >
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {category.label}
        </span>
      </div>
      <ul className="space-y-3">
        {category.people.map((person) => {
          const details = personDetails(
            lookupAttendance(map, person.id, day),
            notes,
            person.id,
            day
          );
          return (
            <li key={person.id} className="rounded-md border p-3">
              <p className="text-sm font-medium">{person.name}</p>
              <ul className="mt-2 space-y-2">
                {details.map((detail) => (
                  <li key={detail.key} className="text-sm">
                    <p>
                      <span className="font-medium">{detail.title}</span>
                      {detail.when && (
                        <span className="text-muted-foreground"> · {detail.when}</span>
                      )}
                    </p>
                    {detail.status && (
                      <p className="text-xs text-muted-foreground">Stato: {detail.status}</p>
                    )}
                    {detail.note && (
                      <p className="whitespace-pre-line text-xs text-muted-foreground">
                        Nota: {detail.note}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
