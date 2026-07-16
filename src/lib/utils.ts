import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
