import { prisma } from "@/lib/prisma";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { addMonths, endOfMonth, formatMonthYear, startOfMonth } from "@/lib/calendar-utils";
import { buildAttendanceMap, monthQuery, parseMonthParam } from "@/lib/attendance-utils";
import { appendQuery } from "@/lib/utils";
import { AttendanceTeamMonthCalendar } from "@/components/presenze/AttendanceTeamMonthCalendar";
import { MonthNav } from "@/components/presenze/MonthNav";

// Presenze e assenze di tutto il team nel mese (Calendario → Presenze del
// team). Il calendario dei singoli si consulta dalla loro scheda in Persone.
export async function TeamAttendanceView({
  monthParam,
  viewer,
  basePath,
}: {
  monthParam?: string;
  viewer: { id: string; role: string };
  // Pagina che ospita la vista (es. "/calendario?vista=team").
  basePath: string;
}) {
  const current = parseMonthParam(monthParam);
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);

  const [activeUsers, leaveRequests, presenceEntries] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.leaveRequest.findMany({
      where: {
        user: { active: true },
        status: { not: "rejected" },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.presenceEntry.findMany({
      where: {
        user: { active: true },
        date: { gte: monthStart, lte: monthEnd },
      },
    }),
  ]);

  const attendanceMap = buildAttendanceMap({
    leaveRequests: leaveRequests.map((leave) => maskLeaveForViewer(leave, viewer)),
    presenceEntries,
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          todayHref={basePath}
          prevHref={appendQuery(basePath, { month: monthQuery(addMonths(current, -1)) })}
          nextHref={appendQuery(basePath, { month: monthQuery(addMonths(current, 1)) })}
          monthLabel={formatMonthYear(current)}
          current={monthQuery(current)}
        />
      </div>
      <AttendanceTeamMonthCalendar current={current} users={activeUsers} map={attendanceMap} />
    </div>
  );
}
