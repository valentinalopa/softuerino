export const LEAVE_TYPES = ["ferie", "permesso", "smartworking"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_TYPE_LABELS: Record<LeaveType, string> = {
  ferie: "Ferie",
  permesso: "Permesso",
  smartworking: "Smartworking",
};

export const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

export const LEAVE_STATUS_LABELS: Record<LeaveStatus, string> = {
  pending: "In attesa",
  approved: "Approvata",
  rejected: "Rifiutata",
};

export const EVENT_TYPES = ["riunione", "shooting", "altro"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  riunione: "Riunione di team",
  shooting: "Shooting",
  altro: "Altro",
};
