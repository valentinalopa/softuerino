import "server-only";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import { scope } from "@/lib/permissions";

// Chi vede o gestisce le licenze di quali reparti: lo dicono i permessi
// "Vedere le licenze" e "Gestire le licenze" (Ruoli e permessi), per ruolo e
// reparto. Chi le gestisce le vede anche.
export type LicenseScope = { all: true } | { all: false; departmentIds: string[] };
export type LicenseMode = "vedere" | "gestire";

export async function licenseScopeFor(
  user: { id: string; role: string },
  mode: LicenseMode = "vedere"
): Promise<LicenseScope | null> {
  const manage = await scope(user, "licenze_gestire");
  const view = mode === "vedere" ? await scope(user, "licenze_vedere") : manage;
  const all = manage.all || view.all;
  if (all) return { all: true };
  const departmentIds = [...new Set([...manage.departmentIds, ...view.departmentIds])];
  return departmentIds.length > 0 ? { all: false, departmentIds } : null;
}

export function canAccessDepartment(scope: LicenseScope, departmentId: string) {
  return scope.all || scope.departmentIds.includes(departmentId);
}

type LicenseRef = {
  departmentId: string;
  visibleToAll: boolean;
  sharedDepartments: { departmentId: string }[];
};

// Reparti di una licenza: il principale più quelli con cui è condivisa.
export function licenseDepartmentIds(license: LicenseRef) {
  return [license.departmentId, ...license.sharedDepartments.map((d) => d.departmentId)];
}

// Vederla: licenza visibile a tutti, o un suo reparto nell'ambito del
// permesso. Gestirla: solo per ambito (mai solo perché è visibile a tutti).
export function canAccessLicense(scope: LicenseScope | null, license: LicenseRef, mode: LicenseMode) {
  if (mode === "vedere" && license.visibleToAll) return true;
  if (!scope) return false;
  return scope.all || licenseDepartmentIds(license).some((id) => scope.departmentIds.includes(id));
}

// Filtro Prisma per le licenze visibili.
export function licenseWhere(scope: LicenseScope | null) {
  if (scope?.all) return {};
  const ids = scope?.departmentIds ?? [];
  return {
    OR: [
      { departmentId: { in: ids } },
      { sharedDepartments: { some: { departmentId: { in: ids } } } },
      { visibleToAll: true },
    ],
  };
}

// Pagine delle licenze: chi può vederne almeno una (per permesso o perché
// ce ne sono di visibili a tutti).
export async function requireLicenseAccess() {
  const user = await requireUser();
  const scope = await licenseScopeFor(user);
  if (!scope && (await prisma.license.count({ where: { visibleToAll: true } })) === 0) redirect("/");
  return { user, scope };
}

// C'è qualcosa da mostrare nel menu?
export async function hasLicenseAccess(user: { id: string; role: string }) {
  if (await licenseScopeFor(user)) return true;
  return (await prisma.license.count({ where: { visibleToAll: true } })) > 0;
}

// Account della licenza: in chiaro solo per i super admin (null per gli
// altri, che lo vedono mascherato e lo scoprono registrando dove lo usano).
export function accountForViewer(viewer: { role: string }, accountEncrypted: string | null) {
  if (viewer.role !== "super_admin" || !accountEncrypted) return null;
  try {
    return decryptSecret(accountEncrypted);
  } catch {
    return null;
  }
}

export function maskedAccount(hint: string | null) {
  return hint !== null ? `${hint}${"*".repeat(8)}` : null;
}

// Chiave mascherata: prime 4 cifre in chiaro, il resto asterischi.
export function maskedKey(hint: string | null) {
  return hint ? `${hint}${"*".repeat(12)}` : null;
}
