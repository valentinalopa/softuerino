import type { PedStatus } from "@/lib/constants";

// Colore del box = stato di produzione: nel calendario la domanda è
// "cosa manca da preparare?", i social sono badge secondari dentro il box.
export const PED_STATUS_STYLES: Record<PedStatus, { chip: string; dot: string }> = {
  idea: {
    chip: "bg-neutral-500/12 text-neutral-700 dark:text-neutral-300 border-neutral-500/25",
    dot: "bg-neutral-400",
  },
  in_lavorazione: {
    chip: "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25",
    dot: "bg-amber-500",
  },
  programmato: {
    chip: "bg-green-500/12 text-green-700 dark:text-green-300 border-green-500/25",
    dot: "bg-green-500",
  },
  pubblicato: {
    chip: "bg-blue-500/12 text-blue-800 dark:text-blue-300 border-blue-500/25",
    dot: "bg-blue-500",
  },
};

export function pedStatusStyle(status: string) {
  return (
    PED_STATUS_STYLES[status as PedStatus] ?? PED_STATUS_STYLES.idea
  );
}
