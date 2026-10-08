import "server-only";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import {
  DEPARTMENT_ROLES,
  defaultRules,
  normalizeRules,
  type Capability,
  type Rules,
  type Scope,
} from "@/lib/permission-rules";

// Chi può cosa e su chi. Il ruolo in Softuerino (membro, admin) e l'incarico
// di responsabile di reparto (da Keycloak) si sommano; per ogni permesso le
// regole (generali o del reparto, Ruoli e permessi) dicono fin dove si arriva:
// niente, il proprio reparto, tutti. Il super admin può sempre tutto.

export type PermissionScope = { all: boolean; departmentIds: string[] };
type Viewer = { id: string; role: string };

export const generalRules = cache(async (): Promise<Rules> => {
  const row = await prisma.permissionSettings.findUnique({ where: { id: 1 } });
  return row ? normalizeRules(safeJson(row.rules), defaultRules()) : defaultRules();
});

export function departmentRules(general: Rules, permissions: string | null): Rules {
  return permissions ? normalizeRules(safeJson(permissions), general, DEPARTMENT_ROLES) : general;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const memberships = cache(async (userId: string) =>
  prisma.userDepartment.findMany({
    where: { userId },
    select: { departmentId: true, isManager: true, department: { select: { permissions: true } } },
  })
);

export const scopeFor = cache(async (viewerId: string, role: string, cap: Capability): Promise<PermissionScope> => {
  if (role === "super_admin") return { all: true, departmentIds: [] };
  const [general, deps] = await Promise.all([generalRules(), memberships(viewerId)]);
  let all = false;
  const departmentIds = new Set<string>();
  const apply = (scope: Scope, departments: string[]) => {
    if (scope === "tutti") all = true;
    else if (scope === "reparto") departments.forEach((d) => departmentIds.add(d));
  };
  if (role === "admin") apply(general[cap].admin, deps.map((d) => d.departmentId));
  if (deps.length === 0) apply(general[cap].membro, []);
  for (const d of deps) {
    const rules = departmentRules(general, d.department.permissions);
    apply(rules[cap].membro, [d.departmentId]);
    if (d.isManager) apply(rules[cap].responsabile, [d.departmentId]);
  }
  return { all, departmentIds: [...departmentIds] };
});

export async function scope(viewer: Viewer, cap: Capability) {
  return scopeFor(viewer.id, viewer.role, cap);
}

export function hasAny(s: PermissionScope) {
  return s.all || s.departmentIds.length > 0;
}

export async function can(viewer: Viewer, cap: Capability) {
  return hasAny(await scope(viewer, cap));
}

// Persone su cui il permesso vale (lei esclusa): "all" = tutte.
export async function peopleInScope(viewer: Viewer, cap: Capability): Promise<string[] | "all"> {
  const s = await scope(viewer, cap);
  if (s.all) return "all";
  if (s.departmentIds.length === 0) return [];
  const rows = await prisma.userDepartment.findMany({
    where: { departmentId: { in: s.departmentIds }, userId: { not: viewer.id } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

// Il permesso vale su questa persona? Mai su sé stessi (es. approvare le
// proprie richieste).
export async function canOnPerson(viewer: Viewer, cap: Capability, targetUserId: string) {
  if (targetUserId === viewer.id) return false;
  const people = await peopleInScope(viewer, cap);
  return people === "all" || people.includes(targetUserId);
}

// Filtro Prisma sugli utenti nell'ambito del permesso.
export async function peopleWhere(viewer: Viewer, cap: Capability) {
  const people = await peopleInScope(viewer, cap);
  return people === "all" ? { id: { not: viewer.id } } : { id: { in: people } };
}

// Chi può approvare le richieste di questa persona (responsabili e membri
// con il permesso; admin e super admin restano fuori: hanno Richieste del team
// e, se vogliono le email, sono tra i responsabili ferie).
export async function approversOf(userId: string) {
  const candidates = await prisma.user.findMany({
    where: { active: true, role: "membro", id: { not: userId } },
    select: { id: true, role: true },
  });
  const result: string[] = [];
  for (const c of candidates) {
    if (await canOnPerson(c, "approvare", userId)) result.push(c.id);
  }
  return result;
}
