import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { ensureConfiguredDepartments, managedDepartmentNames } from "@/lib/departments";
import { departmentRules, generalRules } from "@/lib/permissions";
import { DEPARTMENT_ROLES, PERMISSION_ROLES } from "@/lib/permission-rules";
import { formatDate } from "@/lib/leave-format";
import { updateAccountNotify } from "@/lib/accounts/actions";
import { updateDepartmentRules, updateGeneralRules, updateLeaveNotify } from "@/lib/roles/actions";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { ResponsabileBadge, UserLevelBadges, levelSummary } from "@/components/team/UserLevel";
import { PermissionMatrix } from "@/components/ruoli/PermissionMatrix";
import { PeopleChoiceForm } from "@/components/ruoli/PeopleChoiceForm";
import { AccountRequestActions } from "@/components/ruoli/AccountRequestActions";

// Amministrazione → Ruoli e permessi (solo super admin): permessi per ruolo
// (impostazioni generali) o per reparto (personalizzazioni), richieste di
// nuovi utenti, responsabili ferie.
const LEVELS: { badge: React.ReactNode; text: string }[] = [
  {
    badge: <UserLevelBadges role="super_admin" departments={[]} />,
    text: "Sempre tutto, più il sistema: aggiornamenti, email, VPN, ruoli e permessi, accesso d'emergenza con password.",
  },
  {
    badge: <UserLevelBadges role="admin" departments={[]} />,
    text: "Amministrazione del personale (Team, Richieste del team, Clienti, «Vedi come»); licenze secondo i permessi qui sotto.",
  },
  {
    badge: <ResponsabileBadge />,
    text: "Incarico da Keycloak che si somma al ruolo: i permessi della colonna «Responsabile», sul suo reparto o su tutti.",
  },
  {
    badge: <UserLevelBadges role="membro" departments={[]} />,
    text: "Le proprie richieste, presenze, ore e task; più i permessi della colonna «Membro».",
  },
];

function daysAgo(days: number) {
  return new Date(Date.now() - days * 86400000);
}

