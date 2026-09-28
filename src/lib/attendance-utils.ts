import type {
  LeaveStatus,
  PresenceMode,
  PresenceSlot,
} from "@/lib/constants";

// Assenze a giornata intera (una per giorno del periodo richiesto).
export const DAY_LEAVE_TYPES = [
  "ferie",
  "recupero",
  "malattia",
  "assenza",
  "assenza_extra",
] as const;
export type DayLeaveType = (typeof DAY_LEAVE_TYPES)[number];

// Assenze a ore, su un solo giorno: il permesso e il recupero "a ore".
export type HourlyLeaveType = "permesso" | "recupero";

export type LeaveInfo = {
  type: DayLeaveType;
  status: LeaveStatus;
};

export type HourlyLeaveInfo = {
  type: HourlyLeaveType;
  hours: number;
  status: LeaveStatus;
};

export type DayEntry = {
  leave?: LeaveInfo;
  hourly?: HourlyLeaveInfo;
  presences: { slot: PresenceSlot; mode: PresenceMode }[];
};

// Parsing/serializzazione del parametro ?month=yyyy-MM condiviso da tutte le
// viste mensili (presenze, scheda membro).
export function parseMonthParam(month?: string) {
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, m] = month.split("-").map(Number);
    return new Date(year, m - 1, 1);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

export function monthQuery(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildAttendanceMap(params: {
  leaveRequests: {
    userId: string;
    type: string;
    startDate: Date;
    endDate: Date;
    hours: number | null;
    status: string;
  }[];
  presenceEntries: {
    userId: string;
    date: Date;
    slot: string;
    mode: string;
  }[];
}) {
  const map = new Map<string, DayEntry>();

  function getEntry(userId: string, key: string) {
    const mapKey = `${userId}__${key}`;
    let entry = map.get(mapKey);
    if (!entry) {
      entry = { presences: [] };
      map.set(mapKey, entry);
    }
    return entry;
  }

  for (const leave of params.leaveRequests) {
    if (leave.status === "rejected") continue;

    // A ore: il permesso sempre, il recupero quando ha le ore valorizzate.
    if (
      leave.type === "permesso" ||
      (leave.type === "recupero" && leave.hours !== null)
    ) {
      const entry = getEntry(leave.userId, dateKey(leave.startDate));
      entry.hourly = {
        type: leave.type,
        hours: leave.hours ?? 0,
        status: leave.status as LeaveStatus,
      };
      continue;
    }

    if (!DAY_LEAVE_TYPES.includes(leave.type as DayLeaveType)) continue;

    let cursor = leave.startDate;
    while (cursor <= leave.endDate) {
      const entry = getEntry(leave.userId, dateKey(cursor));
      entry.leave = {
        type: leave.type as DayLeaveType,
        status: leave.status as LeaveStatus,
      };
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1
      );
    }
  }

  for (const presence of params.presenceEntries) {
    const entry = getEntry(presence.userId, dateKey(presence.date));
    entry.presences.push({
      slot: presence.slot as PresenceSlot,
      mode: presence.mode as PresenceMode,
    });
  }

  return map;
}

export function lookupAttendance(
  map: Map<string, DayEntry>,
  userId: string,
  date: Date
) {
  return map.get(`${userId}__${dateKey(date)}`);
}
