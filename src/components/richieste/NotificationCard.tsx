import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// Riquadro ambra per ciò che attende un'azione (richieste in attesa).
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
    <Card className="bg-amber-500/8 ring-amber-500/25 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-amber-600 dark:text-amber-400" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2 text-sm">{children}</ul>
      </CardContent>
    </Card>
  );
}
