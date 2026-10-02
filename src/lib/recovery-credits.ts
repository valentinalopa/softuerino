import { prisma } from "@/lib/prisma";
import { countedLeaveDays } from "@/lib/leave-days";
import type { RecoveryStatus, RecoveryUnit } from "@/lib/constants";

export type RecoveryCreditView = {
  id: string;
  reason: string;
  amount: number;
  unit: RecoveryUnit;
  earnedOn: Date;
  // Smaltito con richieste di recupero approvate / ancora in attesa.
  used: number;
  pending: number;
  autoStatus: RecoveryStatus;
  statusOverride: "da_fare" | "fatto" | null;
  // Stato mostrato: quello forzato dal super admin, altrimenti quello calcolato.
  status: RecoveryStatus;
};

type LinkedRequest = { status: string; startDate: Date; endDate: Date; hours: number | null };

// Quanto vale una richiesta di recupero nell'unità del recupero da fare.
function requestAmount(request: LinkedRequest, unit: string) {
  if (unit === "ore") return request.hours ?? 0;
  return request.hours === null ? countedLeaveDays(request.startDate, request.endDate) : 0;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

// Recuperi da fare per utente, dal più vecchio, con lo stato calcolato.
export async function getRecoveryCreditsForUsers(
  userIds: string[]
): Promise<Map<string, RecoveryCreditView[]>> {
  const credits = await prisma.recoveryCredit.findMany({
    where: { userId: { in: userIds } },
    include: {
      requests: {
        where: { status: { in: ["approved", "pending"] } },
        select: { status: true, startDate: true, endDate: true, hours: true },
      },
    },
    orderBy: [{ earnedOn: "asc" }, { createdAt: "asc" }],
  });

  const byUser = new Map<string, RecoveryCreditView[]>(userIds.map((id) => [id, []]));
  for (const credit of credits) {
    let used = 0;
    let pending = 0;
    for (const request of credit.requests) {
      const value = requestAmount(request, credit.unit);
      if (request.status === "approved") used += value;
      else pending += value;
    }
    const autoStatus: RecoveryStatus =
      used >= credit.amount ? "fatto" : used > 0 ? "in_parte" : "da_fare";
    const statusOverride =
      credit.statusOverride === "da_fare" || credit.statusOverride === "fatto"
        ? credit.statusOverride
        : null;
    byUser.get(credit.userId)?.push({
      id: credit.id,
      reason: credit.reason,
      amount: credit.amount,
      unit: credit.unit as RecoveryUnit,
      earnedOn: credit.earnedOn,
      used: round2(used),
      pending: round2(pending),
      autoStatus,
      statusOverride,
      status: statusOverride ?? autoStatus,
    });
  }
  return byUser;
}

// Recuperi ancora da smaltire, per la scelta nella nuova richiesta di recupero.
export type OpenRecoveryCredit = {
  id: string;
  reason: string;
  unit: RecoveryUnit;
  remaining: number;
};

export function toOpenRecoveryCredits(credits: RecoveryCreditView[]): OpenRecoveryCredit[] {
  // Fuori anche quelli già coperti da richieste in attesa: non resta nulla da chiedere.
  return credits
    .filter((credit) => credit.status !== "fatto")
    .map((credit) => ({
      id: credit.id,
      reason: credit.reason,
      unit: credit.unit,
      remaining: round2(Math.max(credit.amount - credit.used - credit.pending, 0)),
    }))
    .filter((credit) => credit.remaining > 0);
}

export async function getOpenRecoveryCredits(userId: string): Promise<OpenRecoveryCredit[]> {
  const credits = (await getRecoveryCreditsForUsers([userId])).get(userId) ?? [];
  return toOpenRecoveryCredits(credits);
}
