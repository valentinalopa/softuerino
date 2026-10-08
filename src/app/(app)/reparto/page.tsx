import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { isAdminRole } from "@/lib/constants";
import { managedDepartmentNames } from "@/lib/departments";
import { managedDepartments, membersWithCap } from "@/lib/permissions";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { Card, CardContent } from "@/components/ui/card";
import { LevelAvatar, UserLevelBadges } from "@/components/team/UserLevel";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { NewTeamMemberDialog } from "@/components/team/NewTeamMemberDialog";
import { MobileList, MobileListItem } from "@/components/MobileList";

// Utilità → Il mio reparto: per i responsabili di reparto, secondo i permessi
// decisi dal super admin (Ruoli e permessi). Gli admin usano Team.
export default async function RepartoPage() {
  const user = await requireUser();
  if (isAdminRole(user.role)) redirect("/team");

  const departments = (await managedDepartments(user.id)).filter((d) =>
    d.caps.some((c) => c === "presenze_ore" || c === "richieste" || c === "approvare" || c === "nuovi_membri")
  );
  if (departments.length === 0) redirect("/");

  const canCreate = departments.some((d) => d.caps.includes("nuovi_membri"));
  const approvable = await membersWithCap(user.id, "approvare");
  const visibleDepartments = departments.filter((d) =>
    d.caps.some((c) => c === "presenze_ore" || c === "richieste" || c === "approvare")
  );

  const [pending, members, managedBy] = await Promise.all([
    approvable.length > 0
      ? prisma.leaveRequest.findMany({
          where: { status: "pending", userId: { in: approvable } },
          include: {
            user: { select: { name: true } },
            recoveryCredit: { select: { reason: true, amount: true, unit: true } },
          },
          orderBy: { startDate: "asc" },
        })
      : Promise.resolve([]),
    prisma.userDepartment.findMany({
      where: { departmentId: { in: visibleDepartments.map((d) => d.id) }, userId: { not: user.id }, user: { active: true } },
      select: { departmentId: true, user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { user: { name: "asc" } },
    }),
    managedDepartmentNames(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Il mio reparto</h1>
          <p className="text-sm text-muted-foreground">
            {departments.map((d) => d.name).join(", ")}: le persone del reparto e cosa puoi vedere o fare per
            loro, secondo i permessi decisi dall&apos;amministrazione.
          </p>
        </div>
        {canCreate && <NewTeamMemberDialog roles={["membro"]} ssoEnabled={isOidcConfigured()} />}
      </div>

      {approvable.length > 0 && (
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

      {visibleDepartments.map((d) => {
        const people = members.filter((m) => m.departmentId === d.id).map((m) => m.user);
        return (
          <section key={d.id} className="space-y-3">
            <h2>{d.name}</h2>
            <Card className="py-0">
              <CardContent className="px-0">
                <MobileList className="md:block">
                  {people.map((p) => (
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
                  {people.length === 0 && (
                    <MobileListItem className="text-center text-muted-foreground">
                      Nessun&apos;altra persona nel reparto.
                    </MobileListItem>
                  )}
                </MobileList>
              </CardContent>
            </Card>
          </section>
        );
      })}
    </div>
  );
}
