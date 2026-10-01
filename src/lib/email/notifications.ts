import "server-only";
import { prisma } from "@/lib/prisma";
import { escapeHtml, getEmailSettings, renderHtml, sendMail, type Mail } from "@/lib/email/mailer";
import { formatDate } from "@/lib/leave-format";
import { formatFullDate, formatTime } from "@/lib/calendar-utils";
import {
  LEAVE_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  type LeaveType,
  type TaskPriority,
} from "@/lib/constants";

// Notifiche email: "best effort". Vanno chiamate dentro after(), a scrittura
// già avvenuta: non rallentano la risposta e un SMTP rotto non fa fallire
// l'azione. Gli errori finiscono solo nel log del servizio.
// Una email per destinatario (nessuno vede gli indirizzi degli altri), solo a
// utenti attivi e mai a chi ha compiuto l'azione.

type Recipient = { name: string; email: string };

async function deliver(
  recipients: Recipient[],
  build: (recipient: Recipient, appUrl: string) => Mail
) {
  try {
    const settings = await getEmailSettings();
    if (!settings?.enabled || recipients.length === 0) return;
    const appUrl = settings.appUrl.replace(/\/+$/, "");
    await Promise.all(
      recipients.map(async (recipient) => {
        try {
          await sendMail(settings, build(recipient, appUrl));
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

function link(appUrl: string, path: string, label: string) {
  return appUrl ? { href: `${appUrl}${path}`, label } : undefined;
}

function firstName(recipient: Recipient) {
  return recipient.name.split(" ")[0] || recipient.name;
}

function greeting(recipient: Recipient) {
  return `Ciao ${escapeHtml(firstName(recipient))},`;
}

const DECISION_LABELS: Record<string, string> = {
  approved: "approvata",
  rejected: "rifiutata",
  registrata: "registrata",
};

// Esito di una richiesta di assenza, a chi l'ha fatta.
export async function notifyLeaveDecision(requestId: string, actorId: string) {
  const request = await prisma.leaveRequest.findUnique({
    where: { id: requestId },
    select: { userId: true, type: true, status: true, startDate: true, endDate: true, hours: true },
  });
  const decision = request && DECISION_LABELS[request.status];
  if (!request || !decision) return;

  const typeLabel = LEAVE_TYPE_LABELS[request.type as LeaveType] ?? request.type;
  const period =
    request.startDate.getTime() === request.endDate.getTime()
      ? `del ${formatDate(request.startDate)}`
      : `dal ${formatDate(request.startDate)} al ${formatDate(request.endDate)}`;
  const duration = request.hours !== null ? ` (${request.hours} ore)` : "";

  await deliver(await activeRecipients([request.userId], actorId), (recipient, appUrl) => {
    const summary = `la tua richiesta di ${typeLabel.toLowerCase()} ${period}${duration} è stata ${decision}.`;
    return {
      to: recipient.email,
      subject: `Richiesta ${typeLabel.toLowerCase()} ${decision}`,
      text: `Ciao ${firstName(recipient)},\n\n${summary}\n${appUrl ? `\n${appUrl}/richieste\n` : ""}`,
      html: renderHtml(
        [greeting(recipient), escapeHtml(summary)],
        link(appUrl, "/richieste", "Vedi le tue richieste")
      ),
    };
  });
}

// Invito a un evento del calendario, ai partecipanti.
export async function notifyEventInvite(eventId: string, participantIds: string[], actorId: string) {
  const event = await prisma.calendarEvent.findUnique({
    where: { id: eventId },
    select: { title: true, startAt: true, endAt: true, location: true, description: true },
  });
  if (!event) return;

  const sameDay = event.startAt.toDateString() === event.endAt.toDateString();
  const when = sameDay
    ? `${formatFullDate(event.startAt)}, ${formatTime(event.startAt)}–${formatTime(event.endAt)}`
    : `dal ${formatFullDate(event.startAt)} ${formatTime(event.startAt)} al ${formatFullDate(event.endAt)} ${formatTime(event.endAt)}`;
  const details = [
    `Quando: ${when}`,
    ...(event.location ? [`Dove: ${event.location}`] : []),
    ...(event.description ? [event.description] : []),
  ];

  await deliver(await activeRecipients(participantIds, actorId), (recipient, appUrl) => ({
    to: recipient.email,
    subject: `Invito: ${event.title}`,
    text: `Ciao ${firstName(recipient)},\n\nsei tra i partecipanti di "${event.title}".\n\n${details.join("\n")}\n${appUrl ? `\n${appUrl}/calendario\n` : ""}`,
    html: renderHtml(
      [
        greeting(recipient),
        `sei tra i partecipanti di <strong>${escapeHtml(event.title)}</strong>.`,
        ...details.map(escapeHtml),
      ],
      link(appUrl, "/calendario", "Apri il calendario")
    ),
  }));
}

// Task assegnato, agli assegnatari.
export async function notifyTaskAssigned(taskId: string, assigneeIds: string[], actorId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { title: true, dueDate: true, priority: true, client: { select: { name: true } } },
  });
  if (!task) return;

  const details = [
    ...(task.client ? [`Cliente: ${task.client.name}`] : []),
    ...(task.dueDate ? [`Scadenza: ${formatFullDate(task.dueDate)}`] : []),
    ...(task.priority
      ? [`Priorità: ${TASK_PRIORITY_LABELS[task.priority as TaskPriority] ?? task.priority}`]
      : []),
  ];

  await deliver(await activeRecipients(assigneeIds, actorId), (recipient, appUrl) => ({
    to: recipient.email,
    subject: `Nuovo task: ${task.title}`,
    text: `Ciao ${firstName(recipient)},\n\nti è stato assegnato il task "${task.title}".\n${details.length ? `\n${details.join("\n")}\n` : ""}${appUrl ? `\n${appUrl}/task\n` : ""}`,
    html: renderHtml(
      [
        greeting(recipient),
        `ti è stato assegnato il task <strong>${escapeHtml(task.title)}</strong>.`,
        ...details.map(escapeHtml),
      ],
      link(appUrl, "/task", "Vedi i tuoi task")
    ),
  }));
}
