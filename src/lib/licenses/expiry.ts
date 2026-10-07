// Giorni di calendario tra oggi e la scadenza (0 = scade oggi, negativo =
// scaduta). Condiviso da pagine e avvisi email.
export function daysUntil(expiresAt: Date, now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(expiresAt.getFullYear(), expiresAt.getMonth(), expiresAt.getDate());
  return Math.round((target.getTime() - today.getTime()) / day);
}

export type ExpiryStatus = "none" | "ok" | "soon" | "expired";

export function expiryStatus(expiresAt: Date | null, reminderDays: number, now = new Date()): ExpiryStatus {
  if (!expiresAt) return "none";
  const left = daysUntil(expiresAt, now);
  if (left < 0) return "expired";
  return left <= reminderDays ? "soon" : "ok";
}

export function formatExpiry(expiresAt: Date | null, now = new Date()) {
  if (!expiresAt) return "Nessuna scadenza";
  const date = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(expiresAt);
  const left = daysUntil(expiresAt, now);
  if (left < 0) return `${date} (scaduta da ${-left} ${-left === 1 ? "giorno" : "giorni"})`;
  if (left === 0) return `${date} (scade oggi)`;
  return `${date} (tra ${left} ${left === 1 ? "giorno" : "giorni"})`;
}
