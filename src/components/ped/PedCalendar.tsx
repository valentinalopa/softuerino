"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { addDays, isSameDay, startOfMonth, startOfWeek } from "@/lib/calendar-utils";
import { dateKey } from "@/lib/attendance-utils";
import { PED_SOCIAL_LABELS, type PedSocial } from "@/lib/constants";
import { pedStatusStyle } from "./ped-styles";
import {
  PedContentSheet,
  type PedEntry,
  type PedSheetState,
} from "./PedContentSheet";
import { MonthNav } from "@/components/presenze/MonthNav";
import { Button } from "@/components/ui/button";

const WEEKDAY_LABELS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export type { PedEntry };

export function PedCalendar({
  current,
  entries,
  members,
  clients,
  fixedClientId,
  showClient = false,
  todayHref,
  prevHref,
  nextHref,
  monthLabel,
}: {
  current: Date;
  entries: PedEntry[];
  members: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  // Valorizzato in /ped/[cliente]: i nuovi contenuti nascono su quel cliente.
  fixedClientId?: string;
  // Vista aggregata: mostra il nome cliente sui box.
  showClient?: boolean;
  todayHref: string;
  prevHref: string;
  nextHref: string;
  monthLabel: string;
}) {
  const [sheetState, setSheetState] = useState<PedSheetState | null>(null);

  const monthStart = startOfMonth(current);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const today = new Date();

  const byDay = new Map<string, PedEntry[]>();
  for (const entry of entries) {
    const list = byDay.get(entry.dateKey);
    if (list) {
      list.push(entry);
    } else {
      byDay.set(entry.dateKey, [entry]);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          todayHref={todayHref}
          prevHref={prevHref}
          nextHref={nextHref}
          monthLabel={monthLabel}
        />
        <Button
          type="button"
          onClick={() => setSheetState({ mode: "create", date: dateKey(today) })}
        >
          <Plus className="size-4" />
          Nuovo contenuto
        </Button>
      </div>

      <div className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10">
        <div className="grid grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
          {WEEKDAY_LABELS.map((d) => (
            <div key={d} className="px-2 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const key = dateKey(day);
            const inMonth = day.getMonth() === current.getMonth();
            const isToday = isSameDay(day, today);
            const dayEntries = byDay.get(key) ?? [];

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                aria-label={`Nuovo contenuto il ${key}`}
                onClick={() => setSheetState({ mode: "create", date: key })}
                onKeyDown={(e) => {
                  // Solo la cella stessa: i keydown dei box interni (modifica)
                  // risalgono fin qui e non devono aprire la creazione.
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSheetState({ mode: "create", date: key });
                  }
                }}
                className={cn(
                  "flex min-h-[110px] cursor-pointer flex-col gap-1 border-b border-r p-1.5 text-left outline-none transition-colors [&:nth-child(7n)]:border-r-0 hover:bg-muted/30 focus-visible:bg-muted/30",
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
                  {dayEntries.map((entry) => {
                    const style = pedStatusStyle(entry.status);
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSheetState({ mode: "edit", entry });
                        }}
                        className={cn(
                          "flex flex-col gap-0.5 rounded-[0.4rem] border px-1.5 py-1 text-left text-[11px] leading-tight",
                          style.chip
                        )}
                      >
                        <span className="truncate font-medium">{entry.title}</span>
                        <span className="truncate text-[10px] opacity-80">
                          {showClient && `${entry.clientName} · `}
                          {entry.socials
                            .map((s) => PED_SOCIAL_LABELS[s as PedSocial] ?? s)
                            .join(" · ")}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <PedContentSheet
        state={sheetState}
        onClose={() => setSheetState(null)}
        members={members}
        clients={clients}
        fixedClientId={fixedClientId}
      />
    </div>
  );
}
