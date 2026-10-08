import { requireAdmin } from "@/lib/auth/session";
import { loadOrgTree, type OrgNode } from "@/lib/org";
import { getInitials } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Organigramma in sola lettura: reparti, manager e a chi fanno capo arrivano
// da Keycloak (gestito dall'IT).
export default async function OrganigrammaPage() {
  await requireAdmin();
  const tree = await loadOrgTree();

  return (
    <div className="space-y-8">
      <div>
        <h1>Organigramma</h1>
        <p className="text-sm text-muted-foreground">
          Reparti, manager e a chi fanno capo. Gestito in Keycloak dall&apos;IT: qui è in sola
          lettura e si aggiorna quando le persone accedono a Softuerino.
        </p>
      </div>
      {tree.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-center text-sm text-muted-foreground">
              Ancora nessun reparto: compaiono al primo accesso con l&apos;account aziendale.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {tree.map((node) => (
            // Una card per ogni vertice; i reparti che ne dipendono stanno
            // dentro, rientrati, invece che in card annidate.
            <Card key={node.id}>
              <CardHeader>
                <CardTitle>{node.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <Department node={node} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Department({ node }: { node: OrgNode }) {
  return (
    <div className="space-y-5">
      <People node={node} />
      {node.children.map((child) => (
        <section key={child.id} className="space-y-3 border-l-2 border-border-subtle pl-4">
          <div>
            <p className="text-xs font-semibold tracking-label text-muted-foreground uppercase">
              Fa capo a {node.name}
            </p>
            <h3 className="text-base font-semibold text-foreground">{child.name}</h3>
          </div>
          <Department node={child} />
        </section>
      ))}
    </div>
  );
}

// Persone del reparto, manager per primi.
function People({ node }: { node: OrgNode }) {
  const managers = new Set(node.managers);
  const people = [...node.managers, ...node.members.filter((name) => !managers.has(name))];
  if (people.length === 0) {
    return <p className="text-sm text-muted-foreground">Nessun membro ancora sincronizzato.</p>;
  }
  return (
    <ul className="flex flex-wrap gap-x-6 gap-y-3">
      {people.map((name) => (
        <li key={name} className="flex items-center gap-2">
          <Avatar size="sm">
            <AvatarFallback>{getInitials(name)}</AvatarFallback>
          </Avatar>
          <span className="text-sm text-foreground">{name}</span>
          {managers.has(name) && <Badge variant="accent">Manager</Badge>}
        </li>
      ))}
      {node.managers.length === 0 && (
        <li className="flex items-center">
          <Badge variant="neutral">Nessun manager</Badge>
        </li>
      )}
    </ul>
  );
}
