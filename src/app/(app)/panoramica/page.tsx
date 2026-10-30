import Link from "next/link";
import { Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import {
  buildClientBreakdown,
  buildClientTotals,
  buildHoursByClientByMonth,
  buildLeaveTotals,
  rollUpToParent,
} from "@/lib/panoramica-utils";
import { loadClientHoursEntries } from "@/lib/client-hours";
import { ClientBreakdownTable } from "@/components/panoramica/ClientBreakdownTable";
import { buttonVariants } from "@/components/ui/button";
import { Download } from "lucide-react";
import { getPendingOverdrafts } from "@/lib/leave-balance";
import { NotificationCard, TeamPendingItem } from "@/components/richieste/NotificationCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoursByClientChart } from "@/components/panoramica/HoursByClientChart";
import { ClientDistributionChart } from "@/components/panoramica/ClientDistributionChart";
import { LeaveStatsChart } from "@/components/panoramica/LeaveStatsChart";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Report" };

const MONTHS_BACK = 12;
// Quante richieste da approvare mostrare in cima: il resto è in /richieste-team.
const PENDING_PREVIEW = 5;

export default async function PanoramicaPage() {
  await requireAdmin();

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  const [timeEntries, leaveRequests, teamPending, teamPendingCount] = await Promise.all([
    loadClientHoursEntries(windowStart),
    prisma.leaveRequest.findMany({
      where: { startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
      include: { user: { select: { employmentType: true } } },
    }),
    // Stesso criterio di /richieste-team: tutte quelle in attesa.
    prisma.leaveRequest.findMany({
      where: { status: "pending" },
      include: {
        user: { select: { name: true, employmentType: true } },
        recoveryCredit: { select: { reason: true, amount: true, unit: true } },
      },
      orderBy: { startDate: "asc" },
      take: PENDING_PREVIEW,
    }),
    prisma.leaveRequest.count({ where: { status: "pending" } }),
  ]);
  const overdrafts = await getPendingOverdrafts(teamPending);

  // Nei grafici le voci (es. "Organizzazione IT") contano nel loro cliente;
  // la tabella sotto mostra la ripartizione.
  const hoursEntries = rollUpToParent(timeEntries);
  const clientBreakdown = buildClientBreakdown(timeEntries, MONTHS_BACK);

  const hoursByClientByMonth = buildHoursByClientByMonth(hoursEntries, MONTHS_BACK);
  const clientTotals = buildClientTotals(hoursEntries);
  // La chiusura aziendale scala ferie o assenze a seconda del contratto.
  const employmentTypeByUser = new Map(leaveRequests.map((r) => [r.userId, r.user.employmentType]));
  const leaveTotals = buildLeaveTotals(leaveRequests, yearStart, yearEnd, (userId) =>
    employmentTypeByUser.get(userId)
  );

  return (
    <div className="space-y-8">
      <div>
        <h1>Report</h1>
        <p className="text-sm text-muted-foreground">
          Ore per cliente e assenze di tutto il team, con esportazione.
        </p>
      </div>

      {teamPendingCount > 0 && (
        <NotificationCard
          icon={Clock3}
          title={`${teamPendingCount} richiest${teamPendingCount === 1 ? "a" : "e"} da approvare`}
        >
          {teamPending.map((request) => (
            <TeamPendingItem key={request.id} request={request} overdraft={overdrafts.get(request.id)} />
          ))}
          <li className="pt-2.5">
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
            <CardTitle>Assenze del team ({now.getFullYear()})</CardTitle>
          </CardHeader>
          <CardContent>
            <LeaveStatsChart totals={leaveTotals} />
          </CardContent>
        </Card>

        <Card className="md:col-span-2">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <CardTitle>Ore per cliente (ultimi {MONTHS_BACK} mesi)</CardTitle>
            <a
              href="/api/ore-clienti"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <Download />
              Esporta CSV
            </a>
          </CardHeader>
          <CardContent>
            <ClientBreakdownTable rows={clientBreakdown.rows} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
