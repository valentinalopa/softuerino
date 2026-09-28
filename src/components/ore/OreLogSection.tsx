import Link from "next/link";
import { TONE_TEXT } from "@/lib/tones";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { appendQuery } from "@/lib/utils";
import { addDays, formatFullDateNoYear, startOfDay } from "@/lib/calendar-utils";
import { dateKey } from "@/lib/attendance-utils";
import { parseDateParam, buildMonthlySummary, formatHours } from "@/lib/ore-utils";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { DayStrip } from "@/components/ore/DayStrip";
import { DailyHoursForm } from "@/components/ore/DailyHoursForm";
import { LoggedHoursSummary } from "@/components/ore/LoggedHoursSummary";
import { MonthlySummaryTable } from "@/components/ore/MonthlySummaryTable";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const WINDOW_SIZE = 10;

export type OreLogParams = {
  view?: string;
  date?: string;
  window?: string;
  edit?: string;
};

// Log ore di un singolo utente (vista giornaliera + report mensile). Usato sia
// da /ore (il proprio) sia dalla scheda membro in /team/[id] (quello altrui,
// per il super admin): stessa vista, nessuna duplicazione.
export async function OreLogSection({
  userId,
  canEdit,
  basePath,
  params,
}: {
  userId: string;
  // Chi può modificare una giornata già registrata (solo super admin).
  canEdit: boolean;
  // Pagina che ospita la sezione (es. "/ore" o "/team/abc?tab=ore").
  basePath: string;
  params: OreLogParams;
}) {
  const view = params.view === "summary" ? "summary" : "day";

  return (
    <div className="space-y-4">
      <SegmentedLinkTabs
        items={[
          {
            key: "day",
            label: "Giornaliera",
            href: appendQuery(basePath, { view: "day" }),
            active: view === "day",
          },
          {
            key: "summary",
            label: "Riepilogativa",
            href: appendQuery(basePath, { view: "summary" }),
            active: view === "summary",
          },
        ]}
      />

      {view === "summary" ? (
        <SummaryView userId={userId} />
      ) : (
        <DailyView
          userId={userId}
          canEdit={canEdit}
          basePath={basePath}
          dateParam={params.date}
          windowParam={params.window}
          editParam={params.edit}
        />
      )}
    </div>
  );
}

// Il report mostra gli ultimi 24 mesi: senza un limite la query crescerebbe
// per sempre (migliaia di righe lette per calcolare pochi totali).
const SUMMARY_MONTHS_BACK = 24;

async function SummaryView({ userId }: { userId: string }) {
  const now = new Date();
  const summaryStart = new Date(
    now.getFullYear(),
    now.getMonth() - (SUMMARY_MONTHS_BACK - 1),
    1
  );

  const entries = await prisma.timeEntry.findMany({
    where: { userId, date: { gte: summaryStart } },
    select: { date: true, hours: true },
  });

  const rows = buildMonthlySummary(entries);

  return (
    <div className="space-y-3">
      <h2>Report mensile ore</h2>
      <Card>
        <CardContent>
          <MonthlySummaryTable rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}

async function DailyView({
  userId,
  canEdit,
  basePath,
  dateParam,
  windowParam,
  editParam,
}: {
  userId: string;
  canEdit: boolean;
  basePath: string;
  dateParam?: string;
  windowParam?: string;
  editParam?: string;
}) {
  const selectedDate = parseDateParam(dateParam) ?? startOfDay(new Date());
  const selectedKey = dateKey(selectedDate);

  const windowStart =
    parseDateParam(windowParam) ?? addDays(selectedDate, -(WINDOW_SIZE - 1));
  const windowKey = dateKey(windowStart);
  const windowDays = Array.from({ length: WINDOW_SIZE }, (_, i) =>
    addDays(windowStart, i)
  );
  const windowEnd = addDays(windowStart, WINDOW_SIZE);

  const [activeClients, dayEntries, windowEntries] = await Promise.all([
    prisma.client.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId,
        date: { gte: selectedDate, lt: addDays(selectedDate, 1) },
      },
      include: { client: { select: { name: true } } },
    }),
    prisma.timeEntry.findMany({
      where: { userId, date: { gte: windowStart, lt: windowEnd } },
      select: { date: true },
    }),
  ]);

  // In modifica il form include anche i clienti disattivati che hanno già ore
  // quel giorno: il salvataggio sostituisce l'intera giornata e senza queste
  // righe le loro ore sparirebbero in silenzio.
  const inactiveWithEntries = dayEntries
    .filter((e) => !activeClients.some((c) => c.id === e.clientId))
    .map((e) => ({ id: e.clientId, name: e.client.name }));
  const formClients = [...activeClients, ...inactiveWithEntries].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const loggedKeys = new Set(windowEntries.map((e) => dateKey(e.date)));
  const hoursByClient = Object.fromEntries(
    dayEntries.map((e) => [e.clientId, e.hours])
  );
  const totalLogged = dayEntries.reduce((sum, e) => sum + e.hours, 0);
  const alreadyLogged = dayEntries.length > 0;
  const editing = alreadyLogged && canEdit && editParam === "1";

  const dayHref = appendQuery(basePath, {
    date: selectedKey,
    window: windowKey,
  });

  return (
    <div className="space-y-4">
      <DayStrip
        days={windowDays}
        selectedKey={selectedKey}
        windowKey={windowKey}
        loggedKeys={loggedKeys}
        basePath={basePath}
        prevHref={appendQuery(basePath, {
          date: selectedKey,
          window: dateKey(addDays(windowStart, -WINDOW_SIZE)),
        })}
        nextHref={appendQuery(basePath, {
          date: selectedKey,
          window: dateKey(addDays(windowStart, WINDOW_SIZE)),
        })}
      />

      <div className="flex items-center justify-between">
        <h2 className="capitalize">
          {formatFullDateNoYear(selectedDate)}
        </h2>
        <span
          className={
            alreadyLogged
              ? `text-sm font-medium ${TONE_TEXT.success}`
              : `text-sm font-medium ${TONE_TEXT.danger}`
          }
        >
          {alreadyLogged
            ? `Registrate ${formatHours(totalLogged)}h`
            : "Non ancora registrato"}
        </span>
      </div>

      <div className="mx-auto max-w-xl space-y-3">
        {alreadyLogged && !editing ? (
          <>
            <LoggedHoursSummary
              entries={dayEntries.map((e) => ({
                clientName: e.client.name,
                hours: e.hours,
              }))}
            />
            {canEdit && (
              <div className="flex justify-end">
                <Link
                  href={appendQuery(dayHref, { edit: "1" })}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Pencil />
                  Modifica
                </Link>
              </div>
            )}
          </>
        ) : (
          <DailyHoursForm
            key={`${selectedKey}-${userId}`}
            dateValue={selectedKey}
            userId={userId}
            clients={formClients}
            existingHours={hoursByClient}
            doneHref={editing ? dayHref : undefined}
            cancelHref={editing ? dayHref : undefined}
          />
        )}
        {editing && (
          <p className="text-xs text-muted-foreground">
            Azzera tutte le ore e salva per eliminare l&apos;intera giornata.
          </p>
        )}
      </div>
    </div>
  );
}
