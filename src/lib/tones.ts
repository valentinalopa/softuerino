// Toni del Colibrì DS per stati e categorie. I colori stanno nei token di
// globals.css (--success, --warning-soft, …): qui solo le classi che li usano,
// così badge, chip e punti colorati restano coerenti in tutta l'app.
export type Tone =
  | "neutral"
  | "accent"
  | "aqua"
  | "teal"
  | "success"
  | "warning"
  | "danger";

// Fondo tenue + testo leggibile su quel fondo (badge, etichette).
export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-neutral-soft text-neutral-soft-foreground",
  accent: "bg-primary-soft text-primary-soft-foreground",
  aqua: "bg-aqua-soft text-aqua-soft-foreground",
  teal: "bg-teal-soft text-teal-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
};

const TONE_BORDER: Record<Tone, string> = {
  neutral: "border-neutral-tone/30",
  accent: "border-primary/25",
  aqua: "border-aqua/40",
  teal: "border-teal/30",
  success: "border-success/30",
  warning: "border-warning/30",
  danger: "border-danger/30",
};

// Blocchi con bordo (eventi e presenze nelle griglie di calendario).
export const TONE_CHIP: Record<Tone, string> = Object.fromEntries(
  (Object.keys(TONE_SOFT) as Tone[]).map((tone) => [
    tone,
    `${TONE_SOFT[tone]} ${TONE_BORDER[tone]}`,
  ])
) as Record<Tone, string>;

// Pallino pieno (legende, giorni registrati/mancanti).
export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-neutral-tone",
  accent: "bg-primary",
  aqua: "bg-aqua",
  teal: "bg-teal",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

// Solo testo (messaggi di esito, stato "registrato / non registrato").
export const TONE_TEXT: Record<Tone, string> = {
  neutral: "text-muted-foreground",
  accent: "text-primary-soft-foreground",
  aqua: "text-aqua-soft-foreground",
  teal: "text-teal-soft-foreground",
  success: "text-success-soft-foreground",
  warning: "text-warning-soft-foreground",
  danger: "text-danger-soft-foreground",
};

// Etichette dei clienti (tabella task): ai toni non semantici del DS si
// aggiungono altre tinte, così clienti diversi hanno di rado lo stesso colore.
// Niente warning/danger, che restano alla priorità.
export const CLIENT_TAG_COLORS: string[] = [
  TONE_SOFT.accent,
  TONE_SOFT.aqua,
  TONE_SOFT.teal,
  TONE_SOFT.success,
  TONE_SOFT.neutral,
  "bg-pink-100 text-pink-800 dark:bg-pink-500/18 dark:text-pink-200",
  "bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-500/18 dark:text-fuchsia-200",
  "bg-lime-100 text-lime-800 dark:bg-lime-500/18 dark:text-lime-200",
  "bg-orange-100 text-orange-800 dark:bg-orange-500/18 dark:text-orange-200",
  "bg-stone-200 text-stone-800 dark:bg-stone-500/25 dark:text-stone-200",
];
