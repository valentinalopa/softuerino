import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { userDepartmentIds } from "@/lib/departments";
import { isAdminRole, isManagerOrAbove } from "@/lib/constants";

// Chi vede le licenze di quali reparti:
// - admin e super admin: tutte;
// - manager: quelle dei reparti di cui fa parte (gruppi Keycloak);
// - membro: nessuna.
export type LicenseScope = { all: true } | { all: false; departmentIds: string[] };

export async function licenseScopeFor(user: { id: string; role: string }): Promise<LicenseScope | null> {
  if (isAdminRole(user.role)) return { all: true };
  if (user.role === "manager") return { all: false, departmentIds: await userDepartmentIds(user.id) };
  return null;
}

export function canAccessDepartment(scope: LicenseScope, departmentId: string) {
  return scope.all || scope.departmentIds.includes(departmentId);
}

// Filtro Prisma per le licenze visibili.
export function licenseWhere(scope: LicenseScope) {
  return scope.all ? {} : { departmentId: { in: scope.departmentIds } };
}

// Pagine della sezione Utilità: manager e superiori.
export async function requireLicenseAccess() {
  const user = await requireUser();
  if (!isManagerOrAbove(user.role)) redirect("/");
  const scope = await licenseScopeFor(user);
  if (!scope) redirect("/");
  return { user, scope };
}

// Chiave mascherata: prime 4 cifre in chiaro, il resto asterischi.
export function maskedKey(hint: string | null) {
  return hint ? `${hint}${"*".repeat(12)}` : null;
}
