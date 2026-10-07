import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/constants";

export function RoleBadge({ role }: { role: string }) {
  return (
    <Badge
      variant={
        role === "super_admin" ? "accent" : role === "admin" ? "teal" : "neutral"
      }
    >
      {ROLE_LABELS[role as Role] ?? role}
    </Badge>
  );
}
