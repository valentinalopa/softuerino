import "server-only";
import { prisma } from "@/lib/prisma";

// Reparti = gruppi Keycloak, letti dal claim "groups" dell'ID token a ogni
// login SSO (mapper "Group Membership", full path off). Keycloak è la fonte:
// i reparti dell'utente vengono riallineati a quelli ricevuti.
// OIDC_DEPARTMENT_GROUPS (facoltativo, separati da virgola) limita quali
// gruppi contano come reparti; vuoto = tutti.

function allowedGroups() {
  return (process.env.OIDC_DEPARTMENT_GROUPS ?? "")
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}

export async function syncUserDepartments(userId: string, groupsClaim: unknown) {
  // Claim assente (mapper non configurato): non si tocca nulla, così i reparti
  // non si svuotano per un errore di configurazione.
  if (!Array.isArray(groupsClaim)) return;

  const allowed = allowedGroups();
  const names = [
    ...new Set(
      groupsClaim
        .filter((g): g is string => typeof g === "string")
        .map((g) => g.replace(/^\/+/, "").trim())
        .filter((g) => g && (allowed.length === 0 || allowed.includes(g)))
    ),
  ];

  const departments = await Promise.all(
    names.map((name) =>
      prisma.department.upsert({ where: { name }, create: { name }, update: {}, select: { id: true } })
    )
  );
  const ids = departments.map((d) => d.id);

  await prisma.userDepartment.deleteMany({ where: { userId, departmentId: { notIn: ids } } });
  for (const departmentId of ids) {
    await prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      create: { userId, departmentId },
      update: {},
    });
  }
}

// Reparti di un utente (id), per i permessi di manager.
export async function userDepartmentIds(userId: string) {
  const rows = await prisma.userDepartment.findMany({ where: { userId }, select: { departmentId: true } });
  return rows.map((r) => r.departmentId);
}
