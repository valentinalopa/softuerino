import Link from "next/link";
import { Clock3, History, type LucideIcon } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { getLeaveBalance } from "@/lib/leave-balance";
import { formatRange } from "@/lib/leave-format";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { LeaveRequestsTable, StatusBadge } from "@/components/richieste/LeaveRequestsTable";
import { ApproveRejectActions } from "@/components/richieste/ApproveRejectActions";
import { LEAVE_TYPE_LABELS, type EmploymentType } from "@/lib/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

type Range = "upcoming" | "past";

export default async function RichiestePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  const isSuperAdmin = user.role === "super_admin";
  // endDate è salvato a mezzanotte dell'ultimo giorno (incluso): confrontare con
  // l'inizio di oggi, non con l'ora corrente, altrimenti una richiesta risulta
  // "conclusa" già dalle 00:01 del suo ultimo giorno.
  const today = startOfDay(new Date());

  const { range: rangeParam } = await searchParams;
  const range: Range = rangeParam === "past" ? "past" : "upcoming";

  const [balance, ownRequests, teamPending, teamCurrentRequests] =
    await Promise.all([
      getLeaveBalance(user.id, user.employmentType as EmploymentType),
      prisma.leaveRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
      }),
      isSuperAdmin
        ? prisma.leaveRequest.findMany({
            where: { userId: { not: user.id }, status: "pending" },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { startDate: "asc" },
          })
        : Promise.resolve([]),
      isSuperAdmin
        ? prisma.leaveRequest.findMany({
            where: { OR: [{ endDate: { gte: today } }, { status: "pending" }] },
            include: { user: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

  const ownPending = ownRequests.filter((request) => request.status === "pending");
  const ownUpcoming = ownRequests.filter((request) => request.endDate >= today);
  const ownPast = ownRequests.filter((request) => request.endDate < today);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Giorni off</h1>
          <p className="text-sm text-muted-foreground">
            {user.employmentType === "partita_iva"
              ? "Richieste di assenza."
              : "Richieste di ferie, permesso e malattia."}
          </p>
        </div>
        {/* Richiesta per sé: quelle per conto di altri si registrano dalla
            scheda membro in /team/[id]. */}
        <NewLeaveRequestDialog
          employmentType={user.employmentType as EmploymentType}
        />
      </div>

      {(ownPending.length > 0 || teamPending.length > 0) && (
        <div className="space-y-4">
          {ownPending.length > 0 && (
            <NotificationCard
              icon={Clock3}
              title={`Hai ${ownPending.length} richiest${ownPending.length === 1 ? "a" : "e"} in attesa di risposta`}
            >
              {ownPending.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/15 pb-2 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2">
                    <StatusBadge status="pending" />
                    <span>
                      {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatRange(request.startDate, request.endDate)}
                  </span>
                </li>
              ))}
            </NotificationCard>
          )}

          {isSuperAdmin && teamPending.length > 0 && (
            <NotificationCard
              icon={Clock3}
              title={`${teamPending.length} richiest${teamPending.length === 1 ? "a" : "e"} del team in attesa di approvazione`}
            >
              {teamPending.map((request) => (
                <li
                  key={request.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/15 pb-2 last:border-0 last:pb-0"
                >
                  <span>
                    <span className="font-medium">{request.user.name}</span>{" "}
                    <span className="text-muted-foreground">
                      ·{" "}
                      {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}{" "}
                      · {formatRange(request.startDate, request.endDate)}
                    </span>
                  </span>
                  <ApproveRejectActions requestId={request.id} />
                </li>
              ))}
            </NotificationCard>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {balance.kind === "assenze" ? (
          <BalanceCard
            label="Assenze rimanenti"
            value={`${balance.assenzeRemaining} / ${balance.assenzeAllowance} giorni`}
          />
        ) : (
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
        )}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Le mie richieste</h2>
        <SegmentedLinkTabs
          items={[
            {
              key: "upcoming",
              label: `Prossimi (${ownUpcoming.length})`,
              href: "/richieste",
              active: range === "upcoming",
            },
            {
              key: "past",
              label: `Conclusi (${ownPast.length})`,
              href: "/richieste?range=past",
              active: range === "past",
            },
          ]}
        />
        <Card>
          <CardContent>
            <LeaveRequestsTable
              requests={range === "upcoming" ? ownUpcoming : ownPast}
              emptyMessage={
                range === "upcoming" ? "Nessuna richiesta in programma." : "Nessuna richiesta conclusa."
              }
            />
          </CardContent>
        </Card>
      </div>

      {isSuperAdmin && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Richieste del team</h2>
            <Link href="/richieste/storico" className={buttonVariants({ variant: "outline", size: "sm" })}>
              <History />
              Storico richieste
            </Link>
          </div>
          <Card>
            <CardContent>
              <LeaveRequestsTable
                requests={teamCurrentRequests}
                showMember
                showActions
                emptyMessage="Nessuna richiesta ancora."
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function NotificationCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="bg-amber-500/8 ring-amber-500/25 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-amber-600 dark:text-amber-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">{children}</ul>
      </CardContent>
    </Card>
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
