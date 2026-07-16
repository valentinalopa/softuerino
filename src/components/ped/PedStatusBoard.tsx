"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { dateKey } from "@/lib/attendance-utils";
import { formatDayMonth } from "@/lib/calendar-utils";
import {
  PED_STATUSES,
  PED_STATUS_LABELS,
  PED_SOCIAL_LABELS,
  type PedSocial,
} from "@/lib/constants";
import { pedStatusStyle } from "./ped-styles";
import {
  PedContentSheet,
  type PedEntry,
  type PedSheetState,
} from "./PedContentSheet";
import { MonthNav } from "@/components/presenze/MonthNav";
import { Button } from "@/components/ui/button";

// Vista "bento" del PED: una colonna per stato di produzione, con le card dei
// contenuti del mese. Risponde a "cosa manca da preparare?" meglio del
// calendario, che invece risponde a "quando esce cosa?".
export function PedStatusBoard({
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
  entries: PedEntry[];
  members: { id: string; name: string }[];
  clients: { id: string; name: string }[];
  fixedClientId?: string;
  showClient?: boolean;
  todayHref: string;
  prevHref: string;
  nextHref: string;
  monthLabel: string;
}) {
  const [sheetState, setSheetState] = useState<PedSheetState | null>(null);
  const today = new Date();

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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PED_STATUSES.map((status) => {
          const columnEntries = entries
            .filter((entry) => entry.status === status)
            .sort((a, b) => a.dateKey.localeCompare(b.dateKey));
          const style = pedStatusStyle(status);

          return (
            <div
              key={status}
              className="flex flex-col gap-2 rounded-xl bg-card p-3 ring-1 ring-foreground/10"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={cn("size-2 rounded-full", style.dot)} />
                  <h3 className="text-sm font-medium">
                    {PED_STATUS_LABELS[status]}
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    {columnEntries.length}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Nuovo contenuto in ${PED_STATUS_LABELS[status]}`}
                  onClick={() =>
                    setSheetState({
                      mode: "create",
                      date: dateKey(today),
                      status,
                    })
                  }
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <div className="flex flex-col gap-2">
                {columnEntries.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setSheetState({ mode: "edit", entry })}
                    className={cn(
                      "flex flex-col gap-1 rounded-[0.4rem] border p-2 text-left text-sm transition-colors hover:brightness-95",
                      pedStatusStyle(entry.status).chip
                    )}
                  >
                    <span className="font-medium leading-tight">
                      {entry.title}
                    </span>
                    <span className="text-xs opacity-80">
                      {formatDayMonth(new Date(`${entry.dateKey}T00:00:00`))}
                      {showClient && ` · ${entry.clientName}`}
                      {entry.socials.length > 0 &&
                        ` · ${entry.socials
                          .map((s) => PED_SOCIAL_LABELS[s as PedSocial] ?? s)
                          .join(", ")}`}
                    </span>
                  </button>
                ))}
                {columnEntries.length === 0 && (
                  <p className="rounded-[0.4rem] border border-dashed px-2 py-4 text-center text-xs text-muted-foreground">
                    Nessun contenuto
                  </p>
                )}
              </div>
            </div>
          );
        })}
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
