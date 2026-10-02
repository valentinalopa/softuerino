import { Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { NotificationCard, TeamPendingItem } from "@/components/richieste/NotificationCard";
import { Card, CardContent } from "@/components/ui/card";
import {
  LeaveBalancesEditor,
  type BalanceRow,
} from "@/components/richieste/LeaveBalancesEditor";
import { getLeaveBalancesForUsers } from "@/lib/leave-balance";
import { getRecoveryCreditsForUsers } from "@/lib/recovery-credits";
import type { EmploymentType } from "@/lib/constants";

type View = "in_corso" | "storico" | "saldi";

// Gestione delle richieste di tutto il team (admin e super admin): approvazioni,
// richieste in corso e storico. Le proprie richieste stanno in /richieste.
export default async function RichiesteTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireAdmin();
  // endDate è a mezzanotte dell'ultimo giorno incluso: "passata" solo da
  // domani in poi, non dalle 00:01 dell'ultimo giorno.
  const today = startOfDay(new Date());

  const { view: viewParam } = await searchParams;
  // I saldi si modificano solo da super admin.
  const canEditBalances = user.role === "super_admin";
  const view: View =
    viewParam === "storico"
      ? "storico"
      : viewParam === "saldi" && canEditBalances
        ? "saldi"
        : "in_corso";

  const include = { user: { select: { id: true, name: true } } } as const;
  const [teamPending, currentRequests, pastRequests] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: { userId: { not: user.id }, status: "pending" },
      include,
      orderBy: { startDate: "asc" },
    }),
    prisma.leaveRequest.findMany({
      where: { OR: [{ endDate: { gte: today } }, { status: "pending" }] },
      include,
      orderBy: { createdAt: "desc" },
    }),
    prisma.leaveRequest.findMany({
      where: { endDate: { lt: today }, status: { not: "pending" } },
      include,
      orderBy: [{ user: { name: "asc" } }, { startDate: "desc" }],
    }),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1>Richieste del team</h1>
        <p className="text-sm text-muted-foreground">
          Approvazioni, richieste in corso e storico di tutto il team.
        </p>
      </div>

      {teamPending.length > 0 && (
        <NotificationCard
          icon={Clock3}
          title={`${teamPending.length} richiest${teamPending.length === 1 ? "a" : "e"} in attesa di approvazione`}
        >
          {teamPending.map((request) => (
            <TeamPendingItem key={request.id} request={request} />
          ))}
        </NotificationCard>
      )}

      <div className="space-y-4">
        <SegmentedLinkTabs
          items={[
            {
              key: "in_corso",
              label: `In corso (${currentRequests.length})`,
              href: "/richieste-team",
              active: view === "in_corso",
            },
            {
              key: "storico",
              label: `Storico (${pastRequests.length})`,
              href: "/richieste-team?view=storico",
              active: view === "storico",
            },
            ...(canEditBalances
              ? [
                  {
                    key: "saldi",
                    label: "Saldi",
                    href: "/richieste-team?view=saldi",
                    active: view === "saldi",
                  },
                ]
              : []),
          ]}
        />
        {view === "saldi" && (
          <p className="text-sm text-muted-foreground">
            Clicca un membro per aggiornarne il saldo. Per i dipendenti il residuo passa
            all&apos;anno dopo, per le partite IVA il monte riparte da capo a gennaio.
          </p>
        )}
        <Card>
          <CardContent>
            {view === "saldi" ? (
              <LeaveBalancesEditor rows={await loadBalanceRows(today.getFullYear())} year={today.getFullYear()} />
            ) : (
              <LeaveRequestsTable
                requests={view === "in_corso" ? currentRequests : pastRequests}
                showMember
                showActions
                emptyMessage={
                  view === "in_corso" ? "Nessuna richiesta in corso." : "Nessuna richiesta passata."
                }
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Saldi residui dell'anno corrente dei membri attivi, per la tabella dei saldi.
async function loadBalanceRows(year: number): Promise<BalanceRow[]> {
  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      employmentType: true,
      balanceAdjustments: {
        where: { year },
        select: { updatedAt: true },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
    },
    orderBy: { name: "asc" },
  });
  const [balances, recoveryCredits] = await Promise.all([
    getLeaveBalancesForUsers(
      users.map((u) => ({ id: u.id, employmentType: u.employmentType as EmploymentType })),
      year
    ),
    getRecoveryCreditsForUsers(users.filter((u) => u.employmentType === "dipendente").map((u) => u.id)),
  ]);
  return users.map((u) => {
    const b = balances.get(u.id)!;
    return {
      userId: u.id,
      name: u.name,
      employmentType: u.employmentType as EmploymentType,
      balances:
        b.kind === "assenze"
          ? {
              assenze: { remaining: b.assenzeRemaining, allowance: b.assenzeAllowance, used: b.assenzeUsed },
            }
          : {
              ferie: { remaining: b.ferieRemaining, allowance: b.ferieAllowance, used: b.ferieUsed },
              permesso: {
                remaining: b.permessoRemaining,
                allowance: b.permessoAllowance,
                used: b.permessoUsed,
              },
            },
      updatedAt: u.balanceAdjustments[0]?.updatedAt ?? null,
      outsideAllowance:
        b.kind === "assenze"
          ? [{ label: "Assenze extra", value: b.assenzaExtraDays, unit: "gg" }]
          : [
              { label: "Recuperi goduti", value: b.recuperoDays, unit: "gg" },
              { label: "Recuperi goduti (ore)", value: b.recuperoHours, unit: "h" },
              { label: "Malattia", value: b.malattiaDaysRegistered, unit: "gg" },
            ],
      recoveryCredits: recoveryCredits.get(u.id) ?? null,
    };
  });
}
