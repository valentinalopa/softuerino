import { prisma } from "@/lib/prisma";
import { createLeaveRequest, updateLeaveStatus } from "@/lib/actions";
import {
  LEAVE_TYPES,
  LEAVE_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
  type LeaveStatus,
} from "@/lib/constants";

export default async function RichiestePage() {
  const [users, requests] = await Promise.all([
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
    }),
    prisma.leaveRequest.findMany({
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Ferie & permessi</h1>
        <p className="text-sm text-gray-500">
          Richieste di ferie, permessi e smartworking del team.
        </p>
      </div>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 font-medium">Nuova richiesta</h2>
        <form
          action={createLeaveRequest}
          className="flex flex-wrap items-end gap-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="userId">
              Membro
            </label>
            <select
              id="userId"
              name="userId"
              required
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="type">
              Tipo
            </label>
            <select
              id="type"
              name="type"
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
              defaultValue={LEAVE_TYPES[0]}
            >
              {LEAVE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {LEAVE_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="startDate">
              Dal
            </label>
            <input
              id="startDate"
              name="startDate"
              type="date"
              required
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="endDate">
              Al
            </label>
            <input
              id="endDate"
              name="endDate"
              type="date"
              required
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="note">
              Nota
            </label>
            <input
              id="note"
              name="note"
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Invia richiesta
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Membro</th>
              <th className="px-4 py-2">Tipo</th>
              <th className="px-4 py-2">Periodo</th>
              <th className="px-4 py-2">Nota</th>
              <th className="px-4 py-2">Stato</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id} className="border-t border-black/5">
                <td className="px-4 py-2 font-medium">{request.user.name}</td>
                <td className="px-4 py-2">
                  {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ??
                    request.type}
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {formatDate(request.startDate)} → {formatDate(request.endDate)}
                </td>
                <td className="px-4 py-2 text-gray-500">{request.note ?? "—"}</td>
                <td className="px-4 py-2">
                  <StatusBadge status={request.status as LeaveStatus} />
                </td>
                <td className="px-4 py-2 text-right">
                  {request.status === "pending" && (
                    <div className="flex justify-end gap-2">
                      <form
                        action={updateLeaveStatus.bind(
                          null,
                          request.id,
                          "approved"
                        )}
                      >
                        <button
                          type="submit"
                          className="text-xs text-green-700 hover:underline"
                        >
                          Approva
                        </button>
                      </form>
                      <form
                        action={updateLeaveStatus.bind(
                          null,
                          request.id,
                          "rejected"
                        )}
                      >
                        <button
                          type="submit"
                          className="text-xs text-red-600 hover:underline"
                        >
                          Rifiuta
                        </button>
                      </form>
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                  Nessuna richiesta ancora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function StatusBadge({ status }: { status: LeaveStatus }) {
  const styles: Record<LeaveStatus, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>
      {LEAVE_STATUS_LABELS[status]}
    </span>
  );
}
