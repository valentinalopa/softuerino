import Link from "next/link";
import { ChevronRight, Clock3, Timer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getLeaveBalance, getPendingOverdrafts } from "@/lib/leave-balance";
import { peopleInScope } from "@/lib/permissions";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { NotificationCard, TeamPendingItem } from "@/components/richieste/NotificationCard";
import { addDays, formatDayMonth, formatTime, startOfDay } from "@/lib/calendar-utils";
import { buildAttendanceMap, dateKey, lookupAttendance } from "@/lib/attendance-utils";
import { isWorkingDay } from "@/lib/leave-days";
import { cn } from "@/lib/utils";
import { TONE_TEXT } from "@/lib/tones";
import { formatAmount, formatHourlySlot, formatWhen } from "@/lib/leave-format";
import { eventTypeStyle } from "@/components/calendar/types";
import { LEAVE_TYPE_LABELS, EVENT_TYPE_LABELS, annualAllowance, isAdminRole } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Oggi" };

// Quanti giorni indietro guardare per le ore non registrate.
const HOURS_LOOKBACK_DAYS = 14;
// Quante richieste da approvare mostrare: il resto è in Richieste.
const PENDING_PREVIEW = 5;

export default async function Home() {
  const user = await requireUser();
  // Home di tutti: prima le cose da fare (approvazioni, ore da registrare),
  // poi saldi, chi manca oggi e i prossimi impegni. Grafici ed esportazioni
  // stanno in Report.
  // Giorni lavorativi recenti (oggi escluso) da controllare nel log ore.
  const today = startOfDay(new Date());
  // Da approvare: admin tutte (anche le proprie), gli altri quelle delle
  // persone su cui hanno il permesso.
  const isAdmin = isAdminRole(user.role);
  const approveScope = isAdmin ? "all" : await peopleInScope(user, "approvare");
  const canApprove = approveScope === "all" || approveScope.length > 0;
  const pendingWhere = {
    status: "pending",
    ...(isAdmin ? {} : { user: approveScope === "all" ? { id: { not: user.id } } : { id: { in: approveScope as string[] } } }),
  };
  const hoursFrom = addDays(today, -HOURS_LOOKBACK_DAYS);
  const [balance, pendingRequests, upcomingEvents, recentEntries, recentLeaves, toApprove, toApproveCount, absentToday] = await Promise.all([
    getLeaveBalance(user.id, user.employmentType as "dipendente" | "partita_iva"),
    prisma.leaveRequest.findMany({
      where: { status: "pending", userId: user.id },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    // Solo gli eventi in cui la persona c'è (o che ha creato), non tutto il
    // calendario aziendale.
    prisma.calendarEvent.findMany({
      where: {
        startAt: { gte: new Date() },
        OR: [{ participants: { some: { userId: user.id } } }, { createdById: user.id }],
      },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
    prisma.timeEntry.findMany({
      where: { userId: user.id, date: { gte: hoursFrom, lt: today } },
      select: { date: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        userId: user.id,
        status: { in: ["approved", "registrata"] },
        startDate: { lt: today },
        endDate: { gte: hoursFrom },
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
    canApprove
      ? prisma.leaveRequest.findMany({
          where: pendingWhere,
          include: {
            user: { select: { name: true, employmentType: true } },
            recoveryCredit: { select: { reason: true, amount: true, unit: true } },
          },
          orderBy: { startDate: "asc" },
          take: PENDING_PREVIEW,
        })
      : Promise.resolve([]),
    canApprove ? prisma.leaveRequest.count({ where: pendingWhere }) : Promise.resolve(0),
    // Assenze confermate che toccano oggi, di tutto il team.
    prisma.leaveRequest.findMany({
      where: {
        status: { in: ["approved", "registrata"] },
        startDate: { lte: today },
        endDate: { gte: today },
        user: { active: true },
      },
      include: { user: { select: { name: true } } },
      orderBy: { user: { name: "asc" } },
    }),
  ]);
  const overdrafts = await getPendingOverdrafts(toApprove);
  // La malattia resta riservata (a chi non è admin arriva come assenza);
  // una chiusura aziendale è una riga per persona: basta dirla una volta.
  const absentRows = absentToday.map((leave) => maskLeaveForViewer(leave, user));
  const closureToday = absentRows.some((leave) => leave.type === "chiusura");
  const absentPeople = absentRows.filter((leave) => leave.type !== "chiusura");

  // Stesso criterio del log ore: giorni lavorativi senza ore e senza
  // un'assenza a giornata intera.
  const logged = new Set(recentEntries.map((e) => dateKey(e.date)));
  const absences = buildAttendanceMap({ leaveRequests: recentLeaves, presenceEntries: [] });
  const missingDays = Array.from({ length: HOURS_LOOKBACK_DAYS }, (_, i) => addDays(hoursFrom, i)).filter(
    (day) =>
      isWorkingDay(day) && !logged.has(dateKey(day)) && !lookupAttendance(absences, user.id, day)?.leave
  );
  const statCount = balance.kind === "assenze" ? 2 : 4;

  return (
    <div className="space-y-8">
      <div>
        <h1>Oggi</h1>
        <p className="text-sm text-muted-foreground">
          Ciao {user.name}, ecco il tuo riepilogo.
        </p>
      </div>

      {toApproveCount > 0 && (
        <NotificationCard
          icon={Clock3}
          title={`${toApproveCount} richiest${toApproveCount === 1 ? "a" : "e"} da approvare`}
        >
          {toApprove.map((request) => (
            <TeamPendingItem
              key={request.id}
              request={maskLeaveForViewer(request, user)}
              overdraft={overdrafts.get(request.id)}
            />
          ))}
          <li className="pt-2.5">
            <Link href="/richieste?vista=da-approvare" className="text-xs text-muted-foreground hover:underline">
              {toApproveCount > PENDING_PREVIEW ? `Vedi tutte (${toApproveCount})` : "Vai a Da approvare"}
            </Link>
          </li>
        </NotificationCard>
      )}

      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", statCount === 4 ? "xl:grid-cols-4" : "")}>
        {balance.kind === "assenze" ? (
          <StatCard
            label="Assenze rimanenti (giorni)"
            value={balance.assenzeRemaining}
            sub={`su ${formatAmount(annualAllowance("assenze"))} l'anno`}
            href="/richieste"
          />
        ) : (
          <>
            <StatCard
              label="Ferie rimanenti (giorni)"
              value={balance.ferieRemaining}
              sub={`su ${formatAmount(balance.ferieMatured)} maturate (${formatAmount(annualAllowance("ferie"))} l'anno)`}
              href="/richieste"
            />
            <StatCard
              label="Permesso rimanente (ore)"
              value={balance.permessoRemaining}
              sub={`su ${formatAmount(annualAllowance("permesso"))} l'anno`}
              href="/richieste"
            />
            <StatCard
              label="Malattia (giorni quest'anno)"
              value={balance.malattiaDaysRegistered}
              sub="nessun tetto"
              href="/richieste"
            />
          </>
        )}
        <HoursCard missingDays={missingDays} />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Assenti oggi</CardTitle>
            <Link href="/calendario?vista=team" className="text-xs text-muted-foreground hover:underline">
              Presenze del team
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {closureToday && <li className="font-medium">Chiusura aziendale</li>}
              {absentPeople.map((leave) => (
                <li key={leave.id} className="flex items-center justify-between gap-3 border-b pb-2 last:border-0">
                  <span className="truncate font-medium">{leave.user.name}</span>
                  <span className="shrink-0 text-muted-foreground">
                    {LEAVE_TYPE_LABELS[leave.type as keyof typeof LEAVE_TYPE_LABELS] ?? leave.type}
                    {leave.hours ? ` · ${formatHourlySlot({ ...leave, hours: leave.hours })}` : ""}
                  </span>
                </li>
              ))}
              {!closureToday && absentPeople.length === 0 && (
                <li className="text-muted-foreground">Nessuna assenza: c&apos;è tutto il team.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              Le tue richieste in attesa
            </CardTitle>
            <Link
              href="/richieste"
              className="text-xs text-muted-foreground hover:underline"
            >
              Vedi tutte
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {pendingRequests.map((request) => (
                <li key={request.id} className="border-b pb-2 last:border-0">
                  <Link href="/richieste" className="flex items-center justify-between gap-3 hover:underline">
                    <span>
                      {LEAVE_TYPE_LABELS[
                        request.type as keyof typeof LEAVE_TYPE_LABELS
                      ] ?? request.type}
                    </span>
                    <span className="text-muted-foreground">
                      {formatWhen(request)}
                    </span>
                  </Link>
                </li>
              ))}
              {pendingRequests.length === 0 && (
                <li className="text-muted-foreground">Nessuna richiesta in attesa.</li>
              )}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>I tuoi prossimi impegni</CardTitle>
            <Link
              href="/calendario"
              className="text-xs text-muted-foreground hover:underline"
            >
              Vedi calendario
            </Link>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {upcomingEvents.map((event) => (
                <li key={event.id} className="border-b pb-2 last:border-0">
                  <Link href={`/calendario?evento=${event.id}`} className="group flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium group-hover:underline">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayMonth(event.startAt)} · {formatTime(event.startAt)}
                    </p>
                  </div>
                  <Badge variant={eventTypeStyle(event.type).tone}>
                    {EVENT_TYPE_LABELS[
                      event.type as keyof typeof EVENT_TYPE_LABELS
                    ] ?? event.type}
                  </Badge>
                  </Link>
                </li>
              ))}
              {upcomingEvents.length === 0 && (
                <li className="text-muted-foreground">Nessun impegno in programma.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href} className="block h-full">
      <Card className="h-full transition-colors hover:border-foreground/30">
        <CardContent>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className={`mt-1 text-3xl font-semibold ${value < 0 ? "text-destructive" : ""}`}>
            {formatAmount(value)}
          </p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          {value < 0 && <p className="text-xs font-medium text-destructive">In negativo</p>}
        </CardContent>
      </Card>
    </Link>
  );
}

// Ore non registrate negli ultimi giorni lavorativi: link diretto al primo.
function HoursCard({ missingDays }: { missingDays: Date[] }) {
  const first = missingDays[0];
  return (
    <Link href={first ? `/ore?date=${dateKey(first)}` : "/ore"} className="block h-full">
      <Card className="h-full transition-colors hover:border-foreground/30">
        <CardContent>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Timer className="size-4" aria-hidden />
            Ore
          </p>
          {missingDays.length > 0 ? (
            <>
              <p className={cn("mt-1 text-3xl font-semibold", TONE_TEXT.danger)}>{missingDays.length}</p>
              <p className="flex items-center gap-0.5 text-xs text-muted-foreground">
                {missingDays.length === 1 ? "giorno da registrare" : "giorni da registrare"}, dal{" "}
                {formatDayMonth(first)}
                <ChevronRight className="size-3.5" aria-hidden />
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-semibold">In pari</p>
              <p className="text-xs text-muted-foreground">nessun giorno da registrare</p>
            </>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
