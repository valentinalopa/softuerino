import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { managedDepartmentIds } from "@/lib/departments";
import { isAdminRole } from "@/lib/constants";

// Chi vede le licenze di quali reparti:
// - admin e super admin: tutte;
// - manager di un reparto (organigramma Keycloak, claim manager_of): quelle
//   dei reparti di cui è manager;
// - gli altri: nessuna.
export type LicenseScope = { all: true } | { all: false; departmentIds: string[] };

export async function licenseScopeFor(user: { id: string; role: string }): Promise<LicenseScope | null> {
  if (isAdminRole(user.role)) return { all: true };
  const departmentIds = await managedDepartmentIds(user.id);
  return departmentIds.length > 0 ? { all: false, departmentIds } : null;
}

export function canAccessDepartment(scope: LicenseScope, departmentId: string) {
  return scope.all || scope.departmentIds.includes(departmentId);
}

// Filtro Prisma per le licenze visibili.
export function licenseWhere(scope: LicenseScope) {
  return scope.all ? {} : { departmentId: { in: scope.departmentIds } };
}

// Pagine della sezione Utilità: manager di un reparto, admin e super admin.
export async function requireLicenseAccess() {
  const user = await requireUser();
  const scope = await licenseScopeFor(user);
  if (!scope) redirect("/");
  return { user, scope };
}

// Chiave mascherata: prime 4 cifre in chiaro, il resto asterischi.
export function maskedKey(hint: string | null) {
  return hint ? `${hint}${"*".repeat(12)}` : null;
}
