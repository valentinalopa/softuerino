import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ActiveBadge";
import { ClientCategoryBadges } from "@/components/clienti/ClientCategoryBadges";
import { ClientRowActions } from "@/components/clienti/ClientRowActions";
import { NewClientDialog } from "@/components/clienti/NewClientDialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export default async function ClientiPage() {
  await requireSuperAdmin();

  const clients = await prisma.client.findMany({
    orderBy: { createdAt: "asc" },
  });

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Clienti</h1>
          <p className="text-sm text-muted-foreground">
            Clienti/progetti su cui il team può loggare ore.
          </p>
        </div>
        <NewClientDialog />
      </div>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Categorie</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id}>
                  <TableCell className="font-medium">{client.name}</TableCell>
                  <TableCell>
                    <ActiveBadge active={client.active} />
                  </TableCell>
                  <TableCell>
                    <ClientCategoryBadges categories={client.categories} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ClientRowActions client={client} />
                  </TableCell>
                </TableRow>
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Nessun cliente ancora.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
