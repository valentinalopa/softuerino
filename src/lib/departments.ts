import "server-only";
import { prisma } from "@/lib/prisma";

// Organigramma = Keycloak. A ogni login SSO e a ogni refresh del token si
// riallineano, dai claim dell'ID token:
//   groups      → reparti dell'utente
//   manager_of  → reparti di cui è manager (assente = nessuno)
//   reports_to  → reparti a cui fanno capo i suoi reparti (assente = vertice)
// OIDC_DEPARTMENT_GROUPS (es. "IT,COM,Produzione") dice
// quali gruppi sono reparti: gli altri (Manager, users, admin...) si ignorano.
// Vuoto = tutti i gruppi.

function allowedGroups() {
  return (process.env.OIDC_DEPARTMENT_GROUPS ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

function departmentNames(claim: unknown) {
  if (!Array.isArray(claim)) return [];
  const allowed = allowedGroups();
  return [
    ...new Set(
      claim
        .filter((g): g is string => typeof g === "string")
        .map((g) => g.replace(/^\/+/, "").trim())
        .filter((g) => g && (allowed.length === 0 || allowed.includes(g)))
    ),
  ];
}

export async function syncUserOrg(userId: string, claims: Record<string, unknown>) {
  // Senza "groups" (mapper mancante o token senza claim) non si tocca nulla:
  // un errore di configurazione non deve svuotare reparti e incarichi.
  if (!Array.isArray(claims.groups)) return;

  const groups = departmentNames(claims.groups);
  const managerOf = new Set(departmentNames(claims.manager_of));
  const reportsTo = departmentNames(claims.reports_to);

  const departments = await Promise.all(
    groups.map((name) =>
      prisma.department.upsert({ where: { name }, create: { name }, update: {}, select: { id: true, name: true } })
    )
  );

  await prisma.userDepartment.deleteMany({
    where: { userId, departmentId: { notIn: departments.map((d) => d.id) } },
  });
  for (const d of departments) {
    const isManager = managerOf.has(d.name);
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId: d.id } },
      create: { userId, departmentId: d.id, isManager },
      update: { isManager },
    });
  }
  await prisma.user.update({ where: { id: userId }, data: { reportsTo: reportsTo.join(",") } });
}

// I reparti elencati in OIDC_DEPARTMENT_GROUPS esistono da subito, anche
// prima che qualcuno di quel reparto abbia fatto login (es. per assegnargli
// una licenza).
export async function ensureConfiguredDepartments() {
  for (const name of allowedGroups()) {
    await prisma.department.upsert({ where: { name }, create: { name }, update: {} });
  }
}

// Reparti di cui l'utente è manager (id), per i permessi sulle licenze.
export async function managedDepartmentIds(userId: string) {
  const rows = await prisma.userDepartment.findMany({
    where: { userId, isManager: true },
    select: { departmentId: true },
  });
  return rows.map((r) => r.departmentId);
}
