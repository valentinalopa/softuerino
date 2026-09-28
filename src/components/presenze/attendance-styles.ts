import type { ComponentType } from "react";
import {
  Building2,
  CalendarOff,
  Clock3,
  Home,
  CalendarMinus,
  Palmtree,
  RotateCcw,
  Sunrise,
  Sunset,
  Thermometer,
} from "lucide-react";
import { lookupAttendance, type DayEntry } from "@/lib/attendance-utils";
import { TONE_CHIP } from "@/lib/tones";

// Richieste ancora in attesa: neutre, qualunque sia il tipo.
export const NEUTRAL_CHIP = TONE_CHIP.neutral;

export const LEAVE_STYLES = {
  ferie: {
    chip: TONE_CHIP.success,
    title: "Ferie",
    icon: Palmtree,
  },
  malattia: {
    chip: TONE_CHIP.danger,
    title: "Malattia",
    icon: Thermometer,
  },
  // Riposo compensativo (es. dopo una trasferta): non scala il monte.
  recupero: {
    chip: TONE_CHIP.teal,
    title: "Recupero",
    icon: RotateCcw,
  },
  // Monte unico delle partite IVA (nessuna distinzione ferie/malattia).
  assenza: {
    // Stesso significato delle ferie, per le partite IVA.
    chip: TONE_CHIP.success,
    title: "Assenza",
    icon: CalendarOff,
  },
  // Assenza di una partita IVA fuori dal monte.
  assenza_extra: {
    chip: TONE_CHIP.neutral,
    title: "Assenza extra",
    icon: CalendarMinus,
  },
} as const;

export const MODE_STYLES = {
  ufficio: {
    chip: TONE_CHIP.aqua,
    title: "Ufficio",
    icon: Building2,
  },
  smartworking: {
    chip: TONE_CHIP.accent,
    title: "Smartworking",
    icon: Home,
  },
} as const;

// Fasce orarie (indipendenti dal luogo): usate per i blocchi "Mattina"/
// "Pomeriggio" nella vista team, separati dai blocchi Ufficio/Smartworking.
// "Giornata intera" non genera un blocco orario a sé, il luogo basta.
export const TIME_STYLES = {
  mattina: {
    chip: TONE_CHIP.neutral,
    title: "Mattina",
    icon: Sunrise,
  },
  pomeriggio: {
    chip: TONE_CHIP.neutral,
    title: "Pomeriggio",
    icon: Sunset,
  },
} as const;

// Assenze a ore (un solo giorno): permesso e recupero a ore.
export const HOURLY_STYLES = {
  permesso: { chip: TONE_CHIP.warning, title: "Permesso", icon: Clock3 },
  recupero: { chip: TONE_CHIP.teal, title: "Recupero", icon: RotateCcw },
} as const;

export type DayCategory = {
  key: string;
  label: string;
  chip: string;
  icon: ComponentType<{ className?: string }>;
  people: { id: string; name: string }[];
};

const CATEGORY_ORDER = [
  "ufficio",
  "smartworking",
  "mattina",
  "pomeriggio",
  "ferie",
  "ferie-pending",
  "recupero",
  "recupero-pending",
  "malattia",
  "assenza",
  "assenza-pending",
  "assenza_extra",
  "assenza_extra-pending",
  "permesso",
  "permesso-pending",
];

// Raggruppa le persone di un giorno per categoria. Luogo (Ufficio/
// Smartworking) e orario (Mattina/Pomeriggio) sono blocchi indipendenti, non
// uniti in un'unica etichetta: una persona in ufficio di mattina compare sia
// nel blocco "Ufficio" sia nel blocco "Mattina". "Giornata intera" non genera
// un blocco orario a sé (il luogo è già sufficiente). Ferie/malattia/permesso
// restano categorie a parte come prima.
export function buildDayCategories(
  users: { id: string; name: string }[],
  map: Map<string, DayEntry>,
  day: Date
): DayCategory[] {
  const buckets = new Map<string, DayCategory>();

  function add(
    key: string,
    label: string,
    chip: string,
    icon: DayCategory["icon"],
    person: { id: string; name: string }
  ) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, chip, icon, people: [] };
      buckets.set(key, bucket);
    }
    if (!bucket.people.some((p) => p.id === person.id)) {
      bucket.people.push(person);
    }
  }

  for (const person of users) {
    const entry = lookupAttendance(map, person.id, day);
    if (!entry) continue;

    if (entry.leave) {
      const pending = entry.leave.status === "pending";
      const style = LEAVE_STYLES[entry.leave.type];
      const key = pending ? `${entry.leave.type}-pending` : entry.leave.type;
      const label = pending ? `${style.title} (in attesa)` : style.title;
      add(key, label, pending ? NEUTRAL_CHIP : style.chip, style.icon, person);
    }

    for (const presence of entry.presences) {
      const modeStyle = MODE_STYLES[presence.mode];
      add(presence.mode, modeStyle.title, modeStyle.chip, modeStyle.icon, person);

      if (presence.slot === "mattina" || presence.slot === "pomeriggio") {
        const timeStyle = TIME_STYLES[presence.slot];
        add(presence.slot, timeStyle.title, timeStyle.chip, timeStyle.icon, person);
      }
    }

    if (entry.hourly) {
      // Stesso blocco del tipo a giornata: "Recupero" raccoglie chi recupera
      // tutto il giorno e chi solo qualche ora.
      const style = HOURLY_STYLES[entry.hourly.type];
      const pending = entry.hourly.status === "pending";
      const key = pending ? `${entry.hourly.type}-pending` : entry.hourly.type;
      const label = pending ? `${style.title} (in attesa)` : style.title;
      add(key, label, pending ? NEUTRAL_CHIP : style.chip, style.icon, person);
    }
  }

  return CATEGORY_ORDER.map((key) => buckets.get(key)).filter(
    (bucket): bucket is DayCategory => Boolean(bucket)
  );
}

export function disambiguatedInitials(users: { id: string; name: string }[]) {
  const shortById = new Map(users.map((u) => [u.id, shortInitials(u.name)]));

  const counts = new Map<string, number>();
  for (const short of shortById.values()) {
    counts.set(short, (counts.get(short) ?? 0) + 1);
  }

  const result = new Map<string, string>();
  for (const user of users) {
    const short = shortById.get(user.id) ?? "";
    if ((counts.get(short) ?? 0) > 1) {
      const firstName = user.name.trim().split(/\s+/)[0] ?? "";
      result.set(user.id, firstName.slice(0, 3).toUpperCase());
    } else {
      result.set(user.id, short);
    }
  }
  return result;
}

function shortInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}
