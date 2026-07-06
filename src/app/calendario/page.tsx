import { prisma } from "@/lib/prisma";
import { createEvent, deleteEvent } from "@/lib/actions";
import { EVENT_TYPES, EVENT_TYPE_LABELS } from "@/lib/constants";

export default async function CalendarioPage() {
  const [users, events] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.calendarEvent.findMany({
      include: { participants: { include: { user: true } } },
      orderBy: { startAt: "asc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Calendario</h1>
        <p className="text-sm text-gray-500">
          Riunioni di team, shooting e altri eventi.
        </p>
      </div>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 font-medium">Nuovo evento</h2>
        <form action={createEvent} className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500" htmlFor="title">
                Titolo
              </label>
              <input
                id="title"
                name="title"
                required
                className="rounded border border-black/15 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500" htmlFor="type">
                Tipo
              </label>
              <select
                id="type"
                name="type"
                className="rounded border border-black/15 px-3 py-1.5 text-sm"
                defaultValue={EVENT_TYPES[0]}
              >
                {EVENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {EVENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500" htmlFor="startAt">
                Inizio
              </label>
              <input
                id="startAt"
                name="startAt"
                type="datetime-local"
                required
                className="rounded border border-black/15 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500" htmlFor="endAt">
                Fine
              </label>
              <input
                id="endAt"
                name="endAt"
                type="datetime-local"
                required
                className="rounded border border-black/15 px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-gray-500" htmlFor="location">
                Luogo
              </label>
              <input
                id="location"
                name="location"
                className="rounded border border-black/15 px-3 py-1.5 text-sm"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500">Partecipanti</label>
            <div className="flex flex-wrap gap-3">
              {users.map((user) => (
                <label
                  key={user.id}
                  className="flex items-center gap-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="participantIds"
                    value={user.id}
                  />
                  {user.name}
                </label>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="description">
              Descrizione
            </label>
            <textarea
              id="description"
              name="description"
              rows={2}
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <button
              type="submit"
              className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
            >
              Crea evento
            </button>
          </div>
        </form>
      </section>

      <section className="space-y-3">
        {events.map((event) => (
          <div
            key={event.id}
            className="rounded-lg border border-black/10 bg-white p-4"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{event.title}</h3>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {EVENT_TYPE_LABELS[
                      event.type as keyof typeof EVENT_TYPE_LABELS
                    ] ?? event.type}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">
                  {formatDateTime(event.startAt)} → {formatDateTime(event.endAt)}
                  {event.location ? ` · ${event.location}` : ""}
                </p>
                {event.description && (
                  <p className="mt-1 text-sm text-gray-600">
                    {event.description}
                  </p>
                )}
                {event.participants.length > 0 && (
                  <p className="mt-2 text-xs text-gray-500">
                    Partecipanti:{" "}
                    {event.participants
                      .map((participant) => participant.user.name)
                      .join(", ")}
                  </p>
                )}
              </div>
              <form action={deleteEvent.bind(null, event.id)}>
                <button
                  type="submit"
                  className="text-xs text-gray-400 hover:text-red-600 hover:underline"
                >
                  Elimina
                </button>
              </form>
            </div>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-center text-gray-400">
            Nessun evento in calendario.
          </p>
        )}
      </section>
    </div>
  );
}

function formatDateTime(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
