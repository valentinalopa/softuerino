import { Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { formatRange } from "@/lib/leave-format";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { ApproveRejectActions } from "@/components/richieste/ApproveRejectActions";
import { NotificationCard, NotificationItem } from "@/components/richieste/NotificationCard";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";

type View = "in_corso" | "storico";

// Gestione delle richieste di tutto il team (solo super admin): approvazioni,
// richieste in corso e storico. Le proprie richieste stanno in /richieste.
export default async function RichiesteTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const user = await requireSuperAdmin();
  // endDate è a mezzanotte dell'ultimo giorno incluso: "passata" solo da
  // domani in poi, non dalle 00:01 dell'ultimo giorno.
  const today = startOfDay(new Date());

  const { view: viewParam } = await searchParams;
  const view: View = viewParam === "storico" ? "storico" : "in_corso";

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
            <NotificationItem key={request.id}>
              <span>
                <span className="font-medium">{request.user.name}</span>{" "}
                <span className="text-muted-foreground">
                  ·{" "}
                  {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}{" "}
                  · {formatRange(request.startDate, request.endDate)}
                </span>
              </span>
              <ApproveRejectActions requestId={request.id} />
            </NotificationItem>
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
          ]}
        />
        <Card>
          <CardContent>
            <LeaveRequestsTable
              requests={view === "in_corso" ? currentRequests : pastRequests}
              showMember
              showActions
              emptyMessage={
                view === "in_corso" ? "Nessuna richiesta in corso." : "Nessuna richiesta passata."
              }
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
