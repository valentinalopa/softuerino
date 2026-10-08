import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ActiveBadge";
import { ClientCategoryBadges } from "@/components/clienti/ClientCategoryBadges";
import { ClientRowActions } from "@/components/clienti/ClientRowActions";
import { MobileList, MobileListItem } from "@/components/MobileList";
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
  await requireAdmin();

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
          <MobileList>
            {clients.map((client) => (
              <MobileListItem key={client.id}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 pt-1.5 font-medium break-words text-foreground">{client.name}</p>
                  <ClientRowActions client={client} />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActiveBadge active={client.active} />
                  <ClientCategoryBadges categories={client.categories} />
                </div>
              </MobileListItem>
            ))}
            {clients.length === 0 && (
              <MobileListItem className="text-center text-muted-foreground">Nessun cliente ancora.</MobileListItem>
            )}
          </MobileList>
          <Table containerClassName="hidden md:block">
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
