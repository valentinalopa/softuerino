import Link from "next/link";
import { cn } from "@/lib/utils";
import { CalendarDays } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
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
import { buttonVariants } from "@/components/ui/button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Presenze" };

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
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Presenze</h1>
          <p className="text-sm text-muted-foreground">
            Segna i giorni in cui sei in ufficio o in smartworking.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/calendario" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 self-start sm:ml-0")}>
            <CalendarDays />
            Vedi calendario eventi
          </Link>
          <NewPresenceDialog />
        </div>
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
          <TeamAttendance monthParam={monthParam} viewer={user} />
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

async function TeamAttendance({
  monthParam,
  viewer,
}: {
  monthParam?: string;
  viewer: { id: string; role: string };
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
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <MonthNav
          todayHref="/presenze?view=generale"
          prevHref={`/presenze?view=generale&month=${monthQuery(addMonths(current, -1))}`}
          nextHref={`/presenze?view=generale&month=${monthQuery(addMonths(current, 1))}`}
          monthLabel={formatMonthYear(current)}
          current={monthQuery(current)}
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
