import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { LEAVE_TYPE_LABELS } from "@/lib/constants";
import { formatRange } from "@/lib/leave-format";
import { ApproveRejectActions } from "@/components/richieste/ApproveRejectActions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Riquadro per ciò che attende un'azione (richieste in attesa): tono warning.
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
    <Card className="gap-3 border-warning/30 bg-warning-subtle">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-warning-soft-foreground" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">{children}</ul>
      </CardContent>
    </Card>
  );
}

// Riga della lista dentro NotificationCard, con separatore nel tono del riquadro.
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
        "flex flex-wrap items-center justify-between gap-3 border-b border-warning/20 pb-2 last:border-0 last:pb-0",
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
}: {
  request: {
    id: string;
    type: string;
    startDate: Date;
    endDate: Date;
    note: string | null;
    user: { name: string };
  };
}) {
  return (
    <NotificationItem>
      <div className="min-w-0">
        <p>
          <span className="font-medium text-foreground">{request.user.name}</span>{" "}
          <span className="text-muted-foreground">
            · {LEAVE_TYPE_LABELS[request.type as keyof typeof LEAVE_TYPE_LABELS] ?? request.type}{" "}
            · {formatRange(request.startDate, request.endDate)}
          </span>
        </p>
        {request.note && (
          <p className="mt-0.5 text-xs text-muted-foreground">Nota: {request.note}</p>
        )}
      </div>
      <ApproveRejectActions requestId={request.id} />
    </NotificationItem>
  );
}
