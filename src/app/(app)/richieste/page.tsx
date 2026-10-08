import { Clock3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { getLeaveBalance, remainingByLeaveType } from "@/lib/leave-balance";
import { getRecoveryCreditsForUsers, toOpenRecoveryCredits } from "@/lib/recovery-credits";
import { formatAmount, formatToRecover } from "@/lib/leave-format";
import { formatWhen } from "@/lib/leave-format";
import { NewLeaveRequestDialog } from "@/components/NewLeaveRequestDialog";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { LeaveRequestsTable, StatusBadge } from "@/components/richieste/LeaveRequestsTable";
import { NotificationCard, NotificationItem } from "@/components/richieste/NotificationCard";
import { LEAVE_TYPE_LABELS, annualAllowance, type EmploymentType } from "@/lib/constants";
import { Card, CardContent } from "@/components/ui/card";

type Range = "upcoming" | "past";

export default async function RichiestePage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const user = await requireUser();
  // endDate è salvato a mezzanotte dell'ultimo giorno (incluso): confrontare con
  // l'inizio di oggi, non con l'ora corrente, altrimenti una richiesta risulta
  // "conclusa" già dalle 00:01 del suo ultimo giorno.
  const today = startOfDay(new Date());

  const { range: rangeParam } = await searchParams;
  const range: Range = rangeParam === "past" ? "past" : "upcoming";

  // Pagina personale, identica per tutti: le richieste del team (approvazioni,
  // storico) vivono in /richieste-team, sotto Amministrazione.
  const [balance, ownRequests, recoveryCredits] = await Promise.all([
    getLeaveBalance(user.id, user.employmentType as EmploymentType),
    prisma.leaveRequest.findMany({
      where: { userId: user.id },
      include: { recoveryCredit: { select: { reason: true, amount: true, unit: true } } },
      orderBy: { createdAt: "desc" },
    }),
    getRecoveryCreditsForUsers([user.id]),
  ]);
  const ownCredits = recoveryCredits.get(user.id) ?? [];
  const toRecover = formatToRecover(ownCredits);

  const ownPending = ownRequests.filter((request) => request.status === "pending");
  const ownUpcoming = ownRequests.filter((request) => request.endDate >= today);
  const ownPast = ownRequests.filter((request) => request.endDate < today);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Giorni off</h1>
          <p className="text-sm text-muted-foreground">
            {user.employmentType === "partita_iva"
              ? "Richieste di assenza, anche fuori monte."
              : "Richieste di ferie, permessi, recuperi e malattia."}
          </p>
        </div>
        {/* Richiesta per sé: quelle per conto di altri si registrano dalla
            scheda membro in /team/[id]. */}
        <NewLeaveRequestDialog
          employmentType={user.employmentType as EmploymentType}
          remaining={remainingByLeaveType(balance)}
          recoveryCredits={toOpenRecoveryCredits(ownCredits)}
        />
      </div>

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
            value={`${formatAmount(balance.assenzeRemaining)} / ${formatAmount(annualAllowance("assenze"))} giorni`}
          />
        ) : (
          <>
            <BalanceCard
              label="Ferie rimanenti"
              negative={balance.ferieRemaining < 0}
              value={`${formatAmount(balance.ferieRemaining)} / ${formatAmount(annualAllowance("ferie"))} giorni`}
            />
            <BalanceCard
              label="Permesso rimanente"
              negative={balance.permessoRemaining < 0}
              value={`${formatAmount(balance.permessoRemaining)} / ${formatAmount(annualAllowance("permesso"))} ore`}
            />
            <BalanceCard
              label="Malattia registrata"
              value={`${formatAmount(balance.malattiaDaysRegistered)} giorni (nessun tetto)`}
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
              emptyMessage={
                range === "upcoming" ? "Nessuna richiesta in programma." : "Nessuna richiesta conclusa."
              }
            />
          </CardContent>
        </Card>
      </div>

    </div>
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
