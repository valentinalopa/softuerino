import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatHours, monthLabel, type MonthlySummaryRow } from "@/lib/ore-utils";

export function MonthlySummaryTable({ rows }: { rows: MonthlySummaryRow[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Anno</TableHead>
          <TableHead>Mese</TableHead>
          <TableHead>Ore loggate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={`${row.year}-${row.month}`}>
            <TableCell className="font-medium">{row.year}</TableCell>
            <TableCell className="capitalize">{monthLabel(row.month)}</TableCell>
            <TableCell>{formatHours(row.hours)}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={3} className="text-center text-muted-foreground">
              Nessuna ora registrata.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
