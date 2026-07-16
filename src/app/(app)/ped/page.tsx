import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { addMonths, endOfMonth, formatMonthYear, startOfMonth } from "@/lib/calendar-utils";
import { monthQuery, parseMonthParam } from "@/lib/attendance-utils";
import { toPedEntry } from "@/lib/ped-utils";
import { PedCalendar } from "@/components/ped/PedCalendar";
import { PedStatusBoard } from "@/components/ped/PedStatusBoard";
import { SegmentedLinkTabs } from "@/components/SegmentedLinkTabs";

type PedView = "calendario" | "stati";

// PED "supremo": tutti i contenuti di tutti i clienti. I PED dei singoli
// clienti sono le sottovoci del gruppo PED in sidebar.
export default async function PedPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  await requireUser();
  const { month: monthParam, view: viewParam } = await searchParams;
  // "Per stato" è la vista di default: risponde a "cosa manca da preparare?".
  const view: PedView = viewParam === "calendario" ? "calendario" : "stati";

  const current = parseMonthParam(monthParam);
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);

  const [contents, clients, members] = await Promise.all([
    prisma.pedContent.findMany({
      where: { date: { gte: monthStart, lte: monthEnd } },
      include: { client: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    // Solo i clienti "comunicazione": gli altri non hanno un piano editoriale.
    // (contains sul CSV è sicuro: nessuna categoria è sottostringa di un'altra)
    prisma.client.findMany({
      where: { active: true, categories: { contains: "comunicazione" } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const entries = contents.map(toPedEntry);

  const pedHref = (v: PedView, month?: string) => {
    const params = new URLSearchParams();
    if (v !== "stati") params.set("view", v);
    if (month) params.set("month", month);
    const qs = params.toString();
    return qs ? `/ped?${qs}` : "/ped";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">PED</h1>
          <p className="text-sm text-muted-foreground">
            Tutti i contenuti in programma; i PED dei singoli clienti sono in
            sidebar.
          </p>
        </div>
        <SegmentedLinkTabs
          items={[
            {
              key: "stati",
              label: "Per stato",
              href: pedHref("stati", monthParam),
              active: view === "stati",
            },
            {
              key: "calendario",
              label: "Calendario",
              href: pedHref("calendario", monthParam),
              active: view === "calendario",
            },
          ]}
        />
      </div>

      {view === "calendario" ? (
        <PedCalendar
          current={current}
          entries={entries}
          members={members}
          clients={clients}
          showClient
          todayHref={pedHref(view)}
          prevHref={pedHref(view, monthQuery(addMonths(current, -1)))}
          nextHref={pedHref(view, monthQuery(addMonths(current, 1)))}
          monthLabel={formatMonthYear(current)}
        />
      ) : (
        <PedStatusBoard
          entries={entries}
          members={members}
          clients={clients}
          showClient
          todayHref={pedHref(view)}
          prevHref={pedHref(view, monthQuery(addMonths(current, -1)))}
          nextHref={pedHref(view, monthQuery(addMonths(current, 1)))}
          monthLabel={formatMonthYear(current)}
        />
      )}
    </div>
  );
}
