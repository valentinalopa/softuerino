import { TriangleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { formatRecoveryCredit, formatWhen, type RecoveryCreditRef } from "@/lib/leave-format";
import { ApproveRejectActions } from "@/components/richieste/ApproveRejectActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Riquadro per ciò che attende un'azione (richieste in attesa): card bianca
// con un accento warning a sinistra e sull'icona. Fondo neutro, così i
// pulsanti tenui (Approva / Rifiuta) mantengono il contrasto.
export function NotificationCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card size="sm" className="gap-3 border-l-4 border-l-warning">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-warning-soft text-warning-soft-foreground">
            <Icon className="size-4" />
          </span>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border-subtle text-sm">{children}</ul>
      </CardContent>
    </Card>
  );
}

// Riga della lista dentro NotificationCard: separatore sottile tra le righe.
export function NotificationItem({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <li
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5 first:pt-0 last:pb-0",
        className
      )}
    >
      {children}
    </li>
  );
}

// Richiesta di un membro in attesa di approvazione (Panoramica, Richieste del
// team): chi, cosa, quando, la nota se c'è, e i pulsanti per decidere.
export function TeamPendingItem({
  request,
  overdraft,
}: {
  // Avviso se l'approvazione manda il saldo in negativo (getPendingOverdrafts).
  overdraft?: string;
  request: {
    id: string;
    type: string;
    startDate: Date;
    endDate: Date;
    hours: number | null;
    startTime?: string | null;
    endTime?: string | null;
    note: string | null;
    user: { name: string };
    recoveryCredit?: RecoveryCreditRef | null;
  };
}) {
  return (
    <NotificationItem>
      <div className="min-w-0">
        <p>
          <span className="font-medium text-foreground">{request.user.name}</span>{" "}
          <span className="text-muted-foreground">
            · {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}{" "}
            · {formatWhen(request)}
          </span>
        </p>
        {request.recoveryCredit && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Recupero di: {formatRecoveryCredit(request.recoveryCredit)}
          </p>
        )}
        {request.note && (
          <p className="mt-0.5 text-xs text-muted-foreground">Nota: {request.note}</p>
        )}
        {overdraft && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-danger-soft-foreground">
            <TriangleAlert className="size-3.5 shrink-0" />
            {overdraft}
          </p>
        )}
      </div>
      <ApproveRejectActions requestId={request.id} />
    </NotificationItem>
  );
}
