import "server-only";
import { prisma } from "@/lib/prisma";
import { isAdminRole, TASK_PRIORITIES, TASK_STATUSES } from "@/lib/constants";
import { managedDepartmentIds } from "@/lib/departments";
import { notifyTaskAssigned } from "@/lib/email/notifications";
import { archiveScope, canViewTaskArchive, ForbiddenError, listArchivedTasks, recentDoneTaskWhere } from "@/lib/task-archive";
import { NotFoundError, ValidationError } from "@/lib/services/errors";

// Task: regole in un posto solo, usate dalle server action del web e dalle route
// dell'app. I task sono condivisi: chiunque nel team li crea, modifica ed elimina
// (come sul web). Restrizioni: la scrittura è vietata durante un "vedi come"
// (impersonating) e l'archivio lo vedono solo admin, project manager e
// responsabili (task-archive.ts). Effetti di contorno (revalidatePath, mail) a
// chi chiama: create/update restituiscono `notify`, da passare ad after().

export type TaskActor = { id: string; role: string; projectManager: boolean; impersonating?: boolean };

export type TaskView = "active" | "done" | "archive";

export type TaskDTO = {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: string | null;
  dueDate: string | null; // YYYY-MM-DD
  completedAt: string | null; // ISO
  createdAt: string; // ISO
  client: { id: string; name: string } | null;
  assignees: { id: string; name: string }[];
};

export type TaskDeps = { notifyTaskAssigned: typeof notifyTaskAssigned };
const defaultDeps: TaskDeps = { notifyTaskAssigned };

const READ_ONLY_MESSAGE = "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla";

const TASK_INCLUDE = {
  client: { select: { id: true, name: true } },
  assignees: { include: { user: { select: { id: true, name: true } } } },
} as const;

type TaskRow = {
  id: string;
  title: string;
  notes: string;
  status: string;
  priority: string | null;
  dueDate: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  client: { id: string; name: string } | null;
  assignees: { user: { id: string; name: string } }[];
};

// Le scadenze sono salvate come mezzanotte locale (localDate): si rileggono in locale.
function dateOnly(d: Date) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function toTaskDto(t: TaskRow): TaskDTO {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate ? dateOnly(t.dueDate) : null,
    completedAt: t.completedAt ? t.completedAt.toISOString() : null,
    createdAt: t.createdAt.toISOString(),
    client: t.client,
    assignees: t.assignees.map((a) => a.user),
  };
}

function assertWritable(actor: TaskActor) {
  if (actor.impersonating) throw new ForbiddenError(READ_ONLY_MESSAGE);
}

// Campi del form task (nuovo e modifica), validati. Messaggi storici del web.
function parseTaskInput(input: unknown) {
  const raw = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const title = str(raw.title);
  const notes = str(raw.notes);
  const clientIdRaw = str(raw.clientId);
  const clientId = clientIdRaw && clientIdRaw !== "none" ? clientIdRaw : null;
  const status = raw.status === undefined || raw.status === null || raw.status === "" ? "not_started" : raw.status;
  const priority = str(raw.priority) || null;
  const dueDateRaw = str(raw.dueDate);
  const assigneeIds = Array.isArray(raw.assigneeIds)
    ? [...new Set(raw.assigneeIds.filter((v): v is string => typeof v === "string"))]
    : [];

  if (!title) throw new ValidationError("Il task è obbligatorio");
  if (typeof status !== "string" || !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    throw new ValidationError("Stato non valido");
  }
  if (priority && !TASK_PRIORITIES.includes(priority as (typeof TASK_PRIORITIES)[number])) {
    throw new ValidationError("Priorità non valida");
  }
  if (dueDateRaw && !/^\d{4}-\d{2}-\d{2}$/.test(dueDateRaw)) throw new ValidationError("Scadenza non valida");

  return {
    data: {
      title,
      notes,
      clientId,
      status,
      priority,
      // Mezzanotte locale, non new Date("YYYY-MM-DD") (che sarebbe UTC).
      dueDate: dueDateRaw ? new Date(`${dueDateRaw}T00:00:00`) : null,
    },
    assigneeIds,
  };
}

// Cliente e assegnatari devono esistere (altrimenti sarebbe un errore del database).
async function assertReferences(clientId: string | null, assigneeIds: string[]) {
  if (clientId && (await prisma.client.count({ where: { id: clientId } })) === 0) {
    throw new ValidationError("Cliente non valido");
  }
  if (assigneeIds.length > 0 && (await prisma.user.count({ where: { id: { in: assigneeIds } } })) !== assigneeIds.length) {
    throw new ValidationError("Persona non valida");
  }
}

