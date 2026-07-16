import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  addMonths,
  endOfMonth,
  formatMonthYear,
  startOfMonth,
} from "@/lib/calendar-utils";
import {
  buildAttendanceMap,
  monthQuery,
  parseMonthParam,
} from "@/lib/attendance-utils";
import { AttendanceSection } from "@/components/presenze/AttendanceSection";
import { AttendanceTeamMonthCalendar } from "@/components/presenze/AttendanceTeamMonthCalendar";
import { MonthNav } from "@/components/presenze/MonthNav";
import { NewPresenceDialog } from "@/components/presenze/NewPresenceDialog";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";

type AttendanceView = "individuale" | "generale";

export default async function PresenzePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const user = await requireUser();
  const { month: monthParam, view: viewParam } = await searchParams;

  const view: AttendanceView = viewParam === "generale" ? "generale" : "individuale";

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Presenze</h1>
          <p className="text-sm text-muted-foreground">
            Segna i giorni in cui sei in ufficio o in smartworking.
          </p>
        </div>
        <NewPresenceDialog />
      </div>

      <div className="space-y-3">
        {/* Pagina personale + vista d'insieme: il calendario dei singoli altri
            membri si consulta e modifica dalla loro scheda in /team/[id]. */}
        <SegmentedLinkTabs
          items={[
            {
              key: "individuale",
              label: "Il mio calendario",
              href: monthParam ? `/presenze?month=${monthParam}` : "/presenze",
              active: view === "individuale",
            },
            {
              key: "generale",
              label: "Tutto il team",
              href: `/presenze?view=generale${monthParam ? `&month=${monthParam}` : ""}`,
              active: view === "generale",
            },
          ]}
        />

        {view === "generale" ? (
          <TeamAttendance monthParam={monthParam} />
        ) : (
          <AttendanceSection
            userId={user.id}
            editable
            basePath="/presenze"
            monthParam={monthParam}
          />
        )}
      </div>
    </div>
  );
}

async function TeamAttendance({ monthParam }: { monthParam?: string }) {
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

  const attendanceMap = buildAttendanceMap({ leaveRequests, presenceEntries });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          todayHref="/presenze?view=generale"
          prevHref={`/presenze?view=generale&month=${monthQuery(addMonths(current, -1))}`}
          nextHref={`/presenze?view=generale&month=${monthQuery(addMonths(current, 1))}`}
          monthLabel={formatMonthYear(current)}
        />
      </div>
      <AttendanceTeamMonthCalendar
        current={current}
        users={activeUsers}
        map={attendanceMap}
      />
    </>
  );
}
