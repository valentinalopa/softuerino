import { randomBytes } from "crypto";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/auth/password";

// Conservazione dei dati personali (informativa privacy, sezione 8):
// - rapporto cessato: 10 anni da deactivatedAt, poi l'utente è anonimizzato;
// - richieste di nuovo account non approvate: 12 mesi.
// Conta la cessazione, non l'età del dato: chi è attivo non si tocca mai.
export const USER_RETENTION_YEARS = 10;
export const ACCOUNT_REQUEST_RETENTION_MONTHS = 12;
export const REMOVED_USER_NAME = "Utente rimosso";
const REMOVED_EMAIL_PREFIX = "rimosso-";

function yearsAgo(now: Date, years: number) {
  const d = new Date(now);
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

function monthsAgo(now: Date, months: number) {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() - months);
  return d;
}

// Valore di deactivatedAt dopo un salvataggio di active: riattivato → null,
// appena disattivato → adesso, già disattivato → la data resta quella originale.
export function nextDeactivatedAt(
  active: boolean,
  previous: { active: boolean; deactivatedAt: Date | null },
  now: Date
): Date | null {
  if (active) return null;
  if (previous.active) return now;
  return previous.deactivatedAt ?? now;
}

export async function computeRetention(
  now: Date,
  db: PrismaClient = prisma
): Promise<{ expiredUserIds: string[]; expiredAccountRequestIds: string[] }> {
  const users = await db.user.findMany({
    where: {
      active: false,
      deactivatedAt: { not: null, lt: yearsAgo(now, USER_RETENTION_YEARS) },
      // Già anonimizzati: niente da rifare ogni notte.
      NOT: { email: { startsWith: REMOVED_EMAIL_PREFIX } },
    },
    select: { id: true },
  });
  const requests = await db.accountRequest.findMany({
    where: {
      status: { not: "done" },
      createdAt: { lt: monthsAgo(now, ACCOUNT_REQUEST_RETENTION_MONTHS) },
    },
    select: { id: true },
  });
  return {
    expiredUserIds: users.map((u) => u.id),
    expiredAccountRequestIds: requests.map((r) => r.id),
  };
}

export async function applyRetention(
  now: Date,
  apply: boolean,
  db: PrismaClient = prisma
): Promise<{ users: number; accountRequests: number; applied: boolean }> {
  const { expiredUserIds, expiredAccountRequestIds } = await computeRetention(now, db);
  const result = {
    users: expiredUserIds.length,
    accountRequests: expiredAccountRequestIds.length,
    applied: false,
  };
  if (!apply) return result;

  for (const userId of expiredUserIds) {
    // Hash casuale mai comunicato: l'account anonimizzato non può più entrare.
    const passwordHash = await hashPassword(randomBytes(32).toString("base64"));
    await db.$transaction([
      db.leaveRequest.deleteMany({ where: { userId } }),
      db.presenceEntry.deleteMany({ where: { userId } }),
      db.leaveBalanceAdjustment.deleteMany({ where: { userId } }),
      db.recoveryCredit.deleteMany({ where: { userId } }),
      db.impersonationLog.deleteMany({ where: { OR: [{ adminId: userId }, { targetUserId: userId }] } }),
      db.licenseKeyAccess.deleteMany({ where: { userId } }),
      db.vpnDownload.deleteMany({ where: { userId } }),
      db.session.deleteMany({ where: { userId } }),
      db.session.updateMany({ where: { impersonatedUserId: userId }, data: { impersonatedUserId: null } }),
      db.taskAssignee.deleteMany({ where: { userId } }),
      db.eventParticipant.deleteMany({ where: { userId } }),
      db.clientLogger.deleteMany({ where: { userId } }),
      db.userDepartment.deleteMany({ where: { userId } }),
      db.calendarEvent.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
      db.licenseActivation.updateMany({ where: { createdById: userId }, data: { createdById: null } }),
      db.accountRequest.updateMany({ where: { requestedById: userId }, data: { requestedById: null } }),
      db.accountRequest.updateMany({ where: { handledById: userId }, data: { handledById: null } }),
      // Le TimeEntry restano (fatturazione, 10 anni) ma l'utente non è più identificabile.
      db.user.update({
        where: { id: userId },
        data: {
          name: REMOVED_USER_NAME,
          email: `${REMOVED_EMAIL_PREFIX}${userId}@invalid`,
          oidcSubject: null,
          passwordHash,
          reportsTo: "",
          leaveNotify: false,
          accountNotify: false,
          hoursReminder: false,
          hoursReminderSentFor: null,
        },
      }),
    ]);
  }

  if (expiredAccountRequestIds.length > 0) {
    await db.accountRequest.deleteMany({ where: { id: { in: expiredAccountRequestIds } } });
  }
  return { ...result, applied: true };
}
