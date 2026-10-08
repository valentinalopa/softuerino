// Template delle email di Softuerino. Funzioni pure: dati in ingresso, email
// (oggetto, testo e HTML) in uscita. Le usano sia le notifiche vere sia le
// email di prova di Sistema → Email, così la prova mostra esattamente ciò che
// arriva agli utenti. Ogni valore dinamico viene escapato qui.

import { formatDate } from "@/lib/leave-format";
import { formatFullDate, formatTime } from "@/lib/calendar-utils";
import {
  LEAVE_TYPE_LABELS,
  TASK_PRIORITY_LABELS,
  type LeaveType,
  type TaskPriority,
} from "@/lib/constants";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export type Recipient = { name: string; email: string };

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Frase d'apertura: testo semplice con eventuali parti in evidenza.
type Intro = Array<string | { strong: string }>;

type Content = {
  subject: string;
  intro: Intro;
  details?: Array<[label: string, value: string]>;
  note?: string; // testo libero (es. descrizione dell'evento), su più righe
  link?: { path: string; label: string };
};

const FOOTER = "Email automatica di Softuerino: non rispondere a questo messaggio.";

// Colori del design system dell'app (src/app/globals.css, tema chiaro).
const C = {
  page: "#f8fafc",
  card: "#ffffff",
  text: "#111826",
  muted: "#64748a",
  border: "#e2e8f0",
  primary: "#6d6aef",
  soft: "#f1f0fe",
};
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function firstName(recipient: Recipient) {
  return recipient.name.trim().split(/\s+/)[0] || recipient.name;
}

