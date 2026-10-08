import { prisma } from "@/lib/prisma";
import { byName } from "@/lib/utils";
import { ensureConfiguredDepartments } from "@/lib/departments";
import { accountForViewer, licenseScopeFor, licenseWhere, maskedAccount, maskedKey, requireLicenseAccess } from "@/lib/licenses/access";
import { expiryStatus, formatExpiry } from "@/lib/licenses/expiry";
import { LICENSE_KINDS, type LicenseKind } from "@/lib/constants";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LinkRow } from "@/components/LinkRow";
import { MobileList, MobileListItem } from "@/components/MobileList";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { NewLicenseDialog } from "@/components/utilita/NewLicenseDialog";
import { LicenseQuickKey } from "@/components/utilita/LicenseQuickKey";
import { Users } from "lucide-react";
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
  const { user, scope } = await requireLicenseAccess();
  // Reparti in cui può aggiungere licenze (permesso "Gestire le licenze").
  const manageScope = await licenseScopeFor(user, "gestire");
  const { tipo } = await searchParams;
  const kind: LicenseKind = LICENSE_KINDS.includes(tipo as LicenseKind)
    ? (tipo as LicenseKind)
    : "licenza";

  if (scope?.all || manageScope?.all) await ensureConfiguredDepartments();
  const [licenses, departments, viewDepartments, allDepartments] = await Promise.all([
    prisma.license.findMany({
      where: licenseWhere(scope),
      orderBy: { name: "asc" },
      include: {
        department: { select: { name: true } },
        sharedDepartments: { select: { department: { select: { name: true } } } },
        _count: { select: { activations: true } },
        activations: { orderBy: { createdAt: "asc" }, select: { id: true, label: true, note: true } },
      },
    }),
    prisma.department.findMany({
      where: !manageScope ? { id: { in: [] } } : manageScope.all ? {} : { id: { in: manageScope.departmentIds } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    !scope || scope.all
      ? Promise.resolve([])
      : prisma.department.findMany({
          where: { id: { in: scope.departmentIds } },
          orderBy: { name: "asc" },
          select: { name: true },
        }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  // Sempre per nome (le scadenze vicine si vedono dall'etichetta colorata).
  const rows = licenses.filter((l) => l.kind === kind).sort(byName);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Licenze e abbonamenti</h1>
          <p className="text-sm text-muted-foreground">
            {scope?.all
              ? "Tutti i reparti."
              : viewDepartments.length > 0
                ? `Reparti: ${viewDepartments.map((d) => d.name).join(", ")}, più quelle visibili a tutti.`
                : "Quelle visibili a tutti."}{" "}
            Prima di una scadenza i super admin ricevono un&apos;email (con il preavviso impostato
            su ogni voce) e un&apos;altra il giorno prima.
          </p>
        </div>
        {departments.length > 0 && <NewLicenseDialog departments={departments} allDepartments={allDepartments} />}
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
                        {[l.vendor, departmentsLabel(l)].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <LicenseSecrets
                      viewer={user}
                      license={l}
                      activations={l.activations}
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
                      <TableCell className="text-muted-foreground">{departmentsLabel(l)}</TableCell>
                      <TableCell>
                        <LicenseSecrets
                          viewer={user}
                          license={l}
                          activations={l.activations}
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

// Reparti di una licenza: principale, condivisi, o "Tutti".
function departmentsLabel(l: {
  visibleToAll: boolean;
  department: { name: string };
  sharedDepartments: { department: { name: string } }[];
}) {
  if (l.visibleToAll) return "Visibile a tutti";
  return [l.department.name, ...l.sharedDepartments.map((d) => d.department.name)].join(", ");
}

// Chiave, account e password, con Mostra/Copia (uso obbligatorio). L'account
// in chiaro solo ai super admin.
function LicenseSecrets({
  viewer,
  license: l,
  activations,
}: {
  viewer: { role: string };
  license: {
    id: string;
    name: string;
    keyHint: string | null;
    activationLimit: number | null;
    accountEncrypted: string | null;
    accountHint: string | null;
    passwordEncrypted: string | null;
  };
  activations: { id: string; label: string; note: string | null }[];
}) {
  const hasPassword = Boolean(l.passwordEncrypted);
  const hasAccount = Boolean(l.accountEncrypted);
  const account = accountForViewer(viewer, l.accountEncrypted);
  const common = { licenseId: l.id, name: l.name, activations, limit: l.activationLimit };
  return (
    <div className="space-y-1">
      {(l.keyHint || (!hasPassword && !hasAccount)) && <LicenseQuickKey {...common} masked={maskedKey(l.keyHint)} />}
      {hasAccount &&
        (account ? (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="size-3" aria-hidden="true" />
            {account}
          </span>
        ) : (
          <LicenseQuickKey {...common} masked={maskedAccount(l.accountHint)} field="account" />
        ))}
      {hasPassword && <LicenseQuickKey {...common} masked="••••••••" field="password" />}
    </div>
  );
}
