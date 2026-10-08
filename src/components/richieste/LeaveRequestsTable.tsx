"use client";

import { useState } from "react";
import { LEAVE_TYPE_LABELS, LEAVE_STATUS_LABELS, type LeaveStatus } from "@/lib/constants";
import {
  formatDate,
  formatPeriod,
  formatDuration,
  formatRecoveryCredit,
  type LeaveRequestRow,
} from "@/lib/leave-format";
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
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const STATUS_TONES: Record<LeaveStatus, Tone> = {
  pending: "warning",
  approved: "success",
  rejected: "danger",
  registrata: "aqua",
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return <Badge variant={STATUS_TONES[status]}>{LEAVE_STATUS_LABELS[status]}</Badge>;
}

function typeLabel(type: string) {
  return LEAVE_TYPE_LABELS[type as keyof typeof LEAVE_TYPE_LABELS] ?? type;
}

// Stato della richiesta: in attesa → Approva/Rifiuta, altrimenti la si può
// riportare in attesa (solo admin, cioè dove showActions è attivo).
function RequestActions({ request }: { request: LeaveRequestRow }) {
  return request.status === "pending" ? (
    <ApproveRejectActions requestId={request.id} />
  ) : (
    <RevertToPendingAction requestId={request.id} />
  );
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
  // Si tiene l'id, non la riga: dopo un'azione la pagina si aggiorna e il
  // pannello mostra lo stato nuovo. Se la richiesta esce dalla lista (es. passa
  // nello storico) il pannello si chiude da solo.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = requests.find((request) => request.id === selectedId) ?? null;

  return (
    <>
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
            <TableRow
              key={request.id}
              tabIndex={0}
              aria-label={`Dettagli richiesta: ${typeLabel(request.type)}, ${formatPeriod(request)}`}
              className="cursor-pointer focus-visible:bg-subtle focus-visible:outline-none"
              onClick={() => setSelectedId(request.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedId(request.id);
                }
              }}
            >
              {showMember && (
                <TableCell className="font-medium">{request.user?.name ?? "—"}</TableCell>
              )}
              <TableCell>
                <span className="block">{typeLabel(request.type)}</span>
                {/* Il perché: il recupero da fare collegato, o la nota. */}
                {request.recoveryCredit && (
                  <span className="block max-w-56 truncate text-xs text-muted-foreground">
                    {formatRecoveryCredit(request.recoveryCredit)}
                  </span>
                )}
                {request.note && (
                  <span className="block max-w-56 truncate text-xs text-muted-foreground">
                    {request.note}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatPeriod(request)}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDuration(request)}</TableCell>
              <TableCell>
                <StatusBadge status={request.status as LeaveStatus} />
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(request.createdAt)}</TableCell>
              <TableCell
                className="text-right"
                // Le azioni hanno il loro comportamento: non devono aprire il pannello.
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {showActions && <RequestActions request={request} />}
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

      <Sheet
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedId(null);
        }}
      >
        <SheetContent>
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle>{typeLabel(selected.type)}</SheetTitle>
                <div>
                  <StatusBadge status={selected.status as LeaveStatus} />
                </div>
              </SheetHeader>
              <SheetBody>
                <dl className="divide-y divide-border-subtle text-sm">
                  {selected.user && <DetailRow label="Membro" value={selected.user.name} />}
                  <DetailRow label="Periodo" value={formatPeriod(selected)} />
                  <DetailRow label="Durata" value={formatDuration(selected)} />
                  {selected.recoveryCredit && (
                    <DetailRow
                      label="Recupero di"
                      value={formatRecoveryCredit(selected.recoveryCredit)}
                    />
                  )}
                  <DetailRow label="Inviata il" value={formatDate(selected.createdAt)} />
                  <div className="flex flex-col gap-1 py-3">
                    <dt className="text-muted-foreground">Nota</dt>
                    <dd className="whitespace-pre-wrap text-foreground">
                      {selected.note || <span className="text-muted-foreground">—</span>}
                    </dd>
                  </div>
                </dl>
              </SheetBody>
              {showActions && (
                <SheetFooter>
                  <RequestActions request={selected} />
                </SheetFooter>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{value}</dd>
    </div>
  );
}
