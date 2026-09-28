import { Badge } from "@/components/ui/badge";

// Chip Attivo/Disattivato condiviso da team, dettaglio membro e clienti.
export function ActiveBadge({ active }: { active: boolean }) {
  return (
    <Badge variant={active ? "success" : "neutral"}>
      {active ? "Attivo" : "Disattivato"}
    </Badge>
  );
}
