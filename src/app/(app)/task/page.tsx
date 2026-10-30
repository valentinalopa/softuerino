import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { purgeExpiredDoneTasks } from "@/lib/actions";
import { isAdminRole, TASK_DONE_RETENTION_DAYS } from "@/lib/constants";
import { NewTaskDialog } from "@/components/task/NewTaskDialog";
import { TaskFilters } from "@/components/task/TaskFilters";
import { TasksTable } from "@/components/task/TasksTable";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { Card, CardContent } from "@/components/ui/card";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Task" };

type View = "attivi" | "completati";

export default async function TaskPage({
  searchParams,
}: {
  searchParams: Promise<{ user?: string; client?: string; view?: string; sort?: string; dir?: string }>;
}) {
  const currentUser = await requireUser();

  const { user: userParam, client: clientParam, view: viewParam, sort: sortParam, dir: dirParam } =
    await searchParams;
  const view: View = viewParam === "completati" ? "completati" : "attivi";
  // I membri partono dai propri task; "Tutte le persone" mette user=all
  // nell'URL. Gli admin partono da tutti, come prima.
  const mineByDefault = !isAdminRole(currentUser.role);
  const userFilter =
    userParam === "all" ? undefined : (userParam ?? (mineByDefault ? currentUser.id : undefined));

  // Il purge gira in parallelo alle letture (niente round-trip bloccante in
  // testa alla pagina); i task scaduti che non ha ancora eliminato vengono
  // comunque esclusi dalla query con il filtro su completedAt.
  const purgeCutoff = new Date();
  purgeCutoff.setDate(purgeCutoff.getDate() - TASK_DONE_RETENTION_DAYS);

  const [tasks, users, clients] = await Promise.all([
    prisma.task.findMany({
      where: {
        ...(userFilter ? { assignees: { some: { userId: userFilter } } } : {}),
        ...(clientParam ? { clientId: clientParam } : {}),
        ...(view === "attivi"
          ? { status: { not: "done" } }
          : { status: "done", completedAt: { gte: purgeCutoff } }),
      },
      include: {
        client: { select: { id: true, name: true } },
        assignees: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.client.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    purgeExpiredDoneTasks(),
  ]);

  const carriedParams = new URLSearchParams();
  if (userParam) carriedParams.set("user", userParam);
  if (clientParam) carriedParams.set("client", clientParam);
  // L'ordinamento (lo applica TasksTable) resta passando tra Attivi e Completati.
  if (sortParam) carriedParams.set("sort", sortParam);
  if (dirParam) carriedParams.set("dir", dirParam);
  const viewHref = (v: View) => {
    const params = new URLSearchParams(carriedParams);
    if (v !== "attivi") params.set("view", v);
    const qs = params.toString();
    return qs ? `/task?${qs}` : "/task";
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Task</h1>
          <p className="text-sm text-muted-foreground">
            Assegna e tieni traccia dei task del team.
          </p>
        </div>
        <NewTaskDialog users={users} clients={clients} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SegmentedLinkTabs
          items={[
            { key: "attivi", label: "Attivi", href: viewHref("attivi"), active: view === "attivi" },
            {
              key: "completati",
              label: "Completati",
              href: viewHref("completati"),
              active: view === "completati",
            },
          ]}
        />
        <TaskFilters
          users={users}
          clients={clients}
          currentUserId={currentUser.id}
          mineByDefault={mineByDefault}
        />
      </div>

      <Card>
        <CardContent>
          <TasksTable
            tasks={tasks}
            users={users}
            clients={clients}
            emptyMessage={
              userFilter || clientParam
                ? "Nessun task corrisponde ai filtri selezionati."
                : view === "attivi"
                  ? "Nessun task attivo: creane uno con «Nuovo task»."
                  : "Nessun task completato."
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
