import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { ensureConfiguredDepartments, managedDepartmentNames } from "@/lib/departments";
import { parseManagerCaps } from "@/lib/constants";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsabileBadge, UserLevelBadges, levelSummary } from "@/components/team/UserLevel";
import { DepartmentPermissionsForm } from "@/components/ruoli/DepartmentPermissionsForm";
import { LeaveNotifyForm } from "@/components/ruoli/LeaveNotifyForm";

// Amministrazione → Ruoli e permessi (solo super admin): cosa fa ogni
// livello, cosa possono i responsabili di ciascun reparto, chi riceve le
// richieste di ferie e assenze.
const LEVELS: { badge: React.ReactNode; text: string }[] = [
  {
    badge: <UserLevelBadges role="super_admin" departments={[]} />,
    text: "Tutto, più il sistema: aggiornamenti, email, VPN, ruoli e permessi, accesso d'emergenza con password.",
  },
  {
    badge: <UserLevelBadges role="admin" departments={[]} />,
    text: "Amministrazione del personale: approva le richieste di tutti, gestisce Team, saldi visibili, clienti, «Vedi come», tutte le licenze.",
  },
  {
    badge: <ResponsabileBadge />,
    text: "Incarico che arriva da Keycloak e si somma al ruolo: vale solo per le persone del suo reparto, con i permessi decisi qui sotto.",
  },
  {
    badge: <UserLevelBadges role="membro" departments={[]} />,
    text: "Le proprie richieste, presenze, ore e task; organigramma, VPN e account SSO.",
  },
];

export default async function RuoliPage() {
  await requireSuperAdmin();
  await ensureConfiguredDepartments();

  const [departments, people, managedBy, email] = await Promise.all([
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        managerPermissions: true,
        members: { where: { isManager: true, user: { active: true } }, select: { user: { select: { name: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true, leaveNotify: true },
    }),
    managedDepartmentNames(),
    prisma.emailSettings.findFirst({ select: { enabled: true } }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1>Ruoli e permessi</h1>
        <p className="text-sm text-muted-foreground">
          Il ruolo di ognuno si cambia dalla sua scheda in{" "}
          <Link href="/team" className="underline underline-offset-2">
            Team
          </Link>
          ; chi è responsabile di quale reparto si decide in Keycloak (organigramma).
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Livelli</CardTitle>
          <CardDescription>Chi ha più ruoli li somma (es. Admin e Responsabile).</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y divide-border">
            {LEVELS.map((level, i) => (
              <li key={i} className="flex flex-col gap-1.5 py-3 sm:flex-row sm:items-start sm:gap-4">
                <span className="flex w-52 shrink-0 flex-wrap gap-1">{level.badge}</span>
                <span className="text-sm text-muted-foreground">{level.text}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <section className="space-y-4">
        <div>
          <h2>Responsabili di reparto</h2>
          <p className="text-sm text-muted-foreground">
            Per ogni reparto, cosa possono fare i suoi responsabili sulle persone del reparto.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4">
          {departments.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle>{d.name}</CardTitle>
                <CardDescription className="flex flex-wrap items-center gap-2">
                  {d.members.length > 0 ? (
                    d.members.map((m) => (
                      <Badge key={m.user.name} variant="warning">
                        {m.user.name}
                      </Badge>
                    ))
                  ) : (
                    <span>Nessun responsabile in Keycloak.</span>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DepartmentPermissionsForm departmentId={d.id} caps={parseManagerCaps(d.managerPermissions)} />
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Responsabili ferie</CardTitle>
          <CardDescription>
            Ricevono un&apos;email per ogni nuova richiesta di ferie, permesso o assenza (e per le malattie
            registrate). L&apos;email arriva anche ai responsabili del reparto che possono approvare.
            {!email?.enabled && " Attenzione: le notifiche email sono spente (Sistema → Email)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveNotifyForm
            people={people.map((p) => ({
              id: p.id,
              name: p.name,
              summary: levelSummary(p.role, managedBy.get(p.id) ?? []),
              leaveNotify: p.leaveNotify,
            }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}
