import { prisma } from "@/lib/prisma";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { addMonths, endOfMonth, formatMonthYear, startOfMonth } from "@/lib/calendar-utils";
import { buildAttendanceMap, dateKey, monthQuery, parseMonthParam } from "@/lib/attendance-utils";
import { isAdminRole, isHourlyLeave, isSensitiveLeave } from "@/lib/constants";
import { peopleInScope } from "@/lib/permissions";
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

  // Note delle richieste per il popup: solo quelle che chi guarda può già
  // leggere nella scheda della persona (ScopedMemberView): le proprie, tutte
  // per gli admin, quelle delle persone su cui ha i permessi "richieste" o
  // "approvare" (es. il responsabile del reparto, da Keycloak). La malattia
  // altrui resta esclusa: lì il mascheramento vale per ruolo, non per reparto.
  // Per gli altri la nota non parte nemmeno verso il browser. Chiave: utente__giorno__tipo.
  const [richiesteScope, approvareScope] = await Promise.all([
    peopleInScope(viewer, "richieste"),
    peopleInScope(viewer, "approvare"),
  ]);
  const inScope = (userId: string) =>
    richiesteScope === "all" ||
    approvareScope === "all" ||
    richiesteScope.includes(userId) ||
    approvareScope.includes(userId);
  const notes: Record<string, string> = {};
  for (const leave of leaveRequests) {
    if (!leave.note || leave.status === "rejected") continue;
    const own = leave.userId === viewer.id;
    const admin = isAdminRole(viewer.role);
    if (!own && !admin && (isSensitiveLeave(leave.type) || !inScope(leave.userId))) continue;
    if (isHourlyLeave(leave)) {
      notes[`${leave.userId}__${dateKey(leave.startDate)}__hourly`] = leave.note;
      continue;
    }
    for (
      let cursor = leave.startDate;
      cursor <= leave.endDate;
      cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1)
    ) {
      notes[`${leave.userId}__${dateKey(cursor)}__leave`] = leave.note;
    }
  }

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
      <AttendanceTeamMonthCalendar
        current={current}
        users={activeUsers}
        entries={[...attendanceMap]}
        notes={notes}
      />
    </div>
  );
}
