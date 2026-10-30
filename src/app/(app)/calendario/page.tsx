import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { Users } from "lucide-react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { buttonVariants } from "@/components/ui/button";
import { isAdminRole } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Calendario" };

export default async function CalendarioPage({
  searchParams,
}: {
  // ?evento=<id>: apre il calendario sul giorno dell'evento con il dettaglio
  // aperto (link dalla dashboard).
  searchParams: Promise<{ evento?: string }>;
}) {
  const user = await requireUser();
  const { evento } = await searchParams;

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
        startTime: true,
        endTime: true,
        user: { select: { name: true } },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Calendario</h1>
          <p className="text-sm text-muted-foreground">
            Riunioni di team, shooting e altri eventi.
          </p>
        </div>
        <Link
          href="/presenze?view=generale"
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "-ml-2.5 self-start sm:ml-0")}
        >
          <Users />
          Vedi presenze del team
        </Link>
      </div>

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
    </div>
  );
}
