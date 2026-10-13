import "server-only";
import { prisma } from "@/lib/prisma";
import { tallyLeave } from "@/lib/leave-balance";

export type MonthlySummaryFigures = {
  // Ferie dei dipendenti e assenze delle partite IVA, chiusure comprese.
  ferieAssenzeDays: number;
  // Quanti dei giorni sopra vengono da chiusure aziendali.
  closureDays: number;
  permessoHours: number;
  malattiaDays: number;
  recuperoDays: number;
  recuperoHours: number;
  assenzaExtraDays: number;
};

export type MonthlySummaryRow = {
  user: { id: string; name: string; employmentType: string };
} & MonthlySummaryFigures;

const FIGURE_KEYS = [
  "ferieAssenzeDays",
  "closureDays",
  "permessoHours",
  "malattiaDays",
  "recuperoDays",
  "recuperoHours",
  "assenzaExtraDays",
] as const satisfies readonly (keyof MonthlySummaryFigures)[];

// Riepilogo di un mese per persona (pagina Richieste del team ed export CSV):
// solo richieste approvate e malattie registrate, con le stesse regole dei
// saldi (weekend e feste comandate esclusi, richieste a cavallo di due mesi
// spalmate, chiusure aziendali dentro ferie o assenze).
export async function buildMonthlySummary(month: Date) {
  const monthStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const monthEnd = new Date(month.getFullYear(), month.getMonth() + 1, 0, 23, 59, 59, 999);

  const requests = await prisma.leaveRequest.findMany({
    where: { startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
    select: { userId: true, type: true, status: true, startDate: true, endDate: true, hours: true },
  });
  // I membri attivi, più chi è stato disattivato ma ha assenze nel mese.
  const users = await prisma.user.findMany({
    where: { OR: [{ active: true }, { id: { in: [...new Set(requests.map((r) => r.userId))] } }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, employmentType: true },
  });
  const employmentTypeById = new Map(users.map((u) => [u.id, u.employmentType]));
  const employmentTypeOf = (userId: string) => employmentTypeById.get(userId);

  const rows: MonthlySummaryRow[] = users.map((user) => {
    const own = requests.filter((r) => r.userId === user.id);
    const tally = tallyLeave(own, monthStart, monthEnd, employmentTypeOf);
    const closures = tallyLeave(
      own.filter((r) => r.type === "chiusura"),
      monthStart,
      monthEnd,
      employmentTypeOf
    );
    // Nessun filtro per contratto: se c'è qualcosa (anche una richiesta di
    // prima di un cambio di contratto) si vede.
    return {
      user,
      ferieAssenzeDays: tally.ferieUsed + tally.assenzaDays,
      closureDays: closures.ferieUsed + closures.assenzaDays,
      permessoHours: tally.permessoUsed,
      malattiaDays: tally.malattiaDays,
      recuperoDays: tally.recuperoDays,
      recuperoHours: tally.recuperoHours,
      assenzaExtraDays: tally.assenzaExtraDays,
    };
  });

  const totals = Object.fromEntries(
    FIGURE_KEYS.map((key) => [
      key,
      Math.round(rows.reduce((sum, row) => sum + row[key], 0) * 100) / 100,
    ])
  ) as MonthlySummaryFigures;

  return { rows, totals };
}
