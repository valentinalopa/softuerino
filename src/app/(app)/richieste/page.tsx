import { Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { getLeaveBalance, remainingByLeaveType } from "@/lib/leave-balance";
import { getRecoveryCreditsForUsers, toOpenRecoveryCredits, type RecoveryCreditView } from "@/lib/recovery-credits";
import { formatAmount, formatToRecover } from "@/lib/leave-format";
import { formatWhen } from "@/lib/leave-format";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { LeaveRequestsTable, StatusBadge } from "@/components/richieste/LeaveRequestsTable";
import { NotificationCard, NotificationItem } from "@/components/richieste/NotificationCard";
import { LEAVE_TYPE_LABELS, annualAllowance, type EmploymentType } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";
import { isAdminRole } from "@/lib/constants";
import { peopleInScope } from "@/lib/permissions";
import { maskLeaveForViewer } from "@/lib/leave-privacy";
import { AllPendingView, TeamRequestsView, type TeamParams } from "@/components/richieste/TeamRequestsViews";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Richieste" };

type Range = "upcoming" | "past";
type Vista = "mie" | "da-approvare" | "team";
type Viewer = Awaited<ReturnType<typeof requireUser>>;

// Richieste: una sola pagina per tutte le richieste di assenza.
// - Le mie: saldi e richieste personali, uguale per tutti.
// - Da approvare: per chi può approvare (admin: tutte; responsabili: quelle
//   del reparto, secondo Ruoli e permessi).
// - Del team: admin e super admin, richieste decise, storico, riepilogo
//   mensile e chiusure aziendali.
export default async function RichiestePage({
  searchParams,
}: {
  searchParams: Promise<{ vista?: string; range?: string } & TeamParams>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const isAdmin = isAdminRole(user.role);
  // Admin: tutte (comprese le proprie); gli altri: le persone su cui hanno il
  // permesso "Approvare", mai sé stessi.
  const approveScope = isAdmin ? "all" : await peopleInScope(user, "approvare");
  const canApprove = approveScope === "all" || approveScope.length > 0;
  const pendingCount = canApprove
    ? await prisma.leaveRequest.count({
        where: {
          status: "pending",
          ...(isAdmin ? {} : { user: approveScope === "all" ? { id: { not: user.id } } : { id: { in: approveScope } } }),
        },
      })
    : 0;

  const vista: Vista =
    params.vista === "da-approvare" && canApprove ? "da-approvare" : params.vista === "team" && isAdmin ? "team" : "mie";

  const [balance, recoveryCredits] = await Promise.all([
    getLeaveBalance(user.id, user.employmentType as EmploymentType),
    getRecoveryCreditsForUsers([user.id]),
  ]);
  const ownCredits = recoveryCredits.get(user.id) ?? [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1>Richieste</h1>
          <p className="text-sm text-muted-foreground">
            {user.employmentType === "partita_iva"
              ? "Richieste di assenza, anche fuori monte."
              : "Richieste di ferie, permessi, recuperi e malattia."}
          </p>
        </div>
        {/* Richiesta per sé: quelle per conto di altri si registrano dalla
            scheda della persona in Persone. */}
        <NewLeaveRequestDialog
          employmentType={user.employmentType as EmploymentType}
          remaining={remainingByLeaveType(balance)}
          recoveryCredits={toOpenRecoveryCredits(ownCredits)}
        />
      </div>

      {(canApprove || isAdmin) && (
        <SegmentedLinkTabs
          items={[
            { key: "mie", label: "Le mie", href: "/richieste", active: vista === "mie" },
            ...(canApprove
              ? [
                  {
                    key: "da-approvare",
                    label: `Da approvare (${pendingCount})`,
                    href: "/richieste?vista=da-approvare",
                    active: vista === "da-approvare",
                  },
                ]
              : []),
            ...(isAdmin ? [{ key: "team", label: "Del team", href: "/richieste?vista=team", active: vista === "team" }] : []),
          ]}
        />
      )}

      {vista === "mie" && (
        <MyRequestsView
          user={user}
          range={params.range === "past" ? "past" : "upcoming"}
          balance={balance}
          ownCredits={ownCredits}
        />
      )}
      {vista === "da-approvare" &&
        (isAdmin ? (
          <AllPendingView canDelete={user.role === "super_admin"} />
        ) : (
          <ScopedPendingView user={user} scope={approveScope} />
        ))}
      {vista === "team" && <TeamRequestsView params={params} canDelete={user.role === "super_admin"} />}
    </div>
  );
}

// Da approvare per i responsabili: le richieste in attesa delle persone su
// cui hanno il permesso (la malattia resta riservata, maskLeaveForViewer).
async function ScopedPendingView({ user, scope }: { user: Viewer; scope: string[] | "all" }) {
  const pending = await prisma.leaveRequest.findMany({
    where: {
      status: "pending",
      user: scope === "all" ? { id: { not: user.id } } : { id: { in: scope } },
    },
    include: {
      user: { select: { name: true } },
      recoveryCredit: { select: { reason: true, amount: true, unit: true } },
    },
    orderBy: { startDate: "asc" },
  });
  return (
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
  );
}

// Le mie: saldi, richieste in attesa di risposta e richieste personali.
async function MyRequestsView({
  user,
  range,
  balance,
  ownCredits,
}: {
  user: Viewer;
  range: Range;
  balance: Awaited<ReturnType<typeof getLeaveBalance>>;
  ownCredits: RecoveryCreditView[];
}) {
  // endDate è salvato a mezzanotte dell'ultimo giorno (incluso): confrontare con
  // l'inizio di oggi, non con l'ora corrente, altrimenti una richiesta risulta
  // "conclusa" già dalle 00:01 del suo ultimo giorno.
  const today = startOfDay(new Date());
  const ownRequests = await prisma.leaveRequest.findMany({
    where: { userId: user.id },
    include: { recoveryCredit: { select: { reason: true, amount: true, unit: true } } },
    orderBy: { createdAt: "desc" },
  });
  const toRecover = formatToRecover(ownCredits);

  const ownPending = ownRequests.filter((request) => request.status === "pending");
  const ownUpcoming = ownRequests.filter((request) => request.endDate >= today);
  const ownPast = ownRequests.filter((request) => request.endDate < today);

  return (
    <>
      {ownPending.length > 0 && (
        <NotificationCard
          icon={Clock3}
          title={`Hai ${ownPending.length} richiest${ownPending.length === 1 ? "a" : "e"} in attesa di risposta`}
        >
          {ownPending.map((request) => (
            <NotificationItem key={request.id}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusBadge status="pending" />
                  <span>
                    {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}
                  </span>
                </div>
                {request.note && (
                  <p className="mt-1 text-xs text-muted-foreground">Nota: {request.note}</p>
                )}
              </div>
              <span className="text-muted-foreground">
                {formatWhen(request)}
              </span>
            </NotificationItem>
          ))}
        </NotificationCard>
      )}

      <div
        className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${toRecover ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}
      >
        {balance.kind === "assenze" ? (
          <BalanceCard
            label="Assenze rimanenti"
            negative={balance.assenzeRemaining < 0}
            value={`${formatAmount(balance.assenzeRemaining)} giorni`}
            detail={`su ${formatAmount(annualAllowance("assenze"))} l'anno`}
          />
        ) : (
          <>
            <BalanceCard
              label="Ferie rimanenti"
              negative={balance.ferieRemaining < 0}
              value={`${formatAmount(balance.ferieRemaining)} giorni`}
              detail={`su ${formatAmount(balance.ferieMatured)} maturate (${formatAmount(annualAllowance("ferie"))} l'anno)`}
            />
            <BalanceCard
              label="Permesso rimanente"
              negative={balance.permessoRemaining < 0}
              value={`${formatAmount(balance.permessoRemaining)} ore`}
              detail={`su ${formatAmount(annualAllowance("permesso"))} l'anno`}
            />
            <BalanceCard
              label="Malattia"
              value={`${formatAmount(balance.malattiaDaysRegistered)} giorni`}
              detail="quest'anno, nessun tetto"
            />
          </>
        )}
        {toRecover && (
          <BalanceCard
            label="Da recuperare"
            value={toRecover}
            detail={ownCredits
              .filter((credit) => credit.status !== "fatto")
              .map((credit) => credit.reason)
              .join(", ")}
          />
        )}
      </div>

      <div className="space-y-4">
        <h2>Le mie richieste</h2>
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
              canDelete={user.role === "super_admin"}
              emptyMessage={
                range === "upcoming" ? "Nessuna richiesta in programma. Per ferie, permessi o assenze usa «Nuova richiesta»." : "Nessuna richiesta conclusa."
              }
            />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function BalanceCard({
  label,
  value,
  detail,
  negative = false,
}: {
  label: string;
  value: string;
  detail?: string;
  negative?: boolean;
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className={`mt-1 text-lg font-semibold ${negative ? "text-destructive" : ""}`}>{value}</p>
        {negative && <p className="mt-0.5 text-xs font-medium text-destructive">In negativo</p>}
        {detail && <p className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</p>}
      </CardContent>
    </Card>
  );
}
