import { prisma } from "@/lib/prisma";
import { ensureConfiguredDepartments } from "@/lib/departments";
import { licenseWhere, maskedKey, requireLicenseAccess } from "@/lib/licenses/access";
import { expiryStatus, formatExpiry } from "@/lib/licenses/expiry";
import { LICENSE_KINDS, type LicenseKind } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LinkRow } from "@/components/LinkRow";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { NewLicenseDialog } from "@/components/utilita/NewLicenseDialog";
import { LicenseQuickKey } from "@/components/utilita/LicenseQuickKey";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const KIND_TAB_LABELS: Record<LicenseKind, string> = {
  licenza: "Licenze",
  abbonamento: "Abbonamenti",
};

// Utilità → Licenze e abbonamenti: manager (reparti propri), admin, super admin.
export default async function LicenzePage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string }>;
}) {
  const { scope } = await requireLicenseAccess();
  const { tipo } = await searchParams;
  const kind: LicenseKind = LICENSE_KINDS.includes(tipo as LicenseKind)
    ? (tipo as LicenseKind)
    : "licenza";

  if (scope.all) await ensureConfiguredDepartments();
  const [licenses, departments] = await Promise.all([
    prisma.license.findMany({
      where: licenseWhere(scope),
      orderBy: [{ expiresAt: { sort: "asc", nulls: "last" } }, { name: "asc" }],
      include: {
        department: { select: { name: true } },
        _count: { select: { activations: true } },
      },
    }),
    prisma.department.findMany({
      where: scope.all ? {} : { id: { in: scope.departmentIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  const rows = licenses.filter((l) => l.kind === kind);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Licenze e abbonamenti</h1>
          <p className="text-sm text-muted-foreground">
            {scope.all
              ? "Tutti i reparti."
              : `Reparti: ${departments.map((d) => d.name).join(", ") || "nessuno"}.`}{" "}
            Prima di una scadenza i super admin ricevono un&apos;email (con il preavviso impostato
            su ogni voce) e un&apos;altra il giorno prima.
          </p>
        </div>
        <NewLicenseDialog departments={departments} />
      </div>

      <div className="space-y-4">
        <SegmentedLinkTabs
          items={LICENSE_KINDS.map((k) => ({
            key: k,
            label: `${KIND_TAB_LABELS[k]} (${licenses.filter((l) => l.kind === k).length})`,
            href: k === "licenza" ? "/utilita/licenze" : `/utilita/licenze?tipo=${k}`,
            active: k === kind,
          }))}
        />
        <Card>
          <CardContent>
            <MobileList>
              {rows.map((l) => {
                const status = expiryStatus(l.expiresAt, l.reminderDays);
                return (
                  <MobileListItem key={l.id} href={`/utilita/licenze/${l.id}`} label={l.name}>
                    <div>
                      <p className="font-medium break-words text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {[l.vendor, l.department.name].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <LicenseQuickKey
                      licenseId={l.id}
                      name={l.name}
                      masked={maskedKey(l.keyHint)}
                      used={l._count.activations}
                      limit={l.activationLimit}
                    />
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        {kind === "licenza" ? "Attivazioni" : "Utenti/posti"}: {l._count.activations} /{" "}
                        {l.activationLimit ?? "∞"}
                      </span>
                      {status === "expired" || status === "soon" ? (
                        <Badge variant={status === "expired" ? "danger" : "warning"}>
                          {formatExpiry(l.expiresAt)}
                        </Badge>
                      ) : (
                        <span>Scadenza: {formatExpiry(l.expiresAt)}</span>
                      )}
                    </div>
                  </MobileListItem>
                );
              })}
              {rows.length === 0 && (
                <MobileListItem className="text-center text-muted-foreground">
                  {kind === "licenza" ? "Nessuna licenza." : "Nessun abbonamento."}
                </MobileListItem>
              )}
            </MobileList>
            <Table containerClassName="hidden md:block">
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
                    <LinkRow key={l.id} href={`/utilita/licenze/${l.id}`}>
                      <TableCell>
                        <span className="block font-medium text-foreground">{l.name}</span>
                        {l.vendor && (
                          <span className="block text-xs text-muted-foreground">{l.vendor}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{l.department.name}</TableCell>
                      <TableCell>
                        <LicenseQuickKey
                          licenseId={l.id}
                          name={l.name}
                          masked={maskedKey(l.keyHint)}
                          used={l._count.activations}
                          limit={l.activationLimit}
                        />
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {l._count.activations} / {l.activationLimit ?? "∞"}
                      </TableCell>
                      <TableCell>
                        {status === "expired" || status === "soon" ? (
                          <Badge variant={status === "expired" ? "danger" : "warning"}>
                            {formatExpiry(l.expiresAt)}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">{formatExpiry(l.expiresAt)}</span>
                        )}
                      </TableCell>
                    </LinkRow>
                  );
                })}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground">
                      {kind === "licenza" ? "Nessuna licenza." : "Nessun abbonamento."}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
