import { BriefcaseBusiness, UserRoundCog, UserStar, type LucideIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { ROLE_LABELS, type Role } from "@/lib/constants";
import { cn, getInitials } from "@/lib/utils";

// Livelli visibili a tutti: ruolo in Softuerino (super admin, admin) e
// incarico di responsabile di reparto (da Keycloak). Chi ha più ruoli ha
// più etichette; l'anello sull'avatar prende il livello più alto.

type Level = "super_admin" | "admin" | "responsabile";

const LEVELS: Record<Level, { icon: LucideIcon; ring: string; dot: string; badge: "accent" | "teal" | "warning" }> = {
  super_admin: { icon: UserRoundCog, ring: "ring-primary", dot: "bg-primary", badge: "accent" },
  admin: { icon: BriefcaseBusiness, ring: "ring-teal", dot: "bg-teal", badge: "teal" },
  responsabile: { icon: UserStar, ring: "ring-warning", dot: "bg-warning", badge: "warning" },
};

function topLevel(role: string, departments: string[]): Level | null {
  if (role === "super_admin" || role === "admin") return role;
  return departments.length > 0 ? "responsabile" : null;
}

export function levelSummary(role: string, departments: string[]) {
  return [
    ...(role === "membro" && departments.length > 0 ? [] : [ROLE_LABELS[role as Role] ?? role]),
    ...departments.map((d) => `Responsabile ${d}`),
  ].join(" · ");
}

// Etichette: ruolo (con icona per admin e super admin) + una per ogni reparto
// di cui è responsabile. "Membro" compare solo se non c'è altro.
export function UserLevelBadges({ role, departments }: { role: string; departments: string[] }) {
  const roleLevel = role === "super_admin" || role === "admin" ? LEVELS[role] : null;
  return (
    <>
      {(role !== "membro" || departments.length === 0) && (
        <Badge variant={roleLevel?.badge ?? "neutral"}>
          {roleLevel && <roleLevel.icon aria-hidden="true" />}
          {ROLE_LABELS[role as Role] ?? role}
        </Badge>
      )}
      {departments.map((d) => (
        <ResponsabileBadge key={d} department={d} />
      ))}
    </>
  );
}

export function ResponsabileBadge({ department }: { department?: string }) {
  return (
    <Badge variant="warning">
      <UserStar aria-hidden="true" />
      {department ? `Responsabile ${department}` : "Responsabile"}
    </Badge>
  );
}

// Avatar con anello colorato e simbolo in basso a destra secondo il livello
// più alto; il titolo (al passaggio del mouse) li elenca tutti.
export function LevelAvatar({
  name,
  role,
  departments,
  className,
}: {
  name: string;
  role: string;
  departments: string[];
  className?: string;
}) {
  const level = topLevel(role, departments);
  const style = level ? LEVELS[level] : null;
  return (
    <span className={cn("relative inline-flex shrink-0", className)} title={levelSummary(role, departments)}>
      <Avatar size="sm" className={cn(style && `ring-2 ring-offset-2 ring-offset-card ${style.ring}`)}>
        <AvatarFallback>{getInitials(name)}</AvatarFallback>
      </Avatar>
      {style && (
        <span
          className={cn(
            "absolute -right-1.5 -bottom-1.5 flex size-4 items-center justify-center rounded-full text-white ring-2 ring-card",
            style.dot
          )}
          aria-hidden="true"
        >
          <style.icon className="size-2.5" strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}
