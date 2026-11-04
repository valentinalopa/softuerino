import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { isAdminRole, TASK_ARCHIVE_AFTER_DAYS, TASK_DELETE_AFTER_DAYS } from "@/lib/constants";

// Archivio dei task. "Archiviato" non è un campo: è un task `done` completato
// da più di TASK_ARCHIVE_AFTER_DAYS giorni. Dopo TASK_DELETE_AFTER_DAYS lo
// elimina il timer di conservazione (retention.ts).
//
// Chi lo vede (tutte le regole sono qui, usate sia dalla pagina /task sia da
// una futura API):
// - admin e super admin: tutto;
// - project manager (User.projectManager, dal gruppo Keycloak): tutto;
// - responsabile di reparto: i task con almeno un assegnatario nei reparti che
//   gestisce (managedDepartmentIds, departments.ts);
// - membro: niente (ForbiddenError, 403).
// Lo svuota solo il super admin.

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "Non hai i permessi per vedere l'archivio dei task") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export type ArchiveViewer = { id: string; role: string; projectManager: boolean };

export type ArchiveScope =
  | { kind: "none" }
  | { kind: "all" }
  | { kind: "departments"; departmentIds: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY_MS);
}

// Task completati da più di 30 giorni (archivio).
export function archivedTaskWhere(now: Date) {
  return { status: "done", completedAt: { lt: daysAgo(now, TASK_ARCHIVE_AFTER_DAYS) } };
}

// Task completati da non più di 30 giorni (scheda "Completati").
export function recentDoneTaskWhere(now: Date) {
  return { status: "done", completedAt: { gte: daysAgo(now, TASK_ARCHIVE_AFTER_DAYS) } };
}

// Task da eliminare definitivamente (completati da più di 365 giorni).
export function expiredTaskWhere(now: Date) {
  return { status: "done", completedAt: { lt: daysAgo(now, TASK_DELETE_AFTER_DAYS) } };
}

// managedDepartmentIds: reparti di cui il viewer è responsabile (vuoto se nessuno).
export function archiveScope(viewer: ArchiveViewer, managedDepartmentIds: string[]): ArchiveScope {
  if (isAdminRole(viewer.role) || viewer.projectManager) return { kind: "all" };
  if (managedDepartmentIds.length > 0) return { kind: "departments", departmentIds: managedDepartmentIds };
  return { kind: "none" };
}

export function canViewTaskArchive(scope: ArchiveScope) {
  return scope.kind !== "none";
}

export async function listArchivedTasks(
  viewer: ArchiveViewer,
  managedDepartmentIds: string[],
  filters: { userId?: string; clientId?: string } = {},
  now: Date = new Date(),
  db: PrismaClient = prisma
) {
  const scope = archiveScope(viewer, managedDepartmentIds);
  if (scope.kind === "none") throw new ForbiddenError();

  return db.task.findMany({
    where: {
      ...archivedTaskWhere(now),
      ...(filters.clientId ? { clientId: filters.clientId } : {}),
      AND: [
        scope.kind === "departments"
          ? { assignees: { some: { user: { departments: { some: { departmentId: { in: scope.departmentIds } } } } } } }
          : {},
        filters.userId ? { assignees: { some: { userId: filters.userId } } } : {},
      ],
    },
    include: {
      client: { select: { id: true, name: true } },
      assignees: { include: { user: { select: { id: true, name: true } } } },
    },
    orderBy: { completedAt: "desc" },
  });
}

// Svuota l'archivio: solo super admin (la pagina usa requireSuperAdmin; il
// controllo è ripetuto qui perché la regola non dipenda dal chiamante).
export async function purgeTaskArchive(
  viewer: { role: string },
  now: Date = new Date(),
  db: PrismaClient = prisma
) {
  if (viewer.role !== "super_admin") throw new ForbiddenError("Solo il super admin può svuotare l'archivio");
  const deleted = await db.task.deleteMany({ where: archivedTaskWhere(now) });
  return deleted.count;
}
