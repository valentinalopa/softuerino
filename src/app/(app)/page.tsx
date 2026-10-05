import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { getLeaveBalance } from "@/lib/leave-balance";
import { formatDayMonth, formatTime } from "@/lib/calendar-utils";
import { formatAmount, formatRange } from "@/lib/leave-format";
import { eventTypeStyle } from "@/components/calendar/types";
import { LEAVE_TYPE_LABELS, EVENT_TYPE_LABELS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function Home() {
  const user = await requireUser();
  // Dashboard personale, identica per tutti (admin compresi): la
  // gestione del team vive nelle pagine di Amministrazione.
  const [balance, pendingRequests, upcomingEvents] = await Promise.all([
    getLeaveBalance(user.id, user.employmentType as "dipendente" | "partita_iva"),
    prisma.leaveRequest.findMany({
      where: { status: "pending", userId: user.id },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
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
            sub={`su ${formatAmount(balance.assenzeAllowance)}`}
            href="/richieste"
          />
        ) : (
          <>
            <StatCard
              label="Ferie rimanenti (giorni)"
              value={balance.ferieRemaining}
              sub={`su ${formatAmount(balance.ferieAllowance)}`}
              href="/richieste"
            />
            <StatCard
              label="Permesso rimanente (ore)"
              value={balance.permessoRemaining}
              sub={`su ${formatAmount(balance.permessoAllowance)}`}
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
                <li
                  key={request.id}
                  className="flex items-center justify-between border-b pb-2 last:border-0"
                >
                  <span>
                    {LEAVE_TYPE_LABELS[
                      request.type as keyof typeof LEAVE_TYPE_LABELS
                    ] ?? request.type}
                  </span>
                  <span className="text-muted-foreground">
                    {formatRange(request.startDate, request.endDate)}
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
                  <Badge variant={eventTypeStyle(event.type).tone}>
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
