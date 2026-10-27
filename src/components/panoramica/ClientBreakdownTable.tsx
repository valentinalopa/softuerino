import { CornerDownRight } from "lucide-react";
import { formatHours } from "@/lib/ore-utils";
import type { ClientBreakdownRow } from "@/lib/panoramica-utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

// Totale per cliente (voci comprese) e, sotto, come si dividono le ore:
// dirette sul cliente e su ciascuna voce.
export function ClientBreakdownTable({ rows }: { rows: ClientBreakdownRow[] }) {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Nessuna ora loggata ancora.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Cliente</TableHead>
          <TableHead className="text-right">Ore</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.flatMap((row) => [
          <TableRow key={row.id}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-right font-medium tabular-nums">{formatHours(row.hours)}</TableCell>
          </TableRow>,
          ...row.parts.map((part) => (
            <TableRow key={`${row.id}-${part.id}`} className="text-muted-foreground">
              <TableCell>
                <span className="flex items-center gap-1.5 pl-4">
                  <CornerDownRight className="size-4 shrink-0" />
                  {part.id === row.id ? "Ore dirette" : part.name}
                </span>
              </TableCell>
              <TableCell className="text-right tabular-nums">{formatHours(part.hours)}</TableCell>
            </TableRow>
          )),
        ])}
      </TableBody>
    </Table>
  );
}
