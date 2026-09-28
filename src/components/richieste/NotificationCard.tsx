import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
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
    <Card className="border-warning/25 bg-warning-soft">
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
