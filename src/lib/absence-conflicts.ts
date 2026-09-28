import { LEAVE_TYPE_LABELS } from "@/lib/constants";

// Un'assenza vista dal punto di vista della pianificazione di un evento.
export type PlanningAbsence = {
  userId: string;
  type: string;
  status: string;
  startDate: Date;
  endDate: Date;
  hours: number | null;
};

export type AbsenceConflict =
  // Assente tutto il giorno e già approvato/registrato: non invitabile.
  | { kind: "blocked"; reason: string }
  // Da tenere presente ma invitabile: richiesta in attesa o assenza a ore
  // (salviamo le ore, non la fascia oraria).
  | { kind: "warning"; reason: string };

function dayStart(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function describe(absence: PlanningAbsence) {
  const label =
    LEAVE_TYPE_LABELS[absence.type as keyof typeof LEAVE_TYPE_LABELS] ?? absence.type;
  return absence.hours !== null ? `${label} ${absence.hours}h` : label;
}

// Conflitto più grave tra le assenze di un membro e il periodo dell'evento.
// Le assenze sono per giorni interi: basta che un giorno si sovrapponga.
export function absenceConflict(
  absences: PlanningAbsence[],
  userId: string,
  eventStart: Date,
  eventEnd: Date
): AbsenceConflict | null {
  const from = dayStart(eventStart);
  const to = dayStart(eventEnd);
  let warning: AbsenceConflict | null = null;

  for (const absence of absences) {
    if (absence.userId !== userId || absence.status === "rejected") continue;
    if (dayStart(absence.startDate) > to || dayStart(absence.endDate) < from) continue;

    const confirmed = absence.status === "approved" || absence.status === "registrata";
    if (confirmed && absence.hours === null) {
      return { kind: "blocked", reason: describe(absence) };
    }
    warning ??= {
      kind: "warning",
      reason: confirmed ? describe(absence) : `${describe(absence)} in attesa`,
    };
  }
  return warning;
}
