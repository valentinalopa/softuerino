import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import {
  buildClientTotals,
  buildHoursByClientByMonth,
  buildLeaveTotals,
} from "@/lib/panoramica-utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { HoursByClientChart } from "@/components/panoramica/HoursByClientChart";
import { ClientDistributionChart } from "@/components/panoramica/ClientDistributionChart";
import { LeaveStatsChart } from "@/components/panoramica/LeaveStatsChart";

const MONTHS_BACK = 12;

export default async function PanoramicaPage() {
  await requireSuperAdmin();

  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

  const [timeEntries, leaveRequests] = await Promise.all([
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
        <h1 className="text-2xl font-semibold">Panoramica</h1>
        <p className="text-sm text-muted-foreground">
          Andamento ore per cliente e ferie/permessi/malattia di tutto il team.
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
