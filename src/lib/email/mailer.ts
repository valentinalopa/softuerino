import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";

export type Mail = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

export async function getEmailSettings() {
  return prisma.emailSettings.findUnique({ where: { id: 1 } });
}

type EmailSettings = NonNullable<Awaited<ReturnType<typeof getEmailSettings>>>;

function createTransport(settings: EmailSettings) {
  return nodemailer.createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.security === "tls",
    requireTLS: settings.security === "starttls",
    ignoreTLS: settings.security === "none",
    auth: settings.username
      ? {
          user: settings.username,
          pass: settings.passwordEncrypted ? decryptSecret(settings.passwordEncrypted) : "",
        }
      : undefined,
    // Un server SMTP lento o irraggiungibile non deve tenere appeso il processo.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

// Invia con le impostazioni salvate. Lancia in caso di errore: chi chiama
// decide se mostrarlo (email di prova) o solo registrarlo (notifiche).
export async function sendMail(settings: EmailSettings, mail: Mail) {
  if (!settings.host || !settings.fromAddress) {
    throw new Error("Server SMTP o mittente non configurati");
  }
  await createTransport(settings).sendMail({
    from: { name: settings.fromName, address: settings.fromAddress },
    ...mail,
  });
}

export function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Corpo HTML minimale e uguale per tutte le email: righe di testo (già
// escapate dal chiamante) e un pulsante verso l'app, se l'indirizzo è noto.
export function renderHtml(lines: string[], link?: { href: string; label: string }) {
  const body = lines.map((line) => `<p style="margin:0 0 12px">${line}</p>`).join("");
  const button = link
    ? `<p style="margin:20px 0 0"><a href="${escapeHtml(link.href)}" style="background:#1f2937;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${escapeHtml(link.label)}</a></p>`
    : "";
  return `<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#111827">${body}${button}</div>`;
}
