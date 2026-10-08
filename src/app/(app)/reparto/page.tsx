import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { byName } from "@/lib/utils";
import { requireUser } from "@/lib/auth/session";
import { isAdminRole } from "@/lib/constants";
import { managedDepartmentNames } from "@/lib/departments";
import { can, peopleInScope } from "@/lib/permissions";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { formatDate } from "@/lib/leave-format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LevelAvatar, UserLevelBadges } from "@/components/team/UserLevel";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { RequestAccountDialog } from "@/components/reparto/RequestAccountDialog";
import { MobileList, MobileListItem } from "@/components/MobileList";

const STATUS: Record<string, { label: string; variant: "warning" | "success" | "danger" }> = {
  pending: { label: "In attesa", variant: "warning" },
  done: { label: "Creato", variant: "success" },
  rejected: { label: "Non accolta", variant: "danger" },
};

// Utilità → Il mio reparto: le persone su cui si hanno permessi (Ruoli e
// permessi: presenze e ore, richieste e saldi, approvare), le richieste da
// approvare e le richieste di nuovi utenti. Gli admin usano Team.
export default async function RepartoPage() {
  const user = await requireUser();
  if (isAdminRole(user.role)) redirect("/team");

  const [presence, requests, approve, requestUsers] = await Promise.all([
    peopleInScope(user, "presenze_ore"),
    peopleInScope(user, "richieste"),
    peopleInScope(user, "approvare"),
    can(user, "utenti"),
  ]);
  const scopes = [presence, requests, approve];
  const anyPeople = scopes.some((s) => s === "all" || s.length > 0);
  if (!anyPeople && !requestUsers) redirect("/");

  const everyone = scopes.includes("all");
  const visibleIds = everyone ? null : [...new Set(scopes.flatMap((s) => (s === "all" ? [] : s)))];

  const [pending, people, managedBy, myAccountRequests, myDepartments, allDepartments] = await Promise.all([
    approve === "all" || approve.length > 0
      ? prisma.leaveRequest.findMany({
          where: {
            status: "pending",
            user: approve === "all" ? { id: { not: user.id } } : { id: { in: approve } },
          },
          include: {
            user: { select: { name: true } },
            recoveryCredit: { select: { reason: true, amount: true, unit: true } },
          },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
    anyPeople
      ? prisma.user.findMany({
          where: { active: true, id: everyone ? { not: user.id } : { in: visibleIds! } },
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            departments: { select: { department: { select: { name: true } } } },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    managedDepartmentNames(),
    requestUsers
      ? prisma.accountRequest.findMany({
          where: { requestedById: user.id },
          orderBy: { createdAt: "desc" },
          take: 10,
        })
      : Promise.resolve([]),
    prisma.userDepartment.findMany({ where: { userId: user.id }, select: { department: { select: { name: true } } } }),
    prisma.department.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  // Persone raggruppate per reparto (chi è in più reparti compare in ognuno).
  const groups = new Map<string, typeof people>();
  for (const p of [...people].sort(byName)) {
    const names = p.departments.length > 0 ? p.departments.map((d) => d.department.name) : ["Senza reparto"];
    for (const n of names) groups.set(n, [...(groups.get(n) ?? []), p]);
  }
  const groupNames = [...groups.keys()].sort((a, b) => (a === "Senza reparto" ? 1 : b === "Senza reparto" ? -1 : a.localeCompare(b)));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Il mio reparto</h1>
          <p className="text-sm text-muted-foreground">
            {myDepartments.length > 0 ? `${myDepartments.map((d) => d.department.name).join(", ")}: ` : ""}
            le persone e cosa puoi vedere o fare per loro, secondo i permessi decisi dall&apos;amministrazione.
          </p>
        </div>
        {requestUsers && <RequestAccountDialog departments={allDepartments} />}
      </div>

      {(approve === "all" || approve.length > 0) && (
        <section className="space-y-3">
          <h2>Richieste da approvare</h2>
          <Card>
            <CardContent>
              <LeaveRequestsTable
                requests={pending.map((r) => maskLeaveForViewer(r, user))}
                showMember
                showActions
                pendingOnly
                emptyMessage="Nessuna richiesta in attesa."
              />
            </CardContent>
          </Card>
        </section>
      )}

      {groupNames.map((name) => (
        <section key={name} className="space-y-3">
          <h2>{name}</h2>
          <Card className="py-0">
            <CardContent className="px-0">
              <MobileList className="md:block">
                {groups.get(name)!.map((p) => (
                  <MobileListItem key={p.id} href={`/reparto/${p.id}`} label={p.name}>
                    <div className="flex items-center gap-3">
                      <LevelAvatar name={p.name} role={p.role} departments={managedBy.get(p.id) ?? []} />
                      <div className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-foreground">{p.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.email}</span>
                      </div>
                      <div className="hidden flex-wrap justify-end gap-1 sm:flex">
                        <UserLevelBadges role={p.role} departments={managedBy.get(p.id) ?? []} />
                      </div>
                    </div>
                  </MobileListItem>
                ))}
              </MobileList>
            </CardContent>
          </Card>
        </section>
      ))}

      {requestUsers && myAccountRequests.length > 0 && (
        <section className="space-y-3">
          <h2>Le tue richieste di nuovi utenti</h2>
          <Card className="py-0">
            <CardContent className="px-0">
              <ul className="divide-y divide-border">
                {myAccountRequests.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="block font-medium text-foreground">
                        {r.firstName} {r.lastName}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {r.email} · {formatDate(r.createdAt)}
                      </span>
                    </span>
                    <Badge variant={STATUS[r.status]?.variant ?? "neutral"}>{STATUS[r.status]?.label ?? r.status}</Badge>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  );
}
