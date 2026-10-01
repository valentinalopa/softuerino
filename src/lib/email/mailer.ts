import "server-only";
import nodemailer from "nodemailer";
import { prisma } from "@/lib/prisma";
import { decryptSecret } from "@/lib/crypto/secret-box";
import type { Mail } from "@/lib/email/templates";

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
