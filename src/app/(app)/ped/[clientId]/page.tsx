import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/session";
import { addMonths, endOfMonth, formatMonthYear, startOfMonth } from "@/lib/calendar-utils";
import { monthQuery, parseMonthParam } from "@/lib/attendance-utils";
import { clientHasPed } from "@/lib/constants";
import { toPedEntry } from "@/lib/ped-utils";
import { PedCalendar } from "@/components/ped/PedCalendar";
import { ActiveBadge } from "@/components/ActiveBadge";
import { buttonVariants } from "@/components/ui/button";

export default async function PedClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<{ month?: string }>;
}) {
  await requireUser();
  const { clientId } = await params;
  const { month: monthParam } = await searchParams;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, active: true, categories: true },
  });
  // Il PED esiste solo per i clienti "comunicazione".
  if (!client || !clientHasPed(client.categories)) {
    notFound();
  }

  const current = parseMonthParam(monthParam);
  const monthStart = startOfMonth(current);
  const monthEnd = endOfMonth(current);

  const [contents, members] = await Promise.all([
    prisma.pedContent.findMany({
      where: {
        clientId: client.id,
        date: { gte: monthStart, lte: monthEnd },
      },
      include: { client: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    prisma.user.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const basePath = `/ped/${client.id}`;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {/* Il link "torna a" sta sempre in alto a sinistra, sopra il titolo. */}
        <Link href="/ped" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <ArrowLeft />
          Tutti i PED
        </Link>
        <div>
          <div className="flex items-center gap-2">
            <h1>PED · {client.name}</h1>
            <ActiveBadge active={client.active} />
          </div>
          <p className="text-sm text-muted-foreground">
            Piano editoriale del cliente: clicca un giorno per aggiungere un
            contenuto, un box per modificarlo.
          </p>
        </div>
      </div>

      <PedCalendar
        current={current}
        entries={contents.map(toPedEntry)}
        members={members}
        clients={[{ id: client.id, name: client.name }]}
        fixedClientId={client.id}
        todayHref={basePath}
        prevHref={`${basePath}?month=${monthQuery(addMonths(current, -1))}`}
        nextHref={`${basePath}?month=${monthQuery(addMonths(current, 1))}`}
        monthLabel={formatMonthYear(current)}
      />
    </div>
  );
}
