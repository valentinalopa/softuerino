import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { canAccessDepartment, maskedKey, requireLicenseAccess } from "@/lib/licenses/access";
import { updateLicense } from "@/lib/licenses/actions";
import { formatExpiry } from "@/lib/licenses/expiry";
import { LICENSE_KIND_LABELS, type LicenseKind } from "@/lib/constants";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/leave-format";
import { formatTime } from "@/lib/calendar-utils";
import { LicenseKeyField } from "@/components/utilita/LicenseKeyField";
import { LicenseActivations } from "@/components/utilita/LicenseActivations";
import { LicenseForm } from "@/components/utilita/LicenseForm";
import { DeleteLicenseButton } from "@/components/utilita/DeleteLicenseButton";

function isoDate(date: Date | null) {
  if (!date) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export default async function LicenzaPage({ params }: { params: Promise<{ id: string }> }) {
  const { scope } = await requireLicenseAccess();
  const { id } = await params;

  const license = await prisma.license.findUnique({
    where: { id },
    include: {
      department: { select: { name: true } },
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
  // Licenza di un reparto non accessibile: come se non esistesse.
  if (!license || !canAccessDepartment(scope, license.departmentId)) notFound();

  const departments = await prisma.department.findMany({
    where: scope.all ? {} : { id: { in: scope.departmentIds } },
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
              {license.department.name}
              {license.vendor ? ` · ${license.vendor}` : ""} · Scadenza:{" "}
              {formatExpiry(license.expiresAt)}
            </p>
          </div>
          <DeleteLicenseButton licenseId={license.id} name={license.name} />
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Dati</CardTitle>
          </CardHeader>
          <CardContent>
            <LicenseForm
              departments={departments}
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
              }}
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Chiave</CardTitle>
            </CardHeader>
            <CardContent>
              <LicenseKeyField licenseId={license.id} masked={maskedKey(license.keyHint)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{license.kind === "licenza" ? "Attivazioni" : "Utenti/posti"}</CardTitle>
            </CardHeader>
            <CardContent>
              <LicenseActivations
                licenseId={license.id}
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

          <Card>
            <CardHeader>
              <CardTitle>Accessi alla chiave</CardTitle>
              <CardDescription>Gli ultimi 20: chi l&apos;ha vista o copiata.</CardDescription>
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
                          · {a.action === "copy" ? "copiata" : "mostrata"}
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
        </div>
      </div>
    </div>
  );
}
