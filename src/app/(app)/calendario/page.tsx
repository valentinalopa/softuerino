import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import Link from "next/link";
import { Users } from "lucide-react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { buttonVariants } from "@/components/ui/button";
import { isAdminRole } from "@/lib/constants";

export default async function CalendarioPage() {
  const user = await requireUser();

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
    // Stesse assenze che si vedono in Presenze → Tutto il team.
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
        user: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Calendario</h1>
          <p className="text-sm text-muted-foreground">
            Riunioni di team, shooting e altri eventi.
          </p>
        </div>
        <Link
          href="/presenze?view=generale"
          className={buttonVariants({ variant: "ghost", size: "sm" })}
        >
          <Users />
          Vedi presenze del team
        </Link>
      </div>

      <CalendarView
        events={calendarEvents}
        absences={leaveRequests.map(({ user, ...absence }) => ({
          ...absence,
          userName: user.name,
        }))}
        users={calendarUsers}
        currentUserId={user.id}
        isAdmin={isAdminRole(user.role)}
      />
    </div>
  );
}
