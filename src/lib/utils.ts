import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Iniziali per l'avatar: prime lettere delle prime due parole del nome.
export function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "");
  return initials.join("") || "?";
}

// Aggiunge parametri a un href che può già contenere una query string
// (es. "/ore" oppure "/team/abc?tab=ore"): usa ? o & di conseguenza.
export function appendQuery(
  base: string,
  params: Record<string, string | undefined>
) {
  const parts = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([key, value]) => `${key}=${encodeURIComponent(value as string)}`);
  if (parts.length === 0) return base;
  return `${base}${base.includes("?") ? "&" : "?"}${parts.join("&")}`;
}

// Ordine alfabetico per nome, all'italiana: maiuscole/minuscole e accenti non
// contano, i numeri in ordine naturale ("Sede 2" prima di "Sede 10"). Tutte
// le liste di oggetti (persone, licenze, abbonamenti, clienti...) lo usano.
export function byName<T extends { name: string }>(a: T, b: T) {
  return a.name.localeCompare(b.name, "it", { sensitivity: "base", numeric: true });
}