// Query delle viste Attivi e Completati: la usano sia la pagina /task del web (che
// ha bisogno delle righe Prisma) sia listTasks. L'archivio ha la sua in task-archive.ts.
export function taskListQuery(
  view: "active" | "done",
  filters: { userId?: string; clientId?: string },
  now: Date = new Date()
) {
  return {
    where: {
      ...(filters.userId ? { assignees: { some: { userId: filters.userId } } } : {}),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      ...(view === "active" ? { status: { not: "done" } } : recentDoneTaskWhere(now)),
    },
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" as const },
  };
}

export async function listTasks(
  actor: TaskActor,
  filters: { view: TaskView; userId?: string; clientId?: string },
  now: Date = new Date()
): Promise<TaskDTO[]> {
  if (filters.view === "archive") {
    const managedIds = await managedDepartmentIds(actor.id);
    const rows = await listArchivedTasks(actor, managedIds, { userId: filters.userId, clientId: filters.clientId }, now);
    return rows.map(toTaskDto);
  }
  const rows = await prisma.task.findMany(taskListQuery(filters.view, filters, now));
  return rows.map(toTaskDto);
}

export async function getTask(_actor: TaskActor, id: string): Promise<TaskDTO> {
  const row = await prisma.task.findUnique({ where: { id }, include: TASK_INCLUDE });
  if (!row) throw new NotFoundError("Task non trovato");
  return toTaskDto(row);
}

export async function createTask(actor: TaskActor, input: unknown, deps: TaskDeps = defaultDeps) {
  assertWritable(actor);
  const { data, assigneeIds } = parseTaskInput(input);
  await assertReferences(data.clientId, assigneeIds);
  const row = await prisma.task.create({
    data: {
      ...data,
      completedAt: data.status === "done" ? new Date() : null,
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
    include: TASK_INCLUDE,
  });
  return {
    task: toTaskDto(row),
    notify: async () => {
      if (assigneeIds.length > 0) await deps.notifyTaskAssigned(row.id, assigneeIds, actor.id);
    },
  };
}

export async function updateTask(actor: TaskActor, id: string, input: unknown, deps: TaskDeps = defaultDeps) {
  assertWritable(actor);
  const { data, assigneeIds } = parseTaskInput(input);
  const current = await prisma.task.findUnique({
    where: { id },
    select: { status: true, completedAt: true, assignees: { select: { userId: true } } },
  });
  if (!current) throw new NotFoundError("Task non trovato");
  await assertReferences(data.clientId, assigneeIds);

  // completedAt fa partire il conto per l'archivio e l'eliminazione: si azzera
  // solo se il task esce da "done", e non si sposta se ci resta.
  const completedAt = data.status !== "done" ? null : current.status === "done" ? current.completedAt : new Date();

  const row = await prisma.task.update({
    where: { id },
    data: {
      ...data,
      completedAt,
      assignees: { deleteMany: {}, create: assigneeIds.map((userId) => ({ userId })) },
    },
    include: TASK_INCLUDE,
  });
  // Avvisa solo chi è stato aggiunto adesso.
  const previous = new Set(current.assignees.map((a) => a.userId));
  const added = assigneeIds.filter((uid) => !previous.has(uid));
  return {
    task: toTaskDto(row),
    notify: async () => {
      if (added.length > 0) await deps.notifyTaskAssigned(id, added, actor.id);
    },
  };
}

export async function setTaskStatus(actor: TaskActor, id: string, status: unknown): Promise<TaskDTO> {
  assertWritable(actor);
  if (typeof status !== "string" || !TASK_STATUSES.includes(status as (typeof TASK_STATUSES)[number])) {
    throw new ValidationError("Stato non valido");
  }
  const current = await prisma.task.findUnique({ where: { id }, select: { status: true, completedAt: true } });
  if (!current) throw new NotFoundError("Task non trovato (forse è stato eliminato)");
  // Comportamento storico: ogni passaggio verso "done" riparte da adesso.
  const row = await prisma.task.update({
    where: { id },
    data: { status, completedAt: status === "done" ? new Date() : null },
    include: TASK_INCLUDE,
  });
  return toTaskDto(row);
}

export async function deleteTask(actor: TaskActor, id: string): Promise<void> {
  assertWritable(actor);
  const deleted = await prisma.task.deleteMany({ where: { id } });
  if (deleted.count === 0) throw new NotFoundError("Task non trovato (forse è già stato eliminato)");
}

// Scelte offerte dal form dei task (le stesse del web) e se l'archivio è visibile.
export async function getTaskOptions(actor: TaskActor) {
  const managedIds = await managedDepartmentIds(actor.id);
  const [users, clients] = await Promise.all([
    prisma.user.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.client.findMany({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { clients, users, canViewArchive: canViewTaskArchive(archiveScope(actor, managedIds)) };
}

// Utile alla pagina web: chi parte dai propri task (membri) e chi da tutti (admin).
export function mineByDefault(actor: { role: string }, view: TaskView) {
  return !isAdminRole(actor.role) && view !== "archive";
}
