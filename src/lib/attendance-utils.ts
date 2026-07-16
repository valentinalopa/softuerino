import type {
  LeaveStatus,
  PresenceMode,
  PresenceSlot,
} from "@/lib/constants";

export type LeaveInfo = {
  type: "ferie" | "malattia" | "assenza";
  status: LeaveStatus;
};

export type PermessoInfo = {
  hours: number;
  status: LeaveStatus;
};

export type DayEntry = {
  leave?: LeaveInfo;
  permesso?: PermessoInfo;
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

    if (leave.type === "permesso") {
      const entry = getEntry(leave.userId, dateKey(leave.startDate));
      entry.permesso = {
        hours: leave.hours ?? 0,
        status: leave.status as LeaveStatus,
      };
      continue;
    }

    if (
      leave.type !== "ferie" &&
      leave.type !== "malattia" &&
      leave.type !== "assenza"
    )
      continue;

    let cursor = leave.startDate;
    while (cursor <= leave.endDate) {
      const entry = getEntry(leave.userId, dateKey(cursor));
      entry.leave = {
        type: leave.type,
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
