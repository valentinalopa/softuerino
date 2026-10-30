import { CornerDownRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/constants";
import { can } from "@/lib/permissions";
import { sortClientsByParent } from "@/lib/clients";
import { byName, normalizeSearch } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { ActiveBadge } from "@/components/ActiveBadge";
import { ClientCategoryBadges } from "@/components/clienti/ClientCategoryBadges";
import { ClientRowActions } from "@/components/clienti/ClientRowActions";
import type { ClientStructureOptions } from "@/components/clienti/ClientStructureFields";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { NewClientDialog } from "@/components/clienti/NewClientDialog";
import { UrlSearchInput } from "@/components/UrlSearchInput";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Clienti" };

export default async function ClientiPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  // Admin e super admin gestiscono; chi ha il permesso "Aggiungere clienti"
  // vede l'elenco e ne aggiunge, senza modificare o eliminare.
  const user = await requireUser();
  const isAdmin = isAdminRole(user.role);
  if (!isAdmin && !(await can(user, "clienti"))) redirect("/");

  const [rawClients, people] = await Promise.all([
    prisma.client.findMany({
      include: {
        parent: { select: { name: true } },
        loggers: { select: { user: { select: { id: true, name: true } } } },
        _count: { select: { children: true } },
      },
    }),
    isAdmin
      ? prisma.user.findMany({ where: { active: true }, select: { id: true, name: true } })
      : Promise.resolve([]),
  ]);
  // Ricerca sul nome, anche del cliente padre: "colibri" trova le sue voci.
  const query = normalizeSearch((await searchParams).q ?? "");
  const clients = sortClientsByParent(rawClients)
    .filter((client) => !query || [client.name, client.parent?.name ?? ""].some((t) => normalizeSearch(t).includes(query)))
    .map((client) => ({
    ...client,
    loggerUsers: client.loggers.map((l) => l.user).sort(byName),
  }));

  // Opzioni dei form admin: un cliente può far parte solo di un cliente
  // principale (un livello).
  const structure: ClientStructureOptions | undefined = isAdmin
    ? {
        parents: rawClients.filter((c) => !c.parentId).sort(byName).map((c) => ({ id: c.id, name: c.name })),
        people: people.sort(byName),
      }
    : undefined;

  const rowActions = (client: (typeof clients)[number]) =>
    structure && (
      <ClientRowActions
        client={{
          id: client.id,
          name: client.name,
          active: client.active,
          categories: client.categories,
          parentId: client.parentId,
          loggerIds: client.loggerUsers.map((u) => u.id),
          hasChildren: client._count.children > 0,
        }}
        structure={structure}
      />
    );

  const nameBlock = (client: (typeof clients)[number]) => (
    <div className={client.parentId ? "flex gap-1.5 pl-4" : undefined}>
      {client.parentId && <CornerDownRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      <div className="min-w-0">
        <p className="font-medium break-words text-foreground">{client.name}</p>
        {client.loggerUsers.length > 0 && (
          <p className="text-xs font-normal text-muted-foreground">
            Solo per {client.loggerUsers.map((u) => u.name).join(", ")}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Clienti</h1>
          <p className="text-sm text-muted-foreground">
            Clienti/progetti su cui il team può loggare ore.
          </p>
        </div>
        <NewClientDialog structure={structure} />
      </div>

      <UrlSearchInput placeholder="Cerca cliente…" />

      <Card>
        <CardContent>
          <MobileList>
            {clients.map((client) => (
              <MobileListItem key={client.id}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 pt-1.5">{nameBlock(client)}</div>
                  {rowActions(client)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <ActiveBadge active={client.active} />
                  <ClientCategoryBadges categories={client.categories} />
                </div>
              </MobileListItem>
            ))}
            {clients.length === 0 && (
              <MobileListItem className="text-center text-muted-foreground">{query ? "Nessun cliente corrisponde alla ricerca." : "Nessun cliente ancora."}</MobileListItem>
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
                  <TableCell>{nameBlock(client)}</TableCell>
                  <TableCell>
                    <ActiveBadge active={client.active} />
                  </TableCell>
                  <TableCell>
                    <ClientCategoryBadges categories={client.categories} />
                  </TableCell>
                  <TableCell className="text-right">{rowActions(client)}</TableCell>
                </TableRow>
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {query ? "Nessun cliente corrisponde alla ricerca." : "Nessun cliente ancora."}
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
