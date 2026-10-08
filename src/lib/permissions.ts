import "server-only";
import { prisma } from "@/lib/prisma";
import { parseManagerCaps, type ManagerCap } from "@/lib/constants";

// Permessi dei responsabili di reparto: l'incarico arriva da Keycloak
// (UserDepartment.isManager), cosa comporta lo decide il super admin per
// ogni reparto (Department.managerPermissions). "approvare" include il vedere
// le richieste.

function hasCap(caps: ManagerCap[], cap: ManagerCap) {
  return caps.includes(cap) || (cap === "richieste" && caps.includes("approvare"));
}

export type ManagedDepartment = { id: string; name: string; caps: ManagerCap[] };

// Reparti che l'utente guida, con i permessi di ciascuno.
export async function managedDepartments(userId: string): Promise<ManagedDepartment[]> {
  const rows = await prisma.userDepartment.findMany({
    where: { userId, isManager: true },
    select: { department: { select: { id: true, name: true, managerPermissions: true } } },
    orderBy: { department: { name: "asc" } },
  });
  return rows.map(({ department: d }) => ({ id: d.id, name: d.name, caps: parseManagerCaps(d.managerPermissions) }));
}

// Id dei reparti in cui l'utente ha un certo permesso da responsabile.
export async function departmentIdsWithCap(userId: string, cap: ManagerCap) {
  return (await managedDepartments(userId)).filter((d) => hasCap(d.caps, cap)).map((d) => d.id);
}

// Persone (id) dei reparti in cui il responsabile ha quel permesso, lui escluso.
export async function membersWithCap(userId: string, cap: ManagerCap) {
  const departmentIds = await departmentIdsWithCap(userId, cap);
  if (departmentIds.length === 0) return [];
  const rows = await prisma.userDepartment.findMany({
    where: { departmentId: { in: departmentIds }, userId: { not: userId } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

// Il responsabile può agire su questa persona con questo permesso?
export async function managerCan(userId: string, targetUserId: string, cap: ManagerCap) {
  return (await membersWithCap(userId, cap)).includes(targetUserId);
}

// Permessi da responsabile che l'utente ha in almeno un reparto.
export async function managerCaps(userId: string) {
  const caps = new Set<ManagerCap>();
  for (const d of await managedDepartments(userId)) {
    for (const c of d.caps) caps.add(c);
    if (d.caps.includes("approvare")) caps.add("richieste");
  }
  return caps;
}

// Responsabili che possono approvare le richieste di questa persona (dei suoi
// reparti con il permesso "approvare"), lei esclusa.
export async function approversOf(userId: string) {
  const memberships = await prisma.userDepartment.findMany({
    where: { userId },
    select: { department: { select: { id: true, managerPermissions: true } } },
  });
  const departmentIds = memberships
    .filter((m) => parseManagerCaps(m.department.managerPermissions).includes("approvare"))
    .map((m) => m.department.id);
  if (departmentIds.length === 0) return [];
  const managers = await prisma.userDepartment.findMany({
    where: { departmentId: { in: departmentIds }, isManager: true, userId: { not: userId } },
    select: { userId: true },
  });
  return [...new Set(managers.map((m) => m.userId))];
}
