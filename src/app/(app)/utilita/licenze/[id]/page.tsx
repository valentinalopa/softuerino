import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import {
  accountForViewer,
  canAccessLicense,
  licenseScopeFor,
  maskedAccount,
  maskedKey,
  requireLicenseAccess,
} from "@/lib/licenses/access";
import { updateLicense } from "@/lib/licenses/actions";
import { licenseExpiry } from "@/lib/licenses/expiry";
import { LICENSE_KIND_LABELS, type LicenseKind } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/leave-format";
import { formatTime } from "@/lib/calendar-utils";
import { LicenseQuickKey } from "@/components/utilita/LicenseQuickKey";
import { LicenseActivations } from "@/components/utilita/LicenseActivations";
import { LicenseForm } from "@/components/utilita/LicenseForm";
import { DeleteLicenseButton } from "@/components/utilita/DeleteLicenseButton";

function isoDate(date: Date | null) {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default async function LicenzaPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, scope } = await requireLicenseAccess();
  const manageScope = await licenseScopeFor(user, "gestire");
  const { id } = await params;

  const license = await prisma.license.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
      sharedDepartments: { select: { departmentId: true, department: { select: { name: true } } } },
      activations: {
        orderBy: { createdAt: "asc" },
        include: { createdBy: { select: { name: true } } },
      },
      keyAccesses: {
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { user: { select: { name: true } } },
      },
    },
  });
  // Licenza non accessibile: come se non esistesse.
  if (!license || !canAccessLicense(scope, license, "vedere")) notFound();

  // Chi può solo vederla: dati in sola lettura, niente modifiche né registro.
  const canManage = canAccessLicense(manageScope, license, "gestire");
  const account = accountForViewer(user, license.accountEncrypted);
  const activations = license.activations.map((a) => ({ id: a.id, label: a.label, note: a.note }));
  const allDepartments = await prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
  const departmentsText = license.visibleToAll
    ? "Visibile a tutti"
    : [license.department.name, ...license.sharedDepartments.map((d) => d.department.name)].join(", ");
  const departments = await prisma.department.findMany({
    where: !manageScope ? { id: { in: [] } } : manageScope.all ? {} : { id: { in: manageScope.departmentIds } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/utilita/licenze" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Licenze e abbonamenti
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1>{license.name}</h1>
            <p className="text-sm text-muted-foreground">
              {LICENSE_KIND_LABELS[license.kind as LicenseKind] ?? license.kind} ·{" "}
              {departmentsText}
              {license.vendor ? ` · ${license.vendor}` : ""} · Scadenza:{" "}
              {licenseExpiry(license).label}
              {!license.notifyExpiry && license.expiresAt && " · senza avviso email"}
            </p>
          </div>
          {canManage && <DeleteLicenseButton licenseId={license.id} name={license.name} />}
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dati</CardTitle>
          </CardHeader>
          <CardContent>
            {canManage ? (
              <LicenseForm
                departments={departments}
                allDepartments={allDepartments}
                submitLabel="Salva modifiche"
                onSubmit={updateLicense.bind(null, license.id)}
                initial={{
                  name: license.name,
                  kind: license.kind,
                  vendor: license.vendor,
                  departmentId: license.departmentId,
                  activationLimit: license.activationLimit,
                  expiresAt: isoDate(license.expiresAt),
                  reminderDays: license.reminderDays,
                  notes: license.notes,
                  hasKey: Boolean(license.keyEncrypted),
                  sharedDepartmentIds: license.sharedDepartments.map((d) => d.departmentId),
                  visibleToAll: license.visibleToAll,
                  hasAccount: Boolean(license.accountEncrypted),
                  hasPassword: Boolean(license.passwordEncrypted),
                  autoRenew: license.autoRenew,
                  renewalMonths: license.renewalMonths,
                  notifyExpiry: license.notifyExpiry,
                }}
              />
            ) : (
              <dl className="space-y-2 text-sm">
                {[
                  ["Tipo", LICENSE_KIND_LABELS[license.kind as LicenseKind] ?? license.kind],
                  ["Reparti", departmentsText],
                  ["Fornitore", license.vendor ?? "—"],
                  [license.autoRenew ? "Rinnovo" : "Scadenza", licenseExpiry(license).label],
                  [
                    license.kind === "licenza" ? "Attivazioni massime" : "Utenti/posti",
                    license.activationLimit === null ? "Illimitate" : String(license.activationLimit),
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-border pb-2">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right">{value}</dd>
                  </div>
                ))}
                {license.notes && <p className="pt-1 whitespace-pre-line text-muted-foreground">{license.notes}</p>}
              </dl>
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{license.passwordEncrypted || license.accountEncrypted ? "Chiave e accesso" : "Chiave"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(license.keyHint || (!license.passwordEncrypted && !license.accountEncrypted)) && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Chiave di licenza</p>
                  <LicenseQuickKey
                    licenseId={license.id}
                    name={license.name}
                    masked={maskedKey(license.keyHint)}
                    activations={activations}
                    limit={license.activationLimit}
                    withLabels
                  />
                </div>
              )}
              {(license.accountEncrypted || license.passwordEncrypted) && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">Account di acquisto / accesso</p>
                  {license.accountEncrypted &&
                    (account ? (
                      // Super admin: in chiaro.
                      <code className="block w-fit rounded-md bg-muted px-2 py-1 text-sm break-all">{account}</code>
                    ) : (
                      <LicenseQuickKey
                        licenseId={license.id}
                        name={license.name}
                        masked={maskedAccount(license.accountHint)}
                        activations={activations}
                        limit={license.activationLimit}
                        withLabels
                        field="account"
                      />
                    ))}
                  {license.passwordEncrypted && (
                    <LicenseQuickKey
                      licenseId={license.id}
                      name={license.name}
                      masked="••••••••"
                      activations={activations}
                      limit={license.activationLimit}
                      withLabels
                      field="password"
                    />
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                Per vederle o copiarle si indica dove vengono usate: ogni accesso viene registrato.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{license.kind === "licenza" ? "Attivazioni" : "Utenti/posti"}</CardTitle>
            </CardHeader>
            <CardContent>
              <LicenseActivations
                licenseId={license.id}
                readOnly={!canManage}
                limit={license.activationLimit}
                activations={license.activations.map((a) => ({
                  id: a.id,
                  label: a.label,
                  note: a.note,
                  createdAt: a.createdAt.toISOString(),
                  createdBy: a.createdBy?.name ?? null,
                }))}
              />
            </CardContent>
          </Card>

          {canManage && (
            <Card>
              <CardHeader>
                <CardTitle>Accessi alla chiave</CardTitle>
                <CardDescription>Gli ultimi 20: chi l&apos;ha vista o copiata, e per cosa.</CardDescription>
              </CardHeader>
              <CardContent>
                {license.keyAccesses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Nessuno ha ancora visto o copiato la chiave.
                  </p>
                ) : (
                  <ul className="divide-y divide-border-subtle text-sm">
                    {license.keyAccesses.map((a) => (
                      <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-foreground">
                          {a.user.name}{" "}
                          <span className="text-muted-foreground">
                            ·{" "}
                            {a.field === "account"
                              ? `account ${a.action === "copy" ? "copiato" : "mostrato"}`
                              : `${a.field === "password" ? "password" : "chiave"} ${a.action === "copy" ? "copiata" : "mostrata"}`}
                            {a.usedFor && ` per ${a.usedFor}`}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {formatDate(a.createdAt)} {formatTime(a.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
