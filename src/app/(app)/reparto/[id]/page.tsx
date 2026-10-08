import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { type EmploymentType } from "@/lib/constants";
import { balanceFigures, getLeaveBalance, outsideAllowance } from "@/lib/leave-balance";
import { formatToRecover } from "@/lib/leave-format";
import { getRecoveryCreditsForUsers } from "@/lib/recovery-credits";
import { managedDepartmentNames } from "@/lib/departments";
import { managerCan } from "@/lib/permissions";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { UserLevelBadges } from "@/components/team/UserLevel";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { AttendanceSection } from "@/components/presenze/AttendanceSection";
import { OreLogSection, type OreLogParams } from "@/components/ore/OreLogSection";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { MemberBalances } from "@/components/team/MemberBalances";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

// Una persona del reparto vista dal suo responsabile: solo le schede che i
// permessi del reparto consentono, in sola lettura (tranne Approva/Rifiuta).
const TAB_LABELS = { presenze: "Presenze", ore: "Ore", richieste: "Richieste", saldi: "Saldi" } as const;
type Tab = keyof typeof TAB_LABELS;

export default async function RepartoMembroPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<OreLogParams & { tab?: string; month?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: tabParam, month: monthParam, ...oreParams } = await searchParams;

  const [seeAttendance, seeRequests, canApprove] = await Promise.all([
    managerCan(user.id, id, "presenze_ore"),
    managerCan(user.id, id, "richieste"),
    managerCan(user.id, id, "approvare"),
  ]);
  const tabs: Tab[] = [
    ...(seeAttendance ? (["presenze", "ore"] as const) : []),
    ...(seeRequests ? (["richieste", "saldi"] as const) : []),
  ];
  // Persona di un altro reparto (o permessi spenti): come se non esistesse.
  if (tabs.length === 0) notFound();

  const member = await prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true, employmentType: true, active: true },
  });
  if (!member || !member.active) notFound();
  const managed = (await managedDepartmentNames([member.id])).get(member.id) ?? [];

  const tab: Tab = tabs.includes(tabParam as Tab) ? (tabParam as Tab) : tabs[0];
  const basePath = `/reparto/${member.id}`;
  const tabHref = (t: Tab) => (t === tabs[0] ? basePath : `${basePath}?tab=${t}`);

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Link href="/reparto" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Il mio reparto
        </Link>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{member.name}</h1>
            <UserLevelBadges role={member.role} departments={managed} />
          </div>
          <p className="text-sm text-muted-foreground">{member.email}</p>
        </div>
      </div>

      {tabs.length > 1 && (
        <SegmentedLinkTabs
          items={tabs.map((t) => ({ key: t, label: TAB_LABELS[t], href: tabHref(t), active: tab === t }))}
        />
      )}

      {tab === "presenze" && (
        <AttendanceSection
          userId={member.id}
          editable={false}
          basePath={`${basePath}?tab=presenze`}
          monthParam={monthParam}
          viewer={user}
        />
      )}
      {tab === "ore" && (
        <OreLogSection userId={member.id} canEdit={false} basePath={`${basePath}?tab=ore`} params={oreParams} />
      )}
      {tab === "richieste" && <RichiesteTab memberId={member.id} canApprove={canApprove} viewer={user} />}
      {tab === "saldi" && (
        <SaldiTab memberId={member.id} employmentType={member.employmentType as EmploymentType} />
      )}
    </div>
  );
}

// La malattia è un dato sanitario: al responsabile arriva come "assenza".
async function RichiesteTab({
  memberId,
  canApprove,
  viewer,
}: {
  memberId: string;
  canApprove: boolean;
  viewer: { id: string; role: string };
}) {
  const requests = await prisma.leaveRequest.findMany({
    where: { userId: memberId },
    include: { recoveryCredit: { select: { reason: true, amount: true, unit: true } } },
    orderBy: { startDate: "desc" },
  });
  return (
    <Card>
      <CardContent>
        <LeaveRequestsTable
          requests={requests.map((r) => maskLeaveForViewer(r, viewer))}
          showActions={canApprove}
          pendingOnly
          emptyMessage="Nessuna richiesta ancora."
        />
      </CardContent>
    </Card>
  );
}

async function SaldiTab({ memberId, employmentType }: { memberId: string; employmentType: EmploymentType }) {
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
      // Niente giorni di malattia: dato sanitario, solo per la persona e gli admin.
      outsideAllowance={outsideAllowance(balance).filter((item) => item.label !== "Malattia")}
      canEdit={false}
    />
  );
}
