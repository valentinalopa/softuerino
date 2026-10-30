import Link from "next/link";
import { ChevronRight, Download } from "lucide-react";
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
import { monthQuery } from "@/lib/attendance-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoursByClientChart } from "@/components/panoramica/HoursByClientChart";
import { ClientDistributionChart } from "@/components/panoramica/ClientDistributionChart";
import { LeaveStatsChart } from "@/components/panoramica/LeaveStatsChart";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Report" };

const MONTHS_BACK = 12;

// Report: solo analisi ed esportazioni. Le cose da fare (richieste da
// approvare) stanno in Oggi e in Richieste.
export default async function ReportPage() {
  await requireAdmin();

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  const [timeEntries, leaveRequests] = await Promise.all([
    loadClientHoursEntries(windowStart),
    prisma.leaveRequest.findMany({
      where: { startDate: { lte: yearEnd }, endDate: { gte: yearStart } },
      include: { user: { select: { employmentType: true } } },
    }),
  ]);

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
          Ore per cliente e assenze di tutto il team, con le esportazioni.
        </p>
      </div>

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

        <Card>
          <CardHeader>
            <CardTitle>Esportazioni</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              <li>
                <a href="/api/ore-clienti" className="group flex items-center gap-3 py-3">
                  <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium group-hover:underline">Ore per cliente (CSV)</span>
                    <span className="block text-xs text-muted-foreground">
                      Ultimi {MONTHS_BACK} mesi, con la ripartizione delle voci
                    </span>
                  </span>
                </a>
              </li>
              <li>
                <a href={`/api/riepilogo-mensile?month=${monthQuery(now)}`} className="group flex items-center gap-3 py-3">
                  <Download className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium group-hover:underline">Riepilogo assenze del mese (CSV)</span>
                    <span className="block text-xs text-muted-foreground">Per il consulente del lavoro</span>
                  </span>
                </a>
              </li>
              <li>
                <Link href="/richieste?vista=team&view=mensile" className="group flex items-center gap-3 py-3">
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium group-hover:underline">Riepilogo mensile, altri mesi</span>
                    <span className="block text-xs text-muted-foreground">In Richieste → Del team</span>
                  </span>
                </Link>
              </li>
            </ul>
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