export default async function RuoliPage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; reparto?: string }>;
}) {
  await requireSuperAdmin();
  await ensureConfiguredDepartments();
  const { vista, reparto } = await searchParams;
  const view = vista === "reparto" ? "reparto" : "ruolo";

  const [general, departments, people, managedBy, email, accountRequests] = await Promise.all([
    generalRules(),
    prisma.department.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        permissions: true,
        members: { where: { isManager: true, user: { active: true } }, select: { user: { select: { name: true } } } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true, leaveNotify: true, accountNotify: true },
    }),
    managedDepartmentNames(),
    prisma.emailSettings.findFirst({ select: { enabled: true } }),
    prisma.accountRequest.findMany({
      where: { OR: [{ status: "pending" }, { handledAt: { gte: daysAgo(30) } }] },
      orderBy: [{ status: "desc" }, { createdAt: "desc" }],
      include: {
        department: { select: { name: true } },
        requestedBy: { select: { name: true } },
        handledBy: { select: { name: true } },
      },
    }),
  ]);
  const selected = departments.find((d) => d.id === reparto) ?? departments[0];
  const existingEmails = new Set(people.map((p) => p.email.toLowerCase()));
  const pendingRequests = accountRequests.filter((r) => r.status === "pending");
  const summary = (p: (typeof people)[number]) => levelSummary(p.role, managedBy.get(p.id) ?? []);

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
          <CardDescription>Chi ha più ruoli li somma (es. Membro e Responsabile): vale il permesso più ampio.</CardDescription>
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
        <div className="space-y-3">
          <h2>Permessi</h2>
          <SegmentedLinkTabs
            items={[
              { key: "ruolo", label: "Per ruolo", href: "/ruoli", active: view === "ruolo" },
              { key: "reparto", label: "Per reparto", href: "/ruoli?vista=reparto", active: view === "reparto" },
            ]}
          />
        </div>

        {view === "ruolo" ? (
          <Card>
            <CardHeader>
              <CardTitle>Impostazioni generali</CardTitle>
              <CardDescription>
                Valgono per tutti i reparti, tranne quelli personalizzati (vista «Per reparto»). «Il suo reparto»
                = le persone (o le licenze) dei reparti di cui fa parte o che guida.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <PermissionMatrix rules={general} roles={PERMISSION_ROLES} onSave={updateGeneralRules} />
            </CardContent>
          </Card>
        ) : (
          selected && (
            <>
              <SegmentedLinkTabs
                items={departments.map((d) => ({
                  key: d.id,
                  label: d.permissions ? `${d.name} ●` : d.name,
                  href: `/ruoli?vista=reparto&reparto=${d.id}`,
                  active: d.id === selected.id,
                }))}
              />
              <Card key={selected.id}>
                <CardHeader>
                  <CardTitle>{selected.name}</CardTitle>
                  <CardDescription className="flex flex-wrap items-center gap-2">
                    {selected.members.length > 0 ? (
                      selected.members.map((m) => (
                        <Badge key={m.user.name} variant="warning">
                          Responsabile: {m.user.name}
                        </Badge>
                      ))
                    ) : (
                      <span>Nessun responsabile in Keycloak.</span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PermissionMatrix
                    rules={departmentRules(general, selected.permissions)}
                    general={general}
                    roles={DEPARTMENT_ROLES}
                    onSave={updateDepartmentRules.bind(null, selected.id)}
                    departmentMode={selected.permissions ? "custom" : "general"}
                  />
                </CardContent>
              </Card>
              <p className="text-xs text-muted-foreground">● = reparto con permessi personalizzati.</p>
            </>
          )
        )}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Nuovi utenti</CardTitle>
          <CardDescription>
            Le richieste di chi ha il permesso «Richiedere nuovi utenti». Crea l&apos;account in Keycloak, poi segnala
            «Creato»: chi l&apos;ha chiesto riceve un&apos;email.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {accountRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessuna richiesta negli ultimi 30 giorni.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {accountRequests.map((r) => (
                <li key={r.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-foreground">
                      {r.firstName} {r.lastName}
                      {existingEmails.has(r.email) && (
                        <Badge variant="success" className="ml-2">
                          Ha già fatto accesso
                        </Badge>
                      )}
                    </p>
                    <p className="text-muted-foreground">
                      {r.email}
                      {r.department ? ` · ${r.department.name}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Chiesto da {r.requestedBy?.name ?? "—"} il {formatDate(r.createdAt)}
                      {r.status !== "pending" &&
                        ` · ${r.status === "done" ? "creato" : "rifiutato"} da ${r.handledBy?.name ?? "—"}`}
                    </p>
                    {r.note && <p className="mt-1 text-xs whitespace-pre-line text-muted-foreground">{r.note}</p>}
                  </div>
                  {r.status === "pending" ? (
                    <AccountRequestActions requestId={r.id} />
                  ) : (
                    <Badge variant={r.status === "done" ? "success" : "danger"}>
                      {r.status === "done" ? "Creato" : "Non accolta"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
          {pendingRequests.length > 0 && (
            <p className="text-xs text-muted-foreground">{pendingRequests.length} in attesa.</p>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">Chi riceve le richieste</p>
            <p className="text-xs text-muted-foreground">Se non scegli nessuno, arrivano a tutti i super admin.</p>
            <PeopleChoiceForm
              people={people
                .filter((p) => p.role === "super_admin" || p.role === "admin")
                .map((p) => ({ id: p.id, name: p.name, summary: summary(p), checked: p.accountNotify }))}
              onSave={updateAccountNotify}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Responsabili ferie</CardTitle>
          <CardDescription>
            Ricevono un&apos;email per ogni nuova richiesta di ferie, permesso o assenza (e per le malattie
            registrate, solo se admin). L&apos;email arriva anche a chi può approvare le richieste di quella persona.
            {!email?.enabled && " Attenzione: le notifiche email sono spente (Sistema → Email)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PeopleChoiceForm
            people={people.map((p) => ({ id: p.id, name: p.name, summary: summary(p), checked: p.leaveNotify }))}
            onSave={updateLeaveNotify}
          />
        </CardContent>
      </Card>
    </div>
  );
}
