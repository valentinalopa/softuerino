import "server-only";
import { prisma } from "@/lib/prisma";
import { byName } from "@/lib/utils";
import { isAdminRole, type EmploymentType } from "@/lib/constants";
import { peopleInScope } from "@/lib/permissions";
import { balanceFigures, getLeaveBalancesForUsers } from "@/lib/leave-balance";
import { getRecoveryCreditsForUsers } from "@/lib/recovery-credits";
import { formatToRecover } from "@/lib/leave-format";
import { managedDepartmentNames } from "@/lib/departments";
import { NotFoundError } from "@/lib/services/errors";

// Persone per l'app (F6 T2), con le stesse regole di /team:
// - admin e super admin: tutte le persone (anche disattivate), con i saldi dell'anno;
// - gli altri: le persone attive su cui hanno un permesso (presenze e ore,
//   richieste e saldi, approvare) come DepartmentPeopleView; se un permesso vale
//   per "tutti" non compare mai sé stessi. Senza permessi: elenco vuoto.
// Una persona non visibile risponde come una inesistente (404).
export type PeopleActor = { id: string; role: string };

export type PersonView = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  employmentType: string;
  departments: string[];
  managedDepartments: string[];
  // Solo per admin: saldi dell'anno e recuperi da fare. Altrimenti null.
  balances: ReturnType<typeof balanceFigures> | null;
  toRecover: string | null;
};

const PERSON_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  active: true,
  employmentType: true,
  departments: { select: { department: { select: { name: true } } } },
} as const;

// null = tutte le persone (admin); altrimenti gli id visibili.
async function visibleScope(actor: PeopleActor): Promise<{ ids: string[] | null; all: boolean }> {
  if (isAdminRole(actor.role)) return { ids: null, all: true };
  const scopes = await Promise.all([
    peopleInScope(actor, "presenze_ore"),
    peopleInScope(actor, "richieste"),
    peopleInScope(actor, "approvare"),
  ]);
  if (scopes.includes("all")) return { ids: null, all: false };
  return { ids: [...new Set(scopes.flatMap((s) => (s === "all" ? [] : s)))].filter((id) => id !== actor.id), all: false };
}

async function toViews(rows: Awaited<ReturnType<typeof findRows>>, withBalances: boolean): Promise<PersonView[]> {
  const ids = rows.map((r) => r.id);
  const year = new Date().getFullYear();
  const [balances, credits, managed] = await Promise.all([
    withBalances
      ? getLeaveBalancesForUsers(
          rows.map((r) => ({ id: r.id, employmentType: r.employmentType as EmploymentType })),
          year
        )
      : Promise.resolve(null),
    withBalances ? getRecoveryCreditsForUsers(ids) : Promise.resolve(null),
    managedDepartmentNames(ids),
  ]);
  return [...rows].sort(byName).map((r) => {
    const balance = balances?.get(r.id);
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      active: r.active,
      employmentType: r.employmentType,
      departments: r.departments.map((d) => d.department.name).sort((a, b) => a.localeCompare(b)),
      managedDepartments: managed.get(r.id) ?? [],
      balances: balance ? balanceFigures(balance) : null,
      toRecover: credits ? formatToRecover(credits.get(r.id) ?? []) : null,
    };
  });
}

function findRows(where: object) {
  return prisma.user.findMany({ where, select: PERSON_SELECT });
}

export async function listPeople(actor: PeopleActor): Promise<PersonView[]> {
  const scope = await visibleScope(actor);
  if (scope.all) return toViews(await findRows({}), true);
  if (scope.ids !== null && scope.ids.length === 0) return [];
  const where = scope.ids === null ? { active: true, id: { not: actor.id } } : { active: true, id: { in: scope.ids } };
  return toViews(await findRows(where), false);
}

export async function getPerson(actor: PeopleActor, id: string): Promise<PersonView> {
  const scope = await visibleScope(actor);
  const visible = scope.all || scope.ids === null || scope.ids.includes(id);
  const rows = visible ? await findRows(scope.all ? { id } : { id, active: true, ...(scope.ids === null ? { NOT: { id: actor.id } } : {}) }) : [];
  if (rows.length === 0) throw new NotFoundError("Persona non trovata");
  return (await toViews(rows, scope.all))[0];
}
