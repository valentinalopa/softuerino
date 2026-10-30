import Link from "next/link";
import { TONE_TEXT } from "@/lib/tones";
import { Pencil } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { appendQuery } from "@/lib/utils";
import { addDays, formatFullDateNoYear, startOfDay } from "@/lib/calendar-utils";
import { buildAttendanceMap, dateKey, lookupAttendance } from "@/lib/attendance-utils";
import { isHoliday } from "@/lib/leave-days";
import { formatHourlySlot } from "@/lib/leave-format";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { clientLabel, loggableClientsWhere, sortClientsByParent } from "@/lib/clients";
import { parseDateParam, buildMonthlySummary, formatHours } from "@/lib/ore-utils";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { DayStrip } from "@/components/ore/DayStrip";
import { DailyHoursForm } from "@/components/ore/DailyHoursForm";
import { LoggedHoursSummary } from "@/components/ore/LoggedHoursSummary";
import { MonthlySummaryTable } from "@/components/ore/MonthlySummaryTable";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const WINDOW_SIZE = 10;
// Finestra dei "usati di recente" nel form delle ore.
const RECENT_DAYS = 30;

export type OreLogParams = {
  view?: string;
  date?: string;
  window?: string;
  edit?: string;
};

// Log ore di un singolo utente (vista giornaliera + report mensile). Usato sia
// da /ore (il proprio) sia dalla scheda membro in /team/[id] (quello altrui,
// per gli admin): stessa vista, nessuna duplicazione.
export async function OreLogSection({
  userId,
  canEdit,
  basePath,
  params,
}: {
  userId: string;
  // Chi può modificare una giornata già registrata (solo admin).
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
  // Il giorno selezionato può stare fuori dalla finestra (frecce della strip).
  const leavesFrom = selectedDate < windowStart ? selectedDate : windowStart;
  const selectedEnd = addDays(selectedDate, 1);
  const leavesTo = selectedEnd > windowEnd ? selectedEnd : windowEnd;

  const [activeClients, dayEntries, windowEntries, leaveRequests, recentEntries] = await Promise.all([
    // Le voci riservate (es. "Organizzazione IT") solo a chi è indicato.
    prisma.client.findMany({
      where: loggableClientsWhere(userId),
      select: { id: true, name: true, parent: { select: { name: true } } },
    }),
    prisma.timeEntry.findMany({
      where: {
        userId,
        date: { gte: selectedDate, lt: addDays(selectedDate, 1) },
      },
      include: { client: { select: { id: true, name: true, parent: { select: { name: true } } } } },
    }),
    prisma.timeEntry.findMany({
      where: { userId, date: { gte: windowStart, lt: windowEnd } },
      select: { date: true },
    }),
    // Solo assenze confermate: una richiesta in attesa non toglie il giorno
    // da quelli da registrare.
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { in: ["approved", "registrata"] },
        startDate: { lt: leavesTo },
        endDate: { gte: leavesFrom },
      },
      select: {
        userId: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        hours: true,
        startTime: true,
        endTime: true,
      },
    }),
    // Clienti usati nelle ultime settimane: in cima al form.
    prisma.timeEntry.groupBy({
      by: ["clientId"],
      where: { userId, date: { gte: addDays(startOfDay(new Date()), -RECENT_DAYS) } },
    }),
  ]);

  // Giorni da non registrare oltre ai weekend: feste comandate e assenze a
  // giornata intera. Un permesso a ore no: il resto della giornata si lavora.
  const absences = buildAttendanceMap({ leaveRequests, presenceEntries: [] });
  const absentKeys = new Set(
    windowDays
      .filter((day) => lookupAttendance(absences, userId, day)?.leave)
      .map(dateKey)
  );
  const selectedAbsence = lookupAttendance(absences, userId, selectedDate);
  const weekend = selectedDate.getDay() === 0 || selectedDate.getDay() === 6;
  const restLabel = selectedAbsence?.leave
    ? LEAVE_TYPE_LABELS[selectedAbsence.leave.type]
    : weekend
      ? "Weekend"
      : isHoliday(selectedDate)
        ? "Festività"
        : null;
  const hourlyLeave = selectedAbsence?.hourly;

  // In modifica il form include anche i clienti disattivati che hanno già ore
  // quel giorno: il salvataggio sostituisce l'intera giornata e senza queste
  // righe le loro ore sparirebbero in silenzio.
  // Le voci compaiono come "Cliente › Voce", subito sotto il loro cliente.
  const inactiveWithEntries = dayEntries
    .filter((e) => !activeClients.some((c) => c.id === e.clientId))
    .map((e) => e.client);
  const formClients = sortClientsByParent([...activeClients, ...inactiveWithEntries]).map((c) => ({
    id: c.id,
    name: clientLabel(c),
  }));

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
        absentKeys={absentKeys}
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
          className={`text-sm font-medium ${
            TONE_TEXT[alreadyLogged ? "success" : restLabel ? "neutral" : "danger"]
          }`}
        >
          {alreadyLogged
            ? `Registrate ${formatHours(totalLogged)}h`
            : (restLabel ?? "Non ancora registrato")}
        </span>
      </div>

      <div className="mx-auto max-w-xl space-y-3">
        {!alreadyLogged && restLabel && (
          <p className="text-sm text-muted-foreground">
            Giornata da non registrare: se si è lavorato comunque, le ore si possono segnare qui sotto.
          </p>
        )}
        {hourlyLeave && (
          <p className="text-sm text-muted-foreground">
            {LEAVE_TYPE_LABELS[hourlyLeave.type]} {formatHourlySlot(hourlyLeave)}: vanno registrate
            le ore lavorate nel resto della giornata.
          </p>
        )}
        {alreadyLogged && !editing ? (
          <>
            <LoggedHoursSummary
              entries={sortClientsByParent(dayEntries.map((e) => ({ ...e.client, hours: e.hours }))).map((e) => ({
                clientName: clientLabel(e),
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
            recentClientIds={recentEntries.map((e) => e.clientId)}
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
