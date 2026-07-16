import { Badge } from "@/components/ui/badge";

// Chip Attivo/Disattivato condiviso da team, dettaglio membro e clienti.
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge
      variant="outline"
      className={
        active
          ? "bg-green-500/12 text-green-700 dark:text-green-300 border-green-500/25"
          : "bg-neutral-500/12 text-neutral-700 dark:text-neutral-300 border-neutral-500/25"
      }
    >
      {active ? "Attivo" : "Disattivato"}
    </Badge>
  );
}
