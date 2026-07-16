import { prisma } from "@/lib/prisma";
import { appendQuery } from "@/lib/utils";
import { addMonths, endOfMonth, formatMonthYear, startOfMonth } from "@/lib/calendar-utils";
import {
  buildAttendanceMap,
  monthQuery,
  parseMonthParam,
} from "@/lib/attendance-utils";
import { AttendanceMonthCalendar } from "@/components/presenze/AttendanceMonthCalendar";

// Calendario presenze mensile di un singolo utente. Usato sia da /presenze
// (il proprio) sia dalla scheda membro in /team/[id] (quello altrui, per il
// super admin): stessa vista, nessuna duplicazione.
export async function AttendanceSection({
  userId,
  editable,
  basePath,
  monthParam,
}: {
  userId: string;
  editable: boolean;
  // Pagina che ospita la sezione (es. "/presenze" o "/team/abc?tab=presenze"):
  // la navigazione mese aggiunge solo ?month=... a questo href.
  basePath: string;
  monthParam?: string;
}) {
  const current = parseMonthParam(monthParam);
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);

  const [leaveRequests, presenceEntries] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        userId,
        status: { not: "rejected" },
        startDate: { lte: monthEnd },
        endDate: { gte: monthStart },
      },
    }),
    prisma.presenceEntry.findMany({
      where: {
        userId,
        date: { gte: monthStart, lte: monthEnd },
      },
    }),
  ]);

  const attendanceMap = buildAttendanceMap({ leaveRequests, presenceEntries });

  return (
    <AttendanceMonthCalendar
      current={current}
      userId={userId}
      entries={Array.from(attendanceMap.entries())}
      editable={editable}
      todayHref={basePath}
      prevHref={appendQuery(basePath, { month: monthQuery(addMonths(current, -1)) })}
      nextHref={appendQuery(basePath, { month: monthQuery(addMonths(current, 1)) })}
      monthLabel={formatMonthYear(current)}
    />
  );
}
