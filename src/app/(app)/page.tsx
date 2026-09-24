import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getLeaveBalance } from "@/lib/leave-balance";
import { buildHoursByClientByMonth } from "@/lib/panoramica-utils";
import { formatDayMonth, formatTime } from "@/lib/calendar-utils";
import { eventTypeStyle } from "@/components/calendar/types";
import { LEAVE_TYPE_LABELS, EVENT_TYPE_LABELS } from "@/lib/constants";
import { HoursByClientChart } from "@/components/panoramica/HoursByClientChart";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const DASHBOARD_CHART_MONTHS = 6;

export default async function Home() {
  const user = await requireUser();
  const isSuperAdmin = user.role === "super_admin";

  const [balance, pendingRequests, upcomingEvents, hoursByClientByMonth] =
    await Promise.all([
      getLeaveBalance(user.id, user.employmentType as "dipendente" | "partita_iva"),
      prisma.leaveRequest.findMany({
        where: {
          status: "pending",
          ...(isSuperAdmin ? {} : { userId: user.id }),
        },
        include: { user: { select: { id: true, name: true } } },
        orderBy: { startDate: "asc" },
        take: 5,
      }),
      prisma.calendarEvent.findMany({
        where: { startAt: { gte: new Date() } },
        orderBy: { startAt: "asc" },
        take: 5,
      }),
      isSuperAdmin
        ? prisma.timeEntry
            .findMany({
              where: {
                date: {
                  gte: new Date(
                    new Date().getFullYear(),
                    new Date().getMonth() - (DASHBOARD_CHART_MONTHS - 1),
                    1
                  ),
                },
              },
              select: {
                date: true,
                hours: true,
                clientId: true,
                client: { select: { name: true } },
              },
            })
            .then((entries) =>
              buildHoursByClientByMonth(
                entries.map((entry) => ({
                  date: entry.date,
                  hours: entry.hours,
                  clientId: entry.clientId,
                  clientName: entry.client.name,
                })),
                DASHBOARD_CHART_MONTHS
              )
            )
        : Promise.resolve(null),
    ]);

  return (
    <div className="space-y-8">
      <div>
        <h1>Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Ciao {user.name}, ecco il tuo riepilogo.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {balance.kind === "assenze" ? (
          <StatCard
            label="Assenze rimanenti (giorni)"
            value={balance.assenzeRemaining}
            sub={`su ${balance.assenzeAllowance}`}
            href="/richieste"
          />
        ) : (
          <>
            <StatCard
              label="Ferie rimanenti (giorni)"
              value={balance.ferieRemaining}
              sub={`su ${balance.ferieAllowance}`}
              href="/richieste"
            />
            <StatCard
              label="Permesso rimanente (ore)"
              value={balance.permessoRemaining}
              sub={`su ${balance.permessoAllowance}`}
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
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>
              {isSuperAdmin ? "Richieste in attesa" : "Le tue richieste in attesa"}
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
                <li
                  key={request.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span>{request.user.name}</span>
                  <span className="text-muted-foreground">
                    {LEAVE_TYPE_LABELS[
                      request.type as keyof typeof LEAVE_TYPE_LABELS
                    ] ?? request.type}
                  </span>
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
            <CardTitle>Prossimi impegni</CardTitle>
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
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 border-b pb-2 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDayMonth(event.startAt)} · {formatTime(event.startAt)}
                    </p>
                  </div>
                  <Badge variant="outline" className={eventTypeStyle(event.type).chip}>
                    {EVENT_TYPE_LABELS[
                      event.type as keyof typeof EVENT_TYPE_LABELS
                    ] ?? event.type}
                  </Badge>
                </li>
              ))}
              {upcomingEvents.length === 0 && (
                <li className="text-muted-foreground">Nessun evento in programma.</li>
              )}
            </ul>
          </CardContent>
        </Card>
      </div>

      {isSuperAdmin && hoursByClientByMonth && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Ore per cliente</CardTitle>
            <Link
              href="/panoramica"
              className="text-xs text-muted-foreground hover:underline"
            >
              Vedi panoramica
            </Link>
          </CardHeader>
          <CardContent>
            <HoursByClientChart
              rows={hoursByClientByMonth.rows}
              clients={hoursByClientByMonth.clients}
            />
          </CardContent>
        </Card>
      )}
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
    <Link href={href}>
      <Card className="transition-colors hover:border-foreground/30">
        <CardContent>
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-1 text-3xl font-semibold">{value}</p>
          {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
        </CardContent>
      </Card>
    </Link>
  );
}
