import type { ComponentType } from "react";
import {
  Building2,
  CalendarOff,
  Clock3,
  Home,
  Palmtree,
  Sunrise,
  Sunset,
  Thermometer,
} from "lucide-react";
import { lookupAttendance, type DayEntry } from "@/lib/attendance-utils";

export const NEUTRAL_CHIP = "bg-muted text-muted-foreground border-border";

export const LEAVE_STYLES = {
  ferie: {
    chip: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    title: "Ferie",
    icon: Palmtree,
  },
  malattia: {
    chip: "bg-rose-500/12 text-rose-700 dark:text-rose-300 border-rose-500/25",
    title: "Malattia",
    icon: Thermometer,
  },
  // Monte unico delle partite IVA (nessuna distinzione ferie/malattia).
  assenza: {
    chip: "bg-teal-500/12 text-teal-700 dark:text-teal-300 border-teal-500/25",
    title: "Assenza",
    icon: CalendarOff,
  },
} as const;

export const MODE_STYLES = {
  ufficio: {
    chip: "bg-sky-500/12 text-sky-800 dark:text-sky-300 border-sky-500/25",
    title: "Ufficio",
    icon: Building2,
  },
  smartworking: {
    chip: "bg-violet-500/12 text-violet-700 dark:text-violet-300 border-violet-500/25",
    title: "Smartworking",
    icon: Home,
  },
} as const;

// Fasce orarie (indipendenti dal luogo): usate per i blocchi "Mattina"/
// "Pomeriggio" nella vista team, separati dai blocchi Ufficio/Smartworking.
// "Giornata intera" non genera un blocco orario a sé, il luogo basta.
export const TIME_STYLES = {
  mattina: {
    chip: "bg-cyan-500/12 text-cyan-800 dark:text-cyan-300 border-cyan-500/25",
    title: "Mattina",
    icon: Sunrise,
  },
  pomeriggio: {
    chip: "bg-fuchsia-500/12 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-500/25",
    title: "Pomeriggio",
    icon: Sunset,
  },
} as const;

export const PERMESSO_CHIP =
  "bg-amber-500/12 text-amber-700 dark:text-amber-300 border-amber-500/25";
export const PERMESSO_ICON = Clock3;

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
  "malattia",
  "assenza",
  "assenza-pending",
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

    if (entry.permesso) {
      const pending = entry.permesso.status === "pending";
      const key = pending ? "permesso-pending" : "permesso";
      const label = pending ? "Permesso (in attesa)" : "Permesso";
      add(key, label, pending ? NEUTRAL_CHIP : PERMESSO_CHIP, PERMESSO_ICON, person);
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
