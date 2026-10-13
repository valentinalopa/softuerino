import type { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/session";
import { monthQuery, parseMonthParam } from "@/lib/attendance-utils";
import { EMPLOYMENT_TYPE_LABELS, type EmploymentType } from "@/lib/constants";
import { formatAmount } from "@/lib/leave-format";
import { buildMonthlySummary, type MonthlySummaryFigures } from "@/lib/monthly-summary";

// Riepilogo mensile in CSV (per il consulente del lavoro), ?month=yyyy-MM.
// Separatore ";" e virgola decimale, con BOM: Excel in italiano lo apre
// direttamente a colonne, accenti compresi.
export async function GET(request: NextRequest) {
  await requireAdmin();
  const month = parseMonthParam(request.nextUrl.searchParams.get("month") ?? undefined);
  const { rows, totals } = await buildMonthlySummary(month);

  const figures = (row: MonthlySummaryFigures) => [
    formatAmount(row.ferieAssenzeDays),
    formatAmount(row.closureDays),
    formatAmount(row.permessoHours),
    formatAmount(row.malattiaDays),
    formatAmount(row.recuperoDays),
    formatAmount(row.recuperoHours),
    formatAmount(row.assenzaExtraDays),
  ];
  const lines = [
    [
      "Membro",
      "Contratto",
      "Ferie / Assenze (gg)",
      "di cui chiusura (gg)",
      "Permessi (h)",
      "Malattia (gg)",
      "Recuperi (gg)",
      "Recuperi (h)",
      "Assenze extra (gg)",
    ],
    ...rows.map((row) => [
      row.user.name,
      EMPLOYMENT_TYPE_LABELS[row.user.employmentType as EmploymentType] ?? row.user.employmentType,
      ...figures(row),
    ]),
    ["Totale team", "", ...figures(totals)],
  ];
  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const csv = "﻿" + lines.map((line) => line.map(escape).join(";")).join("\r\n") + "\r\n";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="riepilogo-assenze-${monthQuery(month)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
