export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

// Colore di un cliente nei grafici di Report: i primi 5 in ordine fisso,
// "Altri clienti" in grigio (mai un sesto colore inventato). "altri" è
// OTHER_CLIENTS_ID di panoramica-utils, ripetuto qui per non portare quel
// modulo (lato server) nel browser.
export function clientColor(id: string, index: number) {
  return id === "altri" ? "var(--neutral-tone)" : CHART_COLORS[index] ?? "var(--neutral-tone)";
}
