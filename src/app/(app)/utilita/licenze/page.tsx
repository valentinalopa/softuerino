import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { licenseWhere, maskedKey, requireLicenseAccess } from "@/lib/licenses/access";
import { expiryStatus, formatExpiry } from "@/lib/licenses/expiry";
import { LICENSE_KINDS } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewLicenseDialog } from "@/components/utilita/NewLicenseDialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Utilità → Licenze e abbonamenti: manager (reparti propri), admin, super admin.
export default async function LicenzePage() {
  const { scope } = await requireLicenseAccess();

  const [licenses, departments] = await Promise.all([
    prisma.license.findMany({
      where: licenseWhere(scope),
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      include: { department: { select: { name: true } }, _count: { select: { activations: true } } },
    }),
    prisma.department.findMany({
      where: scope.all ? {} : { id: { in: scope.departmentIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Licenze e abbonamenti</h1>
          <p className="text-sm text-muted-foreground">
            {scope.all ? "Tutti i reparti." : `Reparti: ${departments.map((d) => d.name).join(", ") || "nessuno"}.`}
          </p>
        </div>
        <NewLicenseDialog departments={departments} />
      </div>

      {LICENSE_KINDS.map((kind) => {
        const rows = licenses.filter((l) => l.kind === kind);
        return (
          <Card key={kind}>
            <CardHeader>
              <CardTitle>{kind === "licenza" ? "Licenze" : "Abbonamenti"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Reparto</TableHead>
                    <TableHead>Chiave</TableHead>
                    <TableHead>{kind === "licenza" ? "Attivazioni" : "Utenti/posti"}</TableHead>
                    <TableHead>Scadenza</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((l) => {
                    const status = expiryStatus(l.expiresAt, l.reminderDays);
                    return (
                      <TableRow key={l.id}>
                        <TableCell className="font-medium">
                          <Link href={`/utilita/licenze/${l.id}`} className="hover:underline">
                            {l.name}
                          </Link>
                          {l.vendor && <span className="block text-xs text-muted-foreground">{l.vendor}</span>}
                        </TableCell>
                        <TableCell>{l.department.name}</TableCell>
                        <TableCell>
                          <code className="text-xs">{maskedKey(l.keyHint) ?? "—"}</code>
                        </TableCell>
                        <TableCell>
                          {l._count.activations} / {l.activationLimit ?? "∞"}
                        </TableCell>
                        <TableCell>
                          {status === "expired" || status === "soon" ? (
                            <Badge variant={status === "expired" ? "danger" : "warning"}>{formatExpiry(l.expiresAt)}</Badge>
                          ) : (
                            <span className="text-sm text-muted-foreground">{formatExpiry(l.expiresAt)}</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {rows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground">
                        Nessun{kind === "licenza" ? "a licenza" : " abbonamento"}.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })}
      <p className="text-xs text-muted-foreground">
        Licenze e abbonamenti in scadenza: i super admin ricevono
        un&apos;email qualche giorno prima (preavviso impostato su ogni voce) e il giorno prima.
      </p>
    </div>
  );
}
