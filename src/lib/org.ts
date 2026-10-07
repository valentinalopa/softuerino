import "server-only";
import { prisma } from "@/lib/prisma";

export type OrgNode = {
  id: string;
  name: string;
  managers: string[];
  members: string[];
  children: OrgNode[];
};

// Albero dei reparti ricostruito dai dati sincronizzati da Keycloak: il
// reparto padre di un reparto è quello a cui fanno capo (reports_to) tutti i
// suoi membri. Un reparto senza padre è un vertice. Si completa man mano che
// le persone accedono a Softuerino.
export async function loadOrgTree(): Promise<OrgNode[]> {
  const departments = await prisma.department.findMany({
    orderBy: { name: "asc" },
    include: {
      members: {
        include: { user: { select: { name: true, reportsTo: true, active: true } } },
      },
    },
  });

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
      members: members.map((m) => m.user.name).sort(),
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
