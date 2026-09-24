import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { CalendarView } from "@/components/calendar/CalendarView";

export default async function CalendarioPage() {
  const user = await requireUser();

  // Finestra: dall'inizio dell'anno scorso in poi. Senza un limite la pagina
  // caricherebbe per sempre tutti gli eventi mai creati.
  const eventsFrom = new Date(new Date().getFullYear() - 1, 0, 1);

  const [calendarUsers, calendarEvents] = await Promise.all([
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
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1>Calendario</h1>
        <p className="text-sm text-muted-foreground">
          Riunioni di team, shooting e altri eventi.
        </p>
      </div>

      <CalendarView
        events={calendarEvents}
        users={calendarUsers}
        currentUserId={user.id}
        isSuperAdmin={user.role === "super_admin"}
      />
    </div>
  );
}
