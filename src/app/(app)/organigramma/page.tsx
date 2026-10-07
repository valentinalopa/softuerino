import { requireAdmin } from "@/lib/auth/session";
import { loadOrgTree, type OrgNode } from "@/lib/org";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

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
          Reparti, manager e a chi fanno capo. Gestito in Keycloak dall&apos;IT: qui è in sola lettura e si
          aggiorna quando le persone accedono a Softuerino.
        </p>
      </div>
      {tree.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Ancora nessun reparto: compaiono al primo accesso con l&apos;account aziendale.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {tree.map((node) => (
            <OrgCard key={node.id} node={node} />
          ))}
        </div>
      )}
    </div>
  );
}

function OrgCard({ node }: { node: OrgNode }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{node.name}</h2>
          {node.managers.map((m) => (
            <Badge key={m} variant="accent">
              Manager: {m}
            </Badge>
          ))}
          {node.managers.length === 0 && <Badge variant="neutral">Nessun manager</Badge>}
        </div>
        <p className="text-sm text-muted-foreground">
          {node.members.length > 0 ? node.members.join(", ") : "Nessun membro ancora sincronizzato"}
        </p>
        {node.children.length > 0 && (
          <div className="space-y-3 border-l-2 border-border pl-4">
            <p className="text-xs font-semibold tracking-label text-muted-foreground uppercase">
              Fanno capo a {node.name}
            </p>
            {node.children.map((child) => (
              <OrgCard key={child.id} node={child} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
