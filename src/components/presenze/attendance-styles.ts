import type { ComponentType } from "react";
import {
  Building2,
  CalendarOff,
  Clock3,
  Home,
  CalendarMinus,
  Palmtree,
  RotateCcw,
  Thermometer,
} from "lucide-react";
import { PRESENCE_SLOTS, PRESENCE_SLOT_LABELS } from "@/lib/constants";
import { formatTimeRange } from "@/lib/leave-format";
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

// Luogo + fascia oraria in un'unica categoria (es. "ufficio-mattina").
const PRESENCE_CATEGORY_KEYS = (Object.keys(MODE_STYLES) as (keyof typeof MODE_STYLES)[]).flatMap(
  (mode) => PRESENCE_SLOTS.map((slot) => `${mode}-${slot}`)
);

const CATEGORY_ORDER = [
  ...PRESENCE_CATEGORY_KEYS,
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

// Raggruppa le persone di un giorno per categoria. Luogo e orario stanno in
// un'unica etichetta ("Ufficio · Mattina"): ogni persona compare una volta
// sola per presenza, non in un blocco luogo e in uno orario.
// Ferie/malattia/permesso restano categorie a parte.
export function buildDayCategories(
  users: { id: string; name: string }[],
  map: Map<string, DayEntry>,
  day: Date
): DayCategory[] {
  const buckets = new Map<string, DayCategory>();

  // orderKey: posizione in CATEGORY_ORDER, se diversa dalla chiave (i
  // permessi si dividono per fascia ma restano al posto del loro tipo).
  const orderOf = new Map<string, string>();

  function add(
    key: string,
    label: string,
    chip: string,
    icon: DayCategory["icon"],
    person: { id: string; name: string },
    orderKey: string = key
  ) {
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { key, label, chip, icon, people: [] };
      buckets.set(key, bucket);
      orderOf.set(key, orderKey);
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
      add(
        `${presence.mode}-${presence.slot}`,
        `${modeStyle.title} · ${PRESENCE_SLOT_LABELS[presence.slot]}`,
        modeStyle.chip,
        modeStyle.icon,
        person
      );
    }

    if (entry.hourly) {
      // Un blocco per fascia ("Permesso 09:00–11:00"): chi ha la stessa
      // fascia sta insieme. Senza fascia (richieste vecchie) resta il blocco
      // del tipo, lo stesso di chi recupera tutto il giorno.
      const style = HOURLY_STYLES[entry.hourly.type];
      const pending = entry.hourly.status === "pending";
      const typeKey = pending ? `${entry.hourly.type}-pending` : entry.hourly.type;
      const range = formatTimeRange(entry.hourly);
      const title = range ? `${style.title} ${range}` : style.title;
      add(
        range ? `${typeKey}-${range}` : typeKey,
        pending ? `${title} (in attesa)` : title,
        pending ? NEUTRAL_CHIP : style.chip,
        style.icon,
        person,
        typeKey
      );
    }
  }

  // In ordine di categoria; a parità (fasce dello stesso tipo), per orario.
  return [...buckets.values()]
    .filter((bucket) => CATEGORY_ORDER.includes(orderOf.get(bucket.key)!))
    .sort(
      (a, b) =>
        CATEGORY_ORDER.indexOf(orderOf.get(a.key)!) -
          CATEGORY_ORDER.indexOf(orderOf.get(b.key)!) || a.key.localeCompare(b.key)
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