function render(recipient: Recipient, appUrl: string, content: Content): Mail {
  const href = appUrl && content.link ? `${appUrl.replace(/\/+$/, "")}${content.link.path}` : null;

  // --- Testo semplice ---
  const introText = content.intro.map((p) => (typeof p === "string" ? p : `"${p.strong}"`)).join("");
  const text = [
    `Ciao ${firstName(recipient)},`,
    "",
    introText,
    ...(content.details?.length ? ["", ...content.details.map(([k, v]) => `${k}: ${v}`)] : []),
    ...(content.note ? ["", content.note] : []),
    ...(href ? ["", `${content.link!.label}: ${href}`] : []),
    "",
    "--",
    FOOTER,
    "",
  ].join("\n");

  // --- HTML (tabelle e stili inline: è quello che i client email leggono) ---
  const introHtml = content.intro
    .map((p) => (typeof p === "string" ? escapeHtml(p) : `<strong>${escapeHtml(p.strong)}</strong>`))
    .join("");
  const detailsHtml = content.details?.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:18px 0 0;border-collapse:collapse;border-top:1px solid ${C.border};width:100%">${content.details
        .map(
          ([k, v]) =>
            `<tr><td style="padding:6px 16px 6px 0;color:${C.muted};white-space:nowrap;vertical-align:top">${escapeHtml(k)}</td><td style="padding:6px 0;color:${C.text};font-weight:600">${escapeHtml(v)}</td></tr>`
        )
        .join("")}</table>`
    : "";
  const noteHtml = content.note
    ? `<p style="margin:18px 0 0;padding:12px 14px;background:${C.soft};border-radius:10px;color:${C.text};white-space:pre-line">${escapeHtml(content.note)}</p>`
    : "";
  const buttonHtml = href
    ? `<p style="margin:26px 0 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:${C.primary};color:#ffffff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:600">${escapeHtml(content.link!.label)}</a></p>`
    : "";

  const html = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page};padding:28px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;font-family:${FONT};font-size:15px;line-height:1.55;color:${C.text}">
<tr><td style="padding:0 4px 14px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${C.primary};margin-right:8px;vertical-align:middle"></span><span style="font-size:17px;font-weight:700;letter-spacing:-0.01em;vertical-align:middle">Softuerino</span></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-top:4px solid ${C.primary};border-radius:14px;padding:28px 28px 30px">
<p style="margin:0 0 12px">Ciao ${escapeHtml(firstName(recipient))},</p>
<p style="margin:0">${introHtml}</p>
${detailsHtml}${noteHtml}${buttonHtml}
</td></tr>
<tr><td style="padding:14px 4px 0;font-size:12px;color:${C.muted}">${escapeHtml(FOOTER)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { to: recipient.email, subject: content.subject, text, html };
}

// --- Template ---
// Ricevono i dati come stanno nel database (date, codici di tipo e stato) e
// li formattano qui, uguali per notifiche vere e prove.

const DECISION_LABELS: Record<string, string> = {
  approved: "approvata",
  rejected: "rifiutata",
  registrata: "registrata",
};

export function leaveDecisionEmail(
  recipient: Recipient,
  appUrl: string,
  data: { type: string; status: string; startDate: Date; endDate: Date; hours: number | null }
): Mail | null {
  const decision = DECISION_LABELS[data.status];
  if (!decision) return null;
  const type = (LEAVE_TYPE_LABELS[data.type as LeaveType] ?? data.type).toLowerCase();
  const period =
    data.startDate.getTime() === data.endDate.getTime()
      ? formatDate(data.startDate)
      : `dal ${formatDate(data.startDate)} al ${formatDate(data.endDate)}`;
  const details: Array<[string, string]> = [["Periodo", period]];
  if (data.hours !== null) details.push(["Durata", `${data.hours} ore`]);
  return render(recipient, appUrl, {
    subject: `Richiesta ${type} ${decision}`,
    intro: [`la tua richiesta di ${type} è stata `, { strong: decision }, "."],
    details,
    link: { path: "/richieste", label: "Vedi le tue richieste" },
  });
}

// Nuova richiesta di assenza, ai responsabili ferie e ai responsabili del
// reparto che possono approvarla. La malattia non si approva: si avvisa e basta.
export function newLeaveRequestEmail(
  recipient: Recipient,
  appUrl: string,
  data: {
    requester: string;
    type: string;
    status: string;
    startDate: Date;
    endDate: Date;
    hours: number | null;
    startTime: string | null;
    endTime: string | null;
    note: string | null;
    path: string;
  }
): Mail {
  const type = (LEAVE_TYPE_LABELS[data.type as LeaveType] ?? data.type).toLowerCase();
  const period =
    data.startDate.getTime() === data.endDate.getTime()
      ? formatDate(data.startDate)
      : `dal ${formatDate(data.startDate)} al ${formatDate(data.endDate)}`;
  const details: Array<[string, string]> = [["Periodo", period]];
  if (data.startTime && data.endTime) details.push(["Orario", `${data.startTime}–${data.endTime}`]);
  if (data.hours !== null) details.push(["Durata", `${data.hours} ore`]);
  const pending = data.status === "pending";
  // "ferie", "un permesso", "un'assenza", "una malattia"
  const article = type === "ferie" ? "" : type.startsWith("assenza") ? "un'" : type === "malattia" ? "una " : "un ";
  return render(recipient, appUrl, {
    subject: pending ? `Nuova richiesta: ${type} di ${data.requester}` : `${type.charAt(0).toUpperCase()}${type.slice(1)} registrata: ${data.requester}`,
    intro: pending
      ? [{ strong: data.requester }, ` ha chiesto ${article}${type}: è in attesa di approvazione.`]
      : [{ strong: data.requester }, ` ha registrato ${article}${type}.`],
    details,
    note: data.note ?? undefined,
    link: { path: data.path, label: pending ? "Apri le richieste da approvare" : "Apri le richieste" },
  });
}

export function eventInviteEmail(
  recipient: Recipient,
  appUrl: string,
  data: { title: string; startAt: Date; endAt: Date; location: string | null; description: string | null }
): Mail {
  const sameDay = data.startAt.toDateString() === data.endAt.toDateString();
  const when = sameDay
    ? `${formatFullDate(data.startAt)}, ${formatTime(data.startAt)}–${formatTime(data.endAt)}`
    : `dal ${formatFullDate(data.startAt)} ${formatTime(data.startAt)} al ${formatFullDate(data.endAt)} ${formatTime(data.endAt)}`;
  const details: Array<[string, string]> = [["Quando", when]];
  if (data.location) details.push(["Dove", data.location]);
  return render(recipient, appUrl, {
    subject: `Invito: ${data.title}`,
    intro: ["sei tra i partecipanti di ", { strong: data.title }, "."],
    details,
    note: data.description ?? undefined,
    link: { path: "/calendario", label: "Apri il calendario" },
  });
}

export function taskAssignedEmail(
  recipient: Recipient,
  appUrl: string,
  data: { title: string; clientName: string | null; dueDate: Date | null; priority: string | null }
): Mail {
  const details: Array<[string, string]> = [];
  if (data.clientName) details.push(["Cliente", data.clientName]);
  if (data.dueDate) details.push(["Scadenza", formatFullDate(data.dueDate)]);
  if (data.priority) {
    details.push(["Priorità", TASK_PRIORITY_LABELS[data.priority as TaskPriority] ?? data.priority]);
  }
  return render(recipient, appUrl, {
    subject: `Nuovo task: ${data.title}`,
    intro: ["ti è stato assegnato il task ", { strong: data.title }, "."],
    details,
    link: { path: "/task", label: "Vedi i tuoi task" },
  });
}

export function smtpTestEmail(recipient: Recipient, appUrl: string): Mail {
  return render(recipient, appUrl, {
    subject: "Softuerino: email di prova",
    intro: ["se leggi questo messaggio le impostazioni SMTP di Softuerino funzionano."],
    link: { path: "/impostazioni/email", label: "Apri le impostazioni email" },
  });
}

export function licenseExpiryEmail(
  recipient: Recipient,
  appUrl: string,
  data: {
    licenseId: string;
    name: string;
    kind: string; // licenza | abbonamento
    department: string;
    expiresAt: Date;
    daysLeft: number;
  }
): Mail {
  const what = data.kind === "abbonamento" ? "L'abbonamento" : "La licenza";
  const when = data.daysLeft <= 0 ? "oggi" : data.daysLeft === 1 ? "domani" : `tra ${data.daysLeft} giorni`;
  return render(recipient, appUrl, {
    subject: `${data.daysLeft <= 1 ? "Scade " + when : "In scadenza"}: ${data.name}`,
    intro: [`${what} `, { strong: data.name }, ` scade ${when}.`],
    details: [
      ["Scadenza", formatFullDate(data.expiresAt)],
      ["Reparto", data.department],
      ["Tipo", data.kind === "abbonamento" ? "Abbonamento" : "Licenza"],
    ],
    link: { path: `/utilita/licenze/${data.licenseId}`, label: "Apri la licenza" },
  });
}
