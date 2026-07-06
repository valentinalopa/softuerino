import { prisma } from "@/lib/prisma";
import { createUser, toggleUserActive } from "@/lib/actions";

export default async function TeamPage() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-gray-500">
          Membri del team e loro stato.
        </p>
      </div>

      <section className="rounded-lg border border-black/10 bg-white p-4">
        <h2 className="mb-3 font-medium">Aggiungi membro</h2>
        <form action={createUser} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="name">
              Nome
            </label>
            <input
              id="name"
              name="name"
              required
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-500" htmlFor="role">
              Ruolo
            </label>
            <select
              id="role"
              name="role"
              className="rounded border border-black/15 px-3 py-1.5 text-sm"
              defaultValue="member"
            >
              <option value="member">Membro</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button
            type="submit"
            className="rounded bg-black px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Aggiungi
          </button>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-black/10 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-100 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Email</th>
              <th className="px-4 py-2">Ruolo</th>
              <th className="px-4 py-2">Stato</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-t border-black/5">
                <td className="px-4 py-2 font-medium">{user.name}</td>
                <td className="px-4 py-2 text-gray-600">{user.email}</td>
                <td className="px-4 py-2 capitalize">{user.role}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      user.active
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {user.active ? "Attivo" : "Disattivato"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <form
                    action={toggleUserActive.bind(null, user.id, !user.active)}
                  >
                    <button
                      type="submit"
                      className="text-xs text-gray-500 hover:underline"
                    >
                      {user.active ? "Disattiva" : "Riattiva"}
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-400">
                  Nessun membro del team ancora.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
