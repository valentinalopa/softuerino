import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export function RoleBadge({ role }: { role: string }) {
  const isSuperAdmin = role === "super_admin";
  return (
    <Badge
      variant={isSuperAdmin ? "default" : "secondary"}
      className={isSuperAdmin ? "bg-foreground text-background" : undefined}
    >
      {ROLE_LABELS[role as Role] ?? role}
    </Badge>
  );
}
