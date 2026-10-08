import "server-only";
import { prisma } from "@/lib/prisma";
import { ensureConfiguredDepartments } from "@/lib/departments";

export type OrgPerson = {
  name: string;
  role: string;
  isManager: boolean; // responsabile di questo reparto
  managed: string[]; // tutti i reparti di cui è responsabile (per l'anello sull'avatar)
};

export type OrgNode = {
  id: string;
  name: string;
  managers: string[];
  people: OrgPerson[]; // responsabili per primi, poi in ordine alfabetico
  children: OrgNode[];
};

// Albero dei reparti ricostruito dai dati sincronizzati da Keycloak: il
// reparto padre di un reparto è quello a cui fanno capo (reports_to) tutti i
// suoi membri. Un reparto senza padre è un vertice. Si completa man mano che
// le persone accedono a Softuerino.
export async function loadOrgTree(): Promise<OrgNode[]> {
  await ensureConfiguredDepartments();
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        include: { user: { select: { id: true, name: true, role: true, reportsTo: true, active: true } } },
      },
    },
  });

  const managedBy = new Map<string, string[]>();
  for (const d of departments) {
    for (const m of d.members) {
      if (m.isManager) managedBy.set(m.user.id, [...(managedBy.get(m.user.id) ?? []), d.name]);
    }
  }

  const nodes = new Map<string, OrgNode & { parent: string | null }>();
  for (const d of departments) {
    const members = d.members.filter((m) => m.user.active);
    // Reparti a cui fanno capo tutti i membri (intersezione dei reports_to).
    const parentSets = members.map(
      (m) => new Set(m.user.reportsTo.split(",").filter((p) => p && p !== d.name))
    );
    const common = parentSets.length
      ? [...parentSets[0]].filter((p) => parentSets.every((set) => set.has(p)))
      : [];
    const parent = common.length > 0 ? common.sort()[0] : null;
    nodes.set(d.name, {
      id: d.id,
      name: d.name,
      managers: members.filter((m) => m.isManager).map((m) => m.user.name).sort(),
      people: members
        .map((m) => ({
          name: m.user.name,
          role: m.user.role,
          isManager: m.isManager,
          managed: managedBy.get(m.user.id) ?? [],
        }))
        .sort((a, b) => Number(b.isManager) - Number(a.isManager) || a.name.localeCompare(b.name)),
      children: [],
      parent,
    });
  }

  const roots: OrgNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent ? nodes.get(node.parent) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}
