import { Clock3 } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { startOfDay } from "@/lib/calendar-utils";
import { LEAVE_TYPES, LEAVE_TYPE_LABELS } from "@/lib/constants";
import { getPendingOverdrafts } from "@/lib/leave-balance";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { UrlSelectFilters } from "@/components/UrlSelectFilters";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { NotificationCard, TeamPendingItem } from "@/components/richieste/NotificationCard";
import { Card, CardContent } from "@/components/ui/card";

type View = "da_approvare" | "in_programma" | "storico";

// Richieste del team (admin e super admin): il flusso di lavoro sulle
// richieste. Da approvare, assenze in programma e storico filtrabile. I saldi
// e tutto ciò che riguarda una persona stanno nella sua scheda in /team.
export default async function RichiesteTeamPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; user?: string; type?: string; year?: string }>;
}) {
  const user = await requireAdmin();
  // Eliminare una richiesta: solo super admin.
  const canDelete = user.role === "super_admin";
  // endDate è a mezzanotte dell'ultimo giorno incluso: "passata" solo da
  // domani in poi, non dalle 00:01 dell'ultimo giorno.
  const today = startOfDay(new Date());

  const params = await searchParams;
  const view: View =
    params.view === "in_programma" || params.view === "storico" ? params.view : "da_approvare";

  // Da approvare: le richieste degli altri (le proprie le decide un altro admin).
  const pendingWhere: Prisma.LeaveRequestWhereInput = {
    userId: { not: user.id },
    status: "pending",
  };
  // In programma: assenze non ancora concluse e non rifiutate; le proprie in
  // attesa stanno qui, dato che non compaiono tra quelle da approvare.
  const upcomingWhere: Prisma.LeaveRequestWhereInput = {
    endDate: { gte: today },
    OR: [{ status: { in: ["approved", "registrata"] } }, { status: "pending", userId: user.id }],
  };
  // Storico: concluse, più le rifiutate (anche future).
  const historyWhere: Prisma.LeaveRequestWhereInput = {
    status: { not: "pending" },
    OR: [{ endDate: { lt: today } }, { status: "rejected" }],
  };

  const include = {
    user: { select: { id: true, name: true, employmentType: true } },
    recoveryCredit: { select: { reason: true, amount: true, unit: true } },
  } as const;

  const [pendingCount, upcomingCount] = await Promise.all([
    prisma.leaveRequest.count({ where: pendingWhere }),
    prisma.leaveRequest.count({ where: upcomingWhere }),
  ]);

  const viewHref = (v: View) =>
    v === "da_approvare" ? "/richieste-team" : `/richieste-team?view=${v}`;

  return (
    <div className="space-y-8">
      <div>
        <h1>Richieste del team</h1>
        <p className="text-sm text-muted-foreground">
          Approvazioni, assenze in programma e storico. Saldi e recuperi di una persona sono nella
          sua scheda in Team.
        </p>
      </div>

      <div className="space-y-4">
        <SegmentedLinkTabs
          items={[
            {
              key: "da_approvare",
              label: `Da approvare (${pendingCount})`,
              href: viewHref("da_approvare"),
              active: view === "da_approvare",
            },
            {
              key: "in_programma",
              label: `In programma (${upcomingCount})`,
              href: viewHref("in_programma"),
              active: view === "in_programma",
            },
            {
              key: "storico",
              label: "Storico",
              href: viewHref("storico"),
              active: view === "storico",
            },
          ]}
        />

        {view === "da_approvare" && (
          <PendingView where={pendingWhere} include={include} canDelete={canDelete} />
        )}

        {view === "in_programma" && (
          <Card>
            <CardContent>
              <LeaveRequestsTable
                requests={await prisma.leaveRequest.findMany({
                  where: upcomingWhere,
                  include,
                  orderBy: { startDate: "asc" },
                })}
                showMember
                showActions
                canDelete={canDelete}
                emptyMessage="Nessuna assenza in programma."
              />
            </CardContent>
          </Card>
        )}

        {view === "storico" && (
          <HistoryView
            where={historyWhere}
            include={include}
            params={params}
            canDelete={canDelete}
          />
        )}
      </div>
    </div>
  );
}

type Include = {
  user: { select: { id: true; name: true; employmentType: true } };
  recoveryCredit: { select: { reason: true; amount: true; unit: true } };
};

async function PendingView({
  where,
  include,
  canDelete,
}: {
  where: Prisma.LeaveRequestWhereInput;
  include: Include;
  canDelete: boolean;
}) {
  const pending = await prisma.leaveRequest.findMany({
    where,
    include,
    orderBy: { startDate: "asc" },
  });
  if (pending.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Nessuna richiesta da approvare.
          </p>
        </CardContent>
      </Card>
    );
  }
  const overdrafts = await getPendingOverdrafts(pending);
  return (
    <NotificationCard
      icon={Clock3}
      title={`${pending.length} richiest${pending.length === 1 ? "a" : "e"} in attesa di approvazione`}
    >
      {pending.map((request) => (
        <TeamPendingItem
          key={request.id}
          request={request}
          overdraft={overdrafts.get(request.id)}
          canDelete={canDelete}
        />
      ))}
    </NotificationCard>
  );
}

async function HistoryView({
  where,
  include,
  params,
  canDelete,
}: {
  where: Prisma.LeaveRequestWhereInput;
  include: Include;
  params: { user?: string; type?: string; year?: string };
  canDelete: boolean;
}) {
  const year = params.year && /^\d{4}$/.test(params.year) ? Number(params.year) : null;
  const type = LEAVE_TYPES.includes(params.type as (typeof LEAVE_TYPES)[number])
    ? params.type
    : null;

  const [requests, users, oldest] = await Promise.all([
    prisma.leaveRequest.findMany({
      where: {
        AND: [
          where,
          params.user ? { userId: params.user } : {},
          type ? { type } : {},
          // Una richiesta appartiene all'anno in cui inizia.
          year ? { startDate: { gte: new Date(year, 0, 1), lt: new Date(year + 1, 0, 1) } } : {},
        ],
      },
      include,
      orderBy: { startDate: "desc" },
    }),
    // Anche i membri disattivati: lo storico resta consultabile.
    prisma.user.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.leaveRequest.findFirst({ orderBy: { startDate: "asc" }, select: { startDate: true } }),
  ]);

  const currentYear = new Date().getFullYear();
  const firstYear = Math.min(oldest?.startDate.getFullYear() ?? currentYear, currentYear);
  const years = Array.from({ length: currentYear - firstYear + 1 }, (_, i) => currentYear - i);
  const filtered = Boolean(params.user || type || year);

  return (
    <div className="space-y-4">
      <UrlSelectFilters
        filters={[
          {
            param: "user",
            allLabel: "Tutte le persone",
            options: users.map((u) => ({ value: u.id, label: u.name })),
          },
          {
            param: "type",
            allLabel: "Tutti i tipi",
            options: LEAVE_TYPES.map((t) => ({ value: t, label: LEAVE_TYPE_LABELS[t] })),
          },
          {
            param: "year",
            allLabel: "Tutti gli anni",
            options: years.map((y) => ({ value: String(y), label: String(y) })),
          },
        ]}
      />
      <Card>
        <CardContent>
          <LeaveRequestsTable
            requests={requests}
            showMember
            showActions
            canDelete={canDelete}
            emptyMessage={
              filtered
                ? "Nessuna richiesta corrisponde ai filtri selezionati."
                : "Nessuna richiesta passata."
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
