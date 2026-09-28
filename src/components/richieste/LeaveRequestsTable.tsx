import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, type LeaveStatus } from "@/lib/constants";
import { formatDate, formatRange, formatDuration, type LeaveRequestRow } from "@/lib/leave-format";
import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/tones";
import { ApproveRejectActions } from "@/components/richieste/ApproveRejectActions";
import { RevertToPendingAction } from "@/components/richieste/RevertToPendingAction";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const STATUS_TONES: Record<LeaveStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  registrata: "aqua",
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge variant={STATUS_TONES[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

export function LeaveRequestsTable({
  requests,
  showMember = false,
  showActions = false,
  emptyMessage = "Nessuna richiesta ancora.",
}: {
  requests: LeaveRequestRow[];
  showMember?: boolean;
  showActions?: boolean;
  emptyMessage?: string;
}) {
  const colSpan = showMember ? 7 : 6;

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {showMember && <TableHead>Membro</TableHead>}
          <TableHead>Tipo</TableHead>
          <TableHead>Quando</TableHead>
          <TableHead>Durata</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead>Inviata il</TableHead>
          <TableHead className="text-right">Azioni</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            {showMember && (
              <TableCell className="font-medium">{request.user?.name ?? "—"}</TableCell>
            )}
            <TableCell>
              {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatRange(request.startDate, request.endDate)}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDuration(request)}</TableCell>
            <TableCell>
              <StatusBadge status={request.status as LeaveStatus} />
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(request.createdAt)}</TableCell>
            <TableCell className="text-right">
              {showActions &&
                (request.status === "pending" ? (
                  <ApproveRejectActions requestId={request.id} />
                ) : (
                  <RevertToPendingAction requestId={request.id} />
                ))}
            </TableCell>
          </TableRow>
        ))}
        {requests.length === 0 && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-muted-foreground">
              {emptyMessage}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
