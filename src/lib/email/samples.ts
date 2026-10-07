import "server-only";
import {
  eventInviteEmail,
  leaveDecisionEmail,
  smtpTestEmail,
  taskAssignedEmail,
  licenseExpiryEmail,
  type Mail,
  type Recipient,
} from "@/lib/email/templates";

// Email di esempio per l'anteprima e le prove di Sistema → Email: stessi
// template delle notifiche vere, con dati inventati.

export const SAMPLE_KINDS = ["smtp", "leave", "event", "task", "license"] as const;
export type SampleKind = (typeof SAMPLE_KINDS)[number];

export const SAMPLE_LABELS: Record<SampleKind, string> = {
  smtp: "Email di prova SMTP",
  leave: "Esito di una richiesta",
  event: "Invito a un evento",
  task: "Task assegnato",
  license: "Licenza in scadenza",
};

function inDays(n: number, hour = 0) {
  const d = new Date();
  d.setHours(hour, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

export function buildSample(kind: SampleKind, recipient: Recipient, appUrl: string): Mail {
  switch (kind) {
    case "smtp":
      return smtpTestEmail(recipient, appUrl);
    case "leave":
      return leaveDecisionEmail(recipient, appUrl, {
        type: "ferie",
        status: "approved",
        startDate: inDays(14),
        endDate: inDays(18),
        hours: null,
      })!;
    case "event":
      return eventInviteEmail(recipient, appUrl, {
        title: "Riunione di team (esempio)",
        startAt: inDays(7, 10),
        endAt: inDays(7, 11),
        location: "Sala riunioni",
        description: "Punto sui progetti della settimana.\nPortate gli aggiornamenti dei vostri task.",
      });
    case "task":
      return taskAssignedEmail(recipient, appUrl, {
        title: "Preparare il preventivo (esempio)",
        clientName: "Cliente di esempio",
        dueDate: inDays(10),
        priority: "high",
      });
    case "license":
      return licenseExpiryEmail(recipient, appUrl, {
        licenseId: "esempio",
        name: "Breakdance (esempio)",
        kind: "licenza",
        department: "IT",
        expiresAt: inDays(7),
        daysLeft: 7,
      });
  }
}
