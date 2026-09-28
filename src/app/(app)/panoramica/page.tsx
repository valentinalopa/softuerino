import Link from "next/link";
import { Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import {
  buildClientTotals,
  buildHoursByClientByMonth,
  buildLeaveTotals,
} from "@/lib/panoramica-utils";
import { formatRange } from "@/lib/leave-format";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { NotificationCard } from "@/components/richieste/NotificationCard";
import { ApproveRejectActions } from "@/components/richieste/ApproveRejectActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoursByClientChart } from "@/components/panoramica/HoursByClientChart";
import { ClientDistributionChart } from "@/components/panoramica/ClientDistributionChart";
import { LeaveStatsChart } from "@/components/panoramica/LeaveStatsChart";

const MONTHS_BACK = 12;
// Quante richieste da approvare mostrare in cima: il resto è in /richieste-team.
const PENDING_PREVIEW = 5;

export default async function PanoramicaPage() {
  const user = await requireSuperAdmin();

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  const [timeEntries, leaveRequests, teamPending, teamPendingCount] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { date: { gte: windowStart } },
      select: {
        date: true,
        hours: true,
        clientId: true,
        client: { select: { name: true } },
      },
    }),
    prisma.leaveRequest.findMany({
      where: { startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
    }),
    // Stesso criterio di /richieste-team: le richieste degli altri membri.
    prisma.leaveRequest.findMany({
      where: { userId: { not: user.id }, status: "pending" },
      include: { user: { select: { name: true } } },
      orderBy: { startDate: "asc" },
      take: PENDING_PREVIEW,
    }),
    prisma.leaveRequest.count({
      where: { userId: { not: user.id }, status: "pending" },
    }),
  ]);

  const hoursEntries = timeEntries.map((entry) => ({
    date: entry.date,
    hours: entry.hours,
    clientId: entry.clientId,
    clientName: entry.client.name,
  }));

  const hoursByClientByMonth = buildHoursByClientByMonth(hoursEntries, MONTHS_BACK);
  const clientTotals = buildClientTotals(hoursEntries);
  const leaveTotals = buildLeaveTotals(leaveRequests, yearStart, yearEnd);

  return (
    <div className="space-y-8">
      <div>
        <h1>Panoramica</h1>
        <p className="text-sm text-muted-foreground">
          Andamento ore per cliente e ferie/permessi/malattia di tutto il team.
        </p>
      </div>

      {teamPendingCount > 0 && (
        <NotificationCard
          icon={Clock3}
          title={`${teamPendingCount} richiest${teamPendingCount === 1 ? "a" : "e"} da approvare`}
        >
          {teamPending.map((request) => (
            <li
              key={request.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/15 pb-2 last:border-0 last:pb-0"
            >
              <span>
                <span className="font-medium">{request.user.name}</span>{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}{" "}
                  · {formatRange(request.startDate, request.endDate)}
                </span>
              </span>
              <ApproveRejectActions requestId={request.id} />
            </li>
          ))}
          <li className="pt-1">
            <Link href="/richieste-team" className="text-xs text-muted-foreground hover:underline">
              {teamPendingCount > PENDING_PREVIEW
                ? `Vedi tutte (${teamPendingCount})`
                : "Vai a Richieste del team"}
            </Link>
          </li>
        </NotificationCard>
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ore per cliente nel tempo</CardTitle>
          </CardHeader>
          <CardContent>
            <HoursByClientChart
              rows={hoursByClientByMonth.rows}
              clients={hoursByClientByMonth.clients}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuzione ore per cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <ClientDistributionChart totals={clientTotals} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ferie, permessi e malattia ({now.getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveStatsChart totals={leaveTotals} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
