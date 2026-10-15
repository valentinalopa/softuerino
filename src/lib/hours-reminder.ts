import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailSettings, sendMail } from "@/lib/email/mailer";
import { hoursReminderEmail } from "@/lib/email/templates";
import { isWorkingDay } from "@/lib/leave-days";

// Promemoria serale (timer della VM alle 19, lun-ven): email a chi non ha
// registrato ore oggi. Niente nei giorni non lavorativi (weekend, feste) né a
// chi oggi è assente tutto il giorno (ferie, malattia, chiusura aziendale,
// assenza; anche se ancora in attesa di approvazione): un permesso a ore non
// esclude. Al massimo un'email al giorno a persona (hoursReminderSentFor).
export async function sendHoursReminders(now = new Date()) {
  const settings = await getEmailSettings();
  if (!settings?.enabled) return { skipped: "notifiche email disattivate", sent: [] as string[] };

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (!isWorkingDay(today)) return { skipped: "giorno non lavorativo", sent: [] as string[] };

  const [candidates, logged, away] = await Promise.all([
    prisma.user.findMany({
      where: {
        active: true,
        hoursReminder: true,
        OR: [{ hoursReminderSentFor: null }, { hoursReminderSentFor: { lt: today } }],
      },
      select: { id: true, name: true, email: true },
    }),
    prisma.timeEntry.findMany({
      where: { date: { gte: today, lt: tomorrow } },
      select: { userId: true },
      distinct: ["userId"],
    }),
    prisma.leaveRequest.findMany({
      where: {
        status: { not: "rejected" },
        hours: null,
        startDate: { lt: tomorrow },
        endDate: { gte: today },
      },
      select: { userId: true },
    }),
  ]);
  const skip = new Set([...logged.map((t) => t.userId), ...away.map((l) => l.userId)]);

  const sent: string[] = [];
  for (const user of candidates.filter((u) => !skip.has(u.id))) {
    try {
      await sendMail(settings, hoursReminderEmail(user, settings.appUrl, { date: today }));
      await prisma.user.update({ where: { id: user.id }, data: { hoursReminderSentFor: today } });
      sent.push(user.name);
    } catch (err) {
      console.error(`[ore] promemoria a ${user.email} non inviato:`, err);
    }
  }
  return { skipped: null, sent };
}
