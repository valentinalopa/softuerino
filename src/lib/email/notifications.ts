import "server-only";
import { prisma } from "@/lib/prisma";
import { getEmailSettings, sendMail } from "@/lib/email/mailer";
import { isAdminRole } from "@/lib/constants";
import { approversOf } from "@/lib/permissions";
import {
  eventInviteEmail,
  leaveDecisionEmail,
  newLeaveRequestEmail,
  accountRequestEmail,
  accountRequestOutcomeEmail,
  taskAssignedEmail,
  type Mail,
  type Recipient,
} from "@/lib/email/templates";

// Notifiche email: "best effort". Vanno chiamate dentro after(), a scrittura
// già avvenuta: non rallentano la risposta e un SMTP rotto non fa fallire
// l'azione. Gli errori finiscono solo nel log del servizio.
// Una email per destinatario (nessuno vede gli indirizzi degli altri), solo a
// utenti attivi e mai a chi ha compiuto l'azione. I testi sono in templates.ts.

async function deliver(recipients: Recipient[], build: (recipient: Recipient, appUrl: string) => Mail | null) {
  try {
    const settings = await getEmailSettings();
    if (!settings?.enabled || recipients.length === 0) return;
    await Promise.all(
      recipients.map(async (recipient) => {
        const mail = build(recipient, settings.appUrl);
        if (!mail) return;
        try {
          await sendMail(settings, mail);
        } catch (err) {
          console.error(`[email] invio a ${recipient.email} fallito:`, err);
        }
      })
    );
  } catch (err) {
    console.error("[email] notifica non inviata:", err);
  }
}

async function activeRecipients(userIds: string[], excludeUserId: string) {
  const ids = userIds.filter((id) => id !== excludeUserId);
  if (ids.length === 0) return [];
  return prisma.user.findMany({
    where: { id: { in: ids }, active: true },
    select: { name: true, email: true },
  });
}

// Esito di una richiesta di assenza, a chi l'ha fatta.
export async function notifyLeaveDecision(requestId: string, actorId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, type: true, status: true, startDate: true, endDate: true, hours: true },
  });
  if (!request) return;
  await deliver(await activeRecipients([request.userId], actorId), (recipient, appUrl) =>
    leaveDecisionEmail(recipient, appUrl, request)
  );
}

// Nuova richiesta di assenza: ai responsabili ferie (scelti in Ruoli e
// permessi) e ai responsabili del reparto che possono approvarla.
export async function notifyNewLeaveRequest(requestId: string, actorId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: {
      userId: true,
      type: true,
      status: true,
      startDate: true,
      endDate: true,
      hours: true,
      startTime: true,
      endTime: true,
      note: true,
      user: { select: { name: true } },
    },
  });
  if (!request || (request.status !== "pending" && request.status !== "registrata")) return;
  const [approvers, notified] = await Promise.all([
    approversOf(request.userId),
    prisma.user.findMany({ where: { leaveNotify: true }, select: { id: true } }),
  ]);
  const ids = [...new Set([...approvers, ...notified.map((u) => u.id)])].filter((id) => id !== request.userId);
  const recipients = (
    await prisma.user.findMany({
      where: { id: { in: ids.filter((id) => id !== actorId) }, active: true },
      select: { name: true, email: true, role: true },
    })
  )
    // La malattia è un dato sanitario: l'avviso va solo ad admin e super admin.
    .filter((r) => request.type !== "malattia" || isAdminRole(r.role));
  // Admin: pagina "Richieste del team"; responsabili: "Il mio reparto".
  const roleByEmail = new Map(recipients.map((r) => [r.email, r.role]));
  await deliver(recipients, (recipient, appUrl) =>
    newLeaveRequestEmail(recipient, appUrl, {
      ...request,
      requester: request.user.name,
      path: isAdminRole(roleByEmail.get(recipient.email) ?? "") ? "/richieste-team" : "/reparto",
    })
  );
}

// Richiesta di un nuovo utente: a chi gestisce gli account (Ruoli e
// permessi); se nessuno è indicato, a tutti i super admin.
export async function notifyAccountRequest(requestId: string) {
  const request = await prisma.accountRequest.findUnique({
    where: { id: requestId },
    include: { department: { select: { name: true } }, requestedBy: { select: { id: true, name: true } } },
  });
  if (!request) return;
  const chosen = await prisma.user.findMany({
    where: { active: true, accountNotify: true },
    select: { id: true, name: true, email: true },
  });
  const recipients = (
    chosen.length > 0
      ? chosen
      : await prisma.user.findMany({
          where: { active: true, role: "super_admin" },
          select: { id: true, name: true, email: true },
        })
  ).filter((r) => r.id !== request.requestedById);
  await deliver(recipients, (recipient, appUrl) =>
    accountRequestEmail(recipient, appUrl, {
      firstName: request.firstName,
      lastName: request.lastName,
      email: request.email,
      department: request.department?.name ?? null,
      requester: request.requestedBy?.name ?? "Qualcuno",
      note: request.note,
    })
  );
}

// Esito della richiesta di nuovo utente, a chi l'ha fatta.
export async function notifyAccountRequestOutcome(requestId: string, actorId: string) {
  const request = await prisma.accountRequest.findUnique({ where: { id: requestId } });
  if (!request?.requestedById) return;
  await deliver(await activeRecipients([request.requestedById], actorId), (recipient, appUrl) =>
    accountRequestOutcomeEmail(recipient, appUrl, request)
  );
}

// Invito a un evento del calendario, ai partecipanti.
export async function notifyEventInvite(eventId: string, participantIds: string[], actorId: string) {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { title: true, startAt: true, endAt: true, location: true, description: true },
  });
  if (!event) return;
  await deliver(await activeRecipients(participantIds, actorId), (recipient, appUrl) =>
    eventInviteEmail(recipient, appUrl, event)
  );
}

// Task assegnato, agli assegnatari.
export async function notifyTaskAssigned(taskId: string, assigneeIds: string[], actorId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, dueDate: true, priority: true, client: { select: { name: true } } },
  });
  if (!task) return;
  await deliver(await activeRecipients(assigneeIds, actorId), (recipient, appUrl) =>
    taskAssignedEmail(recipient, appUrl, { ...task, clientName: task.client?.name ?? null })
  );
}
