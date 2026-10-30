import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { CalendarView } from "@/components/calendar/CalendarView";
import { isAdminRole } from "@/lib/constants";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { AttendanceSection } from "@/components/presenze/AttendanceSection";
import { TeamAttendanceView } from "@/components/presenze/TeamAttendanceView";
import { NewPresenceDialog } from "@/components/presenze/NewPresenceDialog";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calendario" };

type Vista = "eventi" | "presenze" | "team";

const VISTA_HREF: Record<Vista, string> = {
  eventi: "/calendario",
  presenze: "/calendario?vista=presenze",
  team: "/calendario?vista=team",
};

// Calendario: un'unica pagina per eventi e presenze (prima c'era anche la
// pagina Presenze). Viste: Eventi, Le mie presenze (da segnare), Presenze del
// team (chi è in ufficio, in smartworking o assente).
export default async function CalendarioPage({
  searchParams,
}: {
  // ?evento=<id>: apre il calendario sul giorno dell'evento con il dettaglio
  // aperto (link dalla dashboard). ?month=AAAA-MM: mese delle presenze.
  searchParams: Promise<{ evento?: string; vista?: string; month?: string }>;
}) {
  const user = await requireUser();
  const { evento, vista: vistaParam, month } = await searchParams;
  const vista: Vista = vistaParam === "presenze" || vistaParam === "team" ? vistaParam : "eventi";

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Calendario</h1>
          <p className="text-sm text-muted-foreground">
            {vista === "eventi"
              ? "Riunioni, shooting e altri eventi."
              : vista === "presenze"
                ? "Segna i giorni in cui sei in ufficio o in smartworking."
                : "Chi è in ufficio, in smartworking o assente, giorno per giorno."}
          </p>
        </div>
        {vista === "presenze" && <NewPresenceDialog />}
      </div>

      <SegmentedLinkTabs
        items={[
          { key: "eventi", label: "Eventi", href: VISTA_HREF.eventi, active: vista === "eventi" },
          { key: "presenze", label: "Le mie presenze", href: VISTA_HREF.presenze, active: vista === "presenze" },
          { key: "team", label: "Presenze del team", href: VISTA_HREF.team, active: vista === "team" },
        ]}
      />

      {vista === "eventi" && <EventsView user={user} evento={evento} />}
      {vista === "presenze" && (
        <AttendanceSection userId={user.id} editable basePath={VISTA_HREF.presenze} monthParam={month} />
      )}
      {vista === "team" && <TeamAttendanceView monthParam={month} viewer={user} basePath={VISTA_HREF.team} />}
    </div>
  );
}

async function EventsView({ user, evento }: { user: { id: string; role: string }; evento?: string }) {

  // Finestra: dall'inizio dell'anno scorso in poi. Senza un limite la pagina
  // caricherebbe per sempre tutti gli eventi mai creati.
  const eventsFrom = new Date(new Date().getFullYear() - 1, 0, 1);

  const [calendarUsers, calendarEvents, leaveRequests] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.calendarEvent.findMany({
      where: { endAt: { gte: eventsFrom } },
      select: {
        id: true,
        title: true,
        type: true,
        startAt: true,
        endAt: true,
        location: true,
        description: true,
        createdById: true,
        participants: {
          select: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { startAt: "asc" },
    }),
    // Stesse assenze che si vedono in Presenze del team.
    prisma.leaveRequest.findMany({
      where: {
        status: { not: "rejected" },
        endDate: { gte: eventsFrom },
        user: { active: true },
      },
      select: {
        id: true,
        userId: true,
        type: true,
        status: true,
        startDate: true,
        endDate: true,
        hours: true,
        startTime: true,
        endTime: true,
        user: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return (
    <CalendarView
      events={calendarEvents}
      absences={leaveRequests.map(({ user: absentUser, ...absence }) => ({
        ...maskLeaveForViewer(absence, user),
        userName: absentUser.name,
      }))}
      users={calendarUsers}
      currentUserId={user.id}
      isAdmin={isAdminRole(user.role)}
      initialEventId={evento}
    />
  );
}
