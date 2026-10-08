import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { isSsoManaged } from "@/lib/auth/oidc";
import {
  balanceFigures,
  getLeaveBalance,
  outsideAllowance,
  remainingByLeaveType,
} from "@/lib/leave-balance";
import { formatToRecover } from "@/lib/leave-format";
import {
  assignableRoles,
  IMPERSONATABLE_ROLES,
  type EmploymentType,
  type Role,
} from "@/lib/constants";
import { RoleBadge } from "@/components/team/RoleBadge";
import { ActiveBadge } from "@/components/ActiveBadge";
import { EditTeamMemberForm } from "@/components/team/EditTeamMemberForm";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { getOpenRecoveryCredits, getRecoveryCreditsForUsers } from "@/lib/recovery-credits";
import { MemberBalances } from "@/components/team/MemberBalances";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { StartImpersonationButton } from "@/components/impersonation/StartImpersonationButton";
import { OreLogSection, type OreLogParams } from "@/components/ore/OreLogSection";
import { AttendanceSection } from "@/components/presenze/AttendanceSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const TABS = ["profilo", "saldi", "richieste", "presenze", "ore"] as const;

const TAB_LABELS: Record<(typeof TABS)[number], string> = {
  profilo: "Profilo",
  saldi: "Saldi",
  richieste: "Richieste",
  presenze: "Presenze",
  ore: "Ore",
};
type Tab = (typeof TABS)[number];

// Scheda membro: l'unico punto in cui un admin consulta e gestisce i
// dati di un'altra persona (profilo, saldi e recuperi, richieste, presenze,
// ore). Le pagine /ore, /presenze e /richieste restano personali.
export default async function TeamMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<OreLogParams & { tab?: string; month?: string }>;
}) {
  const currentUser = await requireAdmin();
  const { id } = await params;
  const { tab: tabParam, month: monthParam, ...oreParams } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "profilo";

  const member = await prisma.user.findUnique({ where: { id } });
  if (!member) {
    notFound();
  }

  const basePath = `/team/${member.id}`;
  const tabHref = (t: Tab) => (t === "profilo" ? basePath : `${basePath}?tab=${t}`);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Il link "torna a" sta sempre in alto a sinistra, sopra il titolo. */}
        <Link href="/team" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Torna al Team
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1>{member.name}</h1>
              <RoleBadge role={member.role} />
              <ActiveBadge active={member.active} />
            </div>
            <p className="text-sm text-muted-foreground">{member.email}</p>
          </div>
          {/* "Vedi come": solo verso membri attivi, mai verso admin o super admin. */}
          {member.active && IMPERSONATABLE_ROLES.includes(member.role) && (
            <StartImpersonationButton userId={member.id} userName={member.name} />
          )}
        </div>
      </div>

      <SegmentedLinkTabs
        items={TABS.map((t) => ({
          key: t,
          label: TAB_LABELS[t],
          href: tabHref(t),
          active: tab === t,
        }))}
      />

      {tab === "profilo" && (
        <ProfiloTab
          member={member}
          isSelf={member.id === currentUser.id}
          roles={assignableRoles(currentUser.role)}
        />
      )}

      {tab === "saldi" && (
        <SaldiTab
          memberId={member.id}
          employmentType={member.employmentType as EmploymentType}
          canEdit={currentUser.role === "super_admin"}
        />
      )}

      {tab === "ore" && (
        <OreLogSection
          userId={member.id}
          canEdit
          basePath={`${basePath}?tab=ore`}
          params={oreParams}
        />
      )}

      {tab === "presenze" && (
        <AttendanceSection
          userId={member.id}
          editable
          basePath={`${basePath}?tab=presenze`}
          monthParam={monthParam}
        />
      )}

      {tab === "richieste" && (
        <RichiesteTab
          memberId={member.id}
          employmentType={member.employmentType as EmploymentType}
        />
      )}
    </div>
  );
}

async function ProfiloTab({
  member,
  isSelf,
  roles,
}: {
  member: {
    id: string;
    name: string;
    email: string;
    role: string;
    employmentType: string;
    active: boolean;
    oidcSubject: string | null;
    reportsTo: string;
  };
  isSelf: boolean;
  roles: readonly Role[];
}) {
  const departments = await prisma.userDepartment.findMany({
    where: { userId: member.id },
    include: { department: { select: { name: true } } },
    orderBy: { department: { name: "asc" } },
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Reparti</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {departments.length > 0 ? (
            <p>
              {departments
                .map((d) => (d.isManager ? `${d.department.name} (manager)` : d.department.name))
                .join(", ")}
            </p>
          ) : (
            <p className="text-muted-foreground">Nessun reparto.</p>
          )}
          {member.reportsTo && (
            <p className="mt-1">Fa capo a: {member.reportsTo.split(",").join(", ")}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Organigramma gestito in Keycloak dall&apos;IT, aggiornato a ogni accesso.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Informazioni personali</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Un admin non modifica gli account dei super admin. */}
          {roles.includes(member.role as Role) ? (
            <EditTeamMemberForm
              user={member}
              isSelf={isSelf}
              roles={roles}
              ssoManaged={isSsoManaged(member)}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Solo un super admin può modificare l&apos;account di un super admin.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

async function SaldiTab({
  memberId,
  employmentType,
  canEdit,
}: {
  memberId: string;
  employmentType: EmploymentType;
  canEdit: boolean;
}) {
  const year = new Date().getFullYear();
  const [balance, creditsByUser] = await Promise.all([
    getLeaveBalance(memberId, employmentType, year),
    getRecoveryCreditsForUsers([memberId]),
  ]);
  const credits = creditsByUser.get(memberId) ?? [];

  return (
    <MemberBalances
      userId={memberId}
      year={year}
      balances={balanceFigures(balance)}
      toRecover={formatToRecover(credits)}
      recoveryCredits={credits}
      outsideAllowance={outsideAllowance(balance)}
      canEdit={canEdit}
    />
  );
}

async function RichiesteTab({
  memberId,
  employmentType,
}: {
  memberId: string;
  employmentType: EmploymentType;
}) {
  const [leaveRequests, recoveryCredits, balance] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: memberId },
      include: { recoveryCredit: { select: { reason: true, amount: true, unit: true } } },
      orderBy: { startDate: "desc" },
    }),
    getOpenRecoveryCredits(memberId),
    getLeaveBalance(memberId, employmentType),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Richieste e assenze</h2>
        <NewLeaveRequestDialog
          employmentType={employmentType}
          targetUserId={memberId}
          remaining={remainingByLeaveType(balance)}
          recoveryCredits={recoveryCredits}
        />
      </div>
      <Card>
        <CardContent>
          <LeaveRequestsTable
            requests={leaveRequests}
            showActions
            emptyMessage="Nessuna richiesta ancora."
          />
        </CardContent>
      </Card>
    </div>
  );
}
