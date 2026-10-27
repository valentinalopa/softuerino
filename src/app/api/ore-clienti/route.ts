import { requireAdmin } from "@/lib/auth/session";
import { loadClientHoursEntries } from "@/lib/client-hours";
import { formatAmount } from "@/lib/leave-format";
import { buildClientBreakdown } from "@/lib/panoramica-utils";

// Come la tabella di Panoramica: ultimi 12 mesi.
const MONTHS_BACK = 12;

// Ore per cliente in CSV, mese per mese: una riga di totale per cliente (voci
// comprese) e, sotto, la ripartizione tra ore dirette e voci. Stesso formato
// di /api/riepilogo-mensile (";", virgola decimale, BOM per Excel).
export async function GET() {
  await requireAdmin();
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - (MONTHS_BACK - 1), 1);
  const { months, rows } = buildClientBreakdown(await loadClientHoursEntries(from), MONTHS_BACK);

  const figures = (part: { hours: number; months: number[] }) => [
    ...part.months.map(formatAmount),
    formatAmount(part.hours),
  ];
  const lines = [
    ["Cliente", "Voce", ...months, "Totale (h)"],
    ...rows.flatMap((row) => [
      [row.name, "Totale", ...figures(row)],
      ...row.parts.map((part) => [row.name, part.id === row.id ? "Ore dirette" : part.name, ...figures(part)]),
    ]),
  ];
  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const csv = "﻿" + lines.map((line) => line.map(escape).join(";")).join("\r\n") + "\r\n";

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="ore-per-cliente.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
