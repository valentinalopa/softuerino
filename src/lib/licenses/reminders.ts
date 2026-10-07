import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailSettings, sendMail } from "@/lib/email/mailer";
import { licenseExpiryEmail } from "@/lib/email/templates";
import { daysUntil } from "@/lib/licenses/expiry";

// Avvisi di scadenza ai super admin, chiamati una volta al giorno dal timer
// della VM: primo avviso entro reminderDays giorni, secondo 1 giorno prima.
// Ogni avviso parte una sola volta per scadenza (firstReminderFor /
// finalReminderFor): se la scadenza cambia per un rinnovo ripartono da soli.
export async function sendLicenseReminders(now = new Date()) {
  const settings = await getEmailSettings();
  if (!settings?.enabled) return { skipped: "notifiche email disattivate", sent: [] as string[] };

  const recipients = await prisma.user.findMany({
    where: { role: "super_admin", active: true },
    select: { name: true, email: true },
  });
  const licenses = await prisma.license.findMany({
    where: { expiresAt: { not: null } },
    include: { department: { select: { name: true } } },
  });

  const sent: string[] = [];
  for (const license of licenses) {
    const expiresAt = license.expiresAt!;
    const left = daysUntil(expiresAt, now);
    if (left < 0) continue;

    const same = (d: Date | null) => d?.getTime() === expiresAt.getTime();
    let field: "firstReminderFor" | "finalReminderFor" | null = null;
    if (left <= 1 && !same(license.finalReminderFor)) field = "finalReminderFor";
    else if (left > 1 && left <= license.reminderDays && !same(license.firstReminderFor)) field = "firstReminderFor";
    if (!field) continue;

    let delivered = 0;
    for (const recipient of recipients) {
      try {
        await sendMail(
          settings,
          licenseExpiryEmail(recipient, settings.appUrl, {
            licenseId: license.id,
            name: license.name,
            kind: license.kind,
            department: license.department.name,
            expiresAt,
            daysLeft: left,
          })
        );
        delivered++;
      } catch (err) {
        console.error(`[licenze] avviso per ${license.id} a ${recipient.email} non inviato:`, err);
      }
    }
    // Segnato solo se almeno un'email è partita: altrimenti si riprova domani.
    if (delivered > 0) {
      await prisma.license.update({ where: { id: license.id }, data: { [field]: expiresAt } });
      sent.push(`${license.name} (${field === "finalReminderFor" ? "ultimo giorno" : `${left} giorni`})`);
    }
  }
  return { skipped: null, sent };
}
