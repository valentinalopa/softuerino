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

// --- Rinnovo automatico (es. abbonamenti mensili come ChatGPT) ---

export const RENEWAL_PERIODS = [1, 12] as const; // mesi
export const RENEWAL_LABELS: Record<number, string> = { 1: "ogni mese", 12: "ogni anno" };

function addMonthsClamped(date: Date, months: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

// Prossima data di rinnovo a partire dall'ultima nota: si avanza di un
// periodo alla volta finché non è oggi o nel futuro.
export function nextRenewal(expiresAt: Date, months: number, now = new Date()) {
  let date = new Date(expiresAt);
  for (let i = 0; i < 1200 && daysUntil(date, now) < 0; i++) date = addMonthsClamped(date, months);
  return date;
}

type ExpiryInput = {
  expiresAt: Date | null;
  reminderDays: number;
  autoRenew: boolean;
  renewalMonths: number;
};

// Stato e testo della scadenza per pagine ed elenchi: chi si rinnova da solo
// non è mai "scaduto" né "in scadenza", mostra il prossimo rinnovo.
export function licenseExpiry(l: ExpiryInput, now = new Date()): { status: ExpiryStatus | "renews"; label: string } {
  if (!l.expiresAt) return { status: "none", label: "Nessuna scadenza" };
  if (l.autoRenew) {
    const next = nextRenewal(l.expiresAt, l.renewalMonths, now);
    const date = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(next);
    return { status: "renews", label: `Si rinnova il ${date} (${RENEWAL_LABELS[l.renewalMonths] ?? `ogni ${l.renewalMonths} mesi`})` };
  }
  return { status: expiryStatus(l.expiresAt, l.reminderDays, now), label: formatExpiry(l.expiresAt, now) };
}
