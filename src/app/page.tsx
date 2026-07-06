import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { LEAVE_TYPE_LABELS, EVENT_TYPE_LABELS } from "@/lib/constants";

export default async function Home() {
  const [activeUsers, pendingRequests, upcomingEvents] = await Promise.all([
    prisma.user.count({ where: { active: true } }),
    prisma.leaveRequest.findMany({
      where: { status: "pending" },
      include: { user: true },
      orderBy: { startDate: "asc" },
      take: 5,
    }),
    prisma.calendarEvent.findMany({
      where: { startAt: { gte: new Date() } },
      orderBy: { startAt: "asc" },
      take: 5,
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-gray-500">
          Panoramica del team: ferie, permessi, smartworking e calendario.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Membri attivi" value={activeUsers} href="/team" />
        <StatCard
          label="Richieste in attesa"
          value={pendingRequests.length}
          href="/richieste"
        />
        <StatCard
          label="Eventi in programma"
          value={upcomingEvents.length}
          href="/calendario"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-lg border border-black/10 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Richieste in attesa</h2>
            <Link
              href="/richieste"
              className="text-xs text-gray-500 hover:underline"
            >
              Vedi tutte
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {pendingRequests.map((request) => (
              <li
                key={request.id}
                className="flex items-center justify-between border-b border-black/5 pb-2 last:border-0"
              >
                <span>{request.user.name}</span>
                <span className="text-gray-500">
                  {LEAVE_TYPE_LABELS[
                    request.type as keyof typeof LEAVE_TYPE_LABELS
                  ] ?? request.type}
                </span>
              </li>
            ))}
            {pendingRequests.length === 0 && (
              <li className="text-gray-400">Nessuna richiesta in attesa.</li>
            )}
          </ul>
        </section>

        <section className="rounded-lg border border-black/10 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-medium">Prossimi eventi</h2>
            <Link
              href="/calendario"
              className="text-xs text-gray-500 hover:underline"
            >
              Vedi tutti
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {upcomingEvents.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between border-b border-black/5 pb-2 last:border-0"
              >
                <span>{event.title}</span>
                <span className="text-gray-500">
                  {EVENT_TYPE_LABELS[
                    event.type as keyof typeof EVENT_TYPE_LABELS
                  ] ?? event.type}
                </span>
              </li>
            ))}
            {upcomingEvents.length === 0 && (
              <li className="text-gray-400">Nessun evento in programma.</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="rounded-lg border border-black/10 bg-white p-4 hover:border-black/30"
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold">{value}</p>
    </Link>
  );
}
