import { Clock3, Download } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/session";
import { addMonths, formatMonthYear, startOfDay } from "@/lib/calendar-utils";
import { monthQuery, parseMonthParam } from "@/lib/attendance-utils";
import { EMPLOYMENT_TYPE_LABELS, LEAVE_TYPES, LEAVE_TYPE_LABELS, type EmploymentType } from "@/lib/constants";
import { getPendingOverdrafts } from "@/lib/leave-balance";
import { buildMonthlySummary, type MonthlySummaryFigures } from "@/lib/monthly-summary";
import { formatAmount } from "@/lib/leave-format";
import { MonthNav } from "@/components/presenze/MonthNav";
import { buttonVariants } from "@/components/ui/button";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";
import { UrlSelectFilters } from "@/components/UrlSelectFilters";
import { LeaveRequestsTable } from "@/components/richieste/LeaveRequestsTable";
import { NotificationCard, TeamPendingItem } from "@/components/richieste/NotificationCard";
import {
  CompanyClosuresTable,
  NewCompanyClosureDialog,
} from "@/components/richieste/CompanyClosures";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type View = "da_approvare" | "in_programma" | "storico" | "mensile" | "chiusure";

// Richieste del team (admin e super admin): il flusso di lavoro sulle
// richieste. Da approvare, assenze in programma, storico filtrabile,
// riepilogo mensile per persona e chiusure aziendali. I saldi
// e tutto ciò che riguarda una persona stanno nella sua scheda in /team.
export default async function RichiesteTeamPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    user?: string;
    type?: string;
    year?: string;
    month?: string;
  }>;
}) {
  const user = await requireAdmin();
  // Eliminare una richiesta: solo super admin.
  const canDelete = user.role === "super_admin";
  // endDate è a mezzanotte dell'ultimo giorno incluso: "passata" solo da
  // domani in poi, non dalle 00:01 dell'ultimo giorno.
  const today = startOfDay(new Date());

  const params = await searchParams;
  const view: View =
    params.view === "in_programma" ||
    params.view === "storico" ||
    params.view === "mensile" ||
    params.view === "chiusure"
      ? params.view
      : "da_approvare";

  // Da approvare: tutte le richieste in attesa, comprese quelle di chi
  // guarda (un admin può decidere anche le proprie).
  const pendingWhere: Prisma.LeaveRequestWhereInput = { status: "pending" };
  // In programma: richieste già decise (approvate, rifiutate, malattie
  // registrate) non ancora concluse. Quelle aperte stanno in Da approvare.
  // Le chiusure aziendali (una riga per membro) hanno la loro scheda.
  const upcomingWhere: Prisma.LeaveRequestWhereInput = {
    endDate: { gte: today },
    status: { not: "pending" },
    type: { not: "chiusura" },
  };
  // Storico: richieste decise e concluse.
  const historyWhere: Prisma.LeaveRequestWhereInput = {
    endDate: { lt: today },
    status: { not: "pending" },
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
          Approvazioni, richieste in programma, storico e riepilogo mensile. Saldi e recuperi di una persona sono nella
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
            {
              key: "mensile",
              label: "Riepilogo mensile",
              href: viewHref("mensile"),
              active: view === "mensile",
            },
            {
              key: "chiusure",
              label: "Chiusure aziendali",
              href: viewHref("chiusure"),
              active: view === "chiusure",
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

        {view === "mensile" && <MonthlySummaryView month={params.month} />}

        {view === "chiusure" && <ClosuresView />}
      </div>
    </div>
  );
}

// Riepilogo mensile per persona, con i totali del team e l'export CSV.
async function MonthlySummaryView({ month }: { month?: string }) {
  const current = parseMonthParam(month);
  const { rows, totals } = await buildMonthlySummary(current);

  const monthHref = (date: Date) => `/richieste-team?view=mensile&month=${monthQuery(date)}`;
  // Celle vuote invece di tanti zeri: si vede subito chi è stato assente.
  const cell = (value: number, unit: string) => (value > 0 ? `${formatAmount(value)} ${unit}` : "—");
  const figureCells = (figures: MonthlySummaryFigures) => {
    const recuperi = [cell(figures.recuperoDays, "gg"), cell(figures.recuperoHours, "h")].filter(
      (part) => part !== "—"
    );
    return (
      <>
        <TableCell>{cell(figures.ferieAssenzeDays, "gg")}</TableCell>
        <TableCell className="text-muted-foreground">{cell(figures.closureDays, "gg")}</TableCell>
        <TableCell>{cell(figures.permessoHours, "h")}</TableCell>
        <TableCell>{cell(figures.malattiaDays, "gg")}</TableCell>
        <TableCell>{recuperi.length > 0 ? recuperi.join(" · ") : "—"}</TableCell>
        <TableCell>{cell(figures.assenzaExtraDays, "gg")}</TableCell>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <MonthNav
          todayHref="/richieste-team?view=mensile"
          prevHref={monthHref(addMonths(current, -1))}
          nextHref={monthHref(addMonths(current, 1))}
          monthLabel={formatMonthYear(current)}
        />
        <a
          href={`/api/riepilogo-mensile?month=${monthQuery(current)}`}
          download
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          <Download />
          Esporta CSV
        </a>
      </div>
      <p className="text-sm text-muted-foreground">
        Solo richieste approvate e malattie registrate. Weekend e feste comandate esclusi.
      </p>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Membro</TableHead>
                <TableHead>Ferie / Assenze</TableHead>
                <TableHead>di cui chiusura</TableHead>
                <TableHead>Permessi</TableHead>
                <TableHead>Malattia</TableHead>
                <TableHead>Recuperi</TableHead>
                <TableHead>Assenze extra</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.user.id}>
                  <TableCell>
                    <div className="font-medium">{row.user.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {EMPLOYMENT_TYPE_LABELS[row.user.employmentType as EmploymentType] ??
                        row.user.employmentType}
                    </div>
                  </TableCell>
                  {figureCells(row)}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-medium">Totale team</TableCell>
                {figureCells(totals)}
              </TableRow>
            </TableFooter>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

async function ClosuresView() {
  const closures = await prisma.companyClosure.findMany({ orderBy: { startDate: "desc" } });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          Valgono per tutto il team: scalano le ferie dei dipendenti e le assenze delle partite
          IVA. Sabati, domeniche e feste comandate non si scalano.
        </p>
        <NewCompanyClosureDialog />
      </div>
      <Card>
        <CardContent>
          <CompanyClosuresTable closures={closures} />
        </CardContent>
      </Card>
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
          // Le chiusure (una riga per membro) solo filtrando per tipo o persona.
          type ? { type } : params.user ? {} : { type: { not: "chiusura" } },
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
