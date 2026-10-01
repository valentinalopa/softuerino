import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { getLeaveBalance, type LeaveBalance } from "@/lib/leave-balance";
import { assignableRoles, type EmploymentType, type Role } from "@/lib/constants";
import { RoleBadge } from "@/components/team/RoleBadge";
import { ActiveBadge } from "@/components/ActiveBadge";
import { EditTeamMemberForm } from "@/components/team/EditTeamMemberForm";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { StartImpersonationButton } from "@/components/impersonation/StartImpersonationButton";
import { OreLogSection, type OreLogParams } from "@/components/ore/OreLogSection";
import { AttendanceSection } from "@/components/presenze/AttendanceSection";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

const TABS = ["info", "ore", "presenze", "richieste"] as const;
type Tab = (typeof TABS)[number];

// Scheda membro: l'unico punto in cui un admin consulta e gestisce i
// dati di un'altra persona (CRUD su ore, presenze e richieste). Le pagine
// /ore, /presenze e /richieste restano personali.
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
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "info";

  const member = await prisma.user.findUnique({ where: { id } });
  if (!member) {
    notFound();
  }

  const basePath = `/team/${member.id}`;
  const tabHref = (t: Tab) => (t === "info" ? basePath : `${basePath}?tab=${t}`);

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
          {member.active && member.role === "membro" && (
            <StartImpersonationButton userId={member.id} userName={member.name} />
          )}
        </div>
      </div>

      <SegmentedLinkTabs
        items={[
          { key: "info", label: "Info", href: tabHref("info"), active: tab === "info" },
          { key: "ore", label: "Ore", href: tabHref("ore"), active: tab === "ore" },
          {
            key: "presenze",
            label: "Presenze",
            href: tabHref("presenze"),
            active: tab === "presenze",
          },
          {
            key: "richieste",
            label: "Richieste",
            href: tabHref("richieste"),
            active: tab === "richieste",
          },
        ]}
      />

      {tab === "info" && (
        <InfoTab
          member={member}
          isSelf={member.id === currentUser.id}
          roles={assignableRoles(currentUser.role)}
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

async function InfoTab({
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
  };
  isSelf: boolean;
  roles: readonly Role[];
}) {
  const balance = await getLeaveBalance(
    member.id,
    member.employmentType as EmploymentType
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <BalanceCards balance={balance} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informazioni personali</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Un admin non modifica gli account dei super admin. */}
          {roles.includes(member.role as Role) ? (
            <EditTeamMemberForm user={member} isSelf={isSelf} roles={roles} />
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

async function RichiesteTab({
  memberId,
  employmentType,
}: {
  memberId: string;
  employmentType: EmploymentType;
}) {
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: { userId: memberId },
    orderBy: { startDate: "desc" },
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2>Richieste e assenze</h2>
        <NewLeaveRequestDialog
          employmentType={employmentType}
          targetUserId={memberId}
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

function BalanceCards({ balance }: { balance: LeaveBalance }) {
  if (balance.kind === "assenze") {
    return (
      <BalanceCard
        label="Assenze rimanenti"
        value={`${balance.assenzeRemaining} / ${balance.assenzeAllowance} giorni`}
      />
    );
  }
  return (
    <>
      <BalanceCard
        label="Ferie rimanenti"
        value={`${balance.ferieRemaining} / ${balance.ferieAllowance} giorni`}
      />
      <BalanceCard
        label="Permesso rimanente"
        value={`${balance.permessoRemaining} / ${balance.permessoAllowance} ore`}
      />
      <BalanceCard
        label="Malattia registrata"
        value={`${balance.malattiaDaysRegistered} giorni (nessun tetto)`}
      />
    </>
  );
}

function BalanceCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="mt-1 text-lg font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
