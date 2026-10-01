"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { getEmailSettings, sendMail } from "@/lib/email/mailer";
import type { Mail } from "@/lib/email/templates";
import { buildSample, SAMPLE_KINDS, type SampleKind } from "@/lib/email/samples";
import { EMAIL_SECURITY, type EmailSecurity } from "@/lib/constants";

type ActionResult = { error: string } | { success: string } | undefined;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Impostazioni SMTP: solo super admin. La password viaggia solo in entrata:
// vuota = lascia quella salvata, "clearPassword" = rimuovila.
export async function saveEmailSettings(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();

  const enabled = formData.get("enabled") === "true";
  const host = String(formData.get("host") ?? "").trim();
  const port = Number(formData.get("port") ?? "");
  const security = String(formData.get("security") ?? "");
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const clearPassword = formData.get("clearPassword") === "true";
  const fromAddress = String(formData.get("fromAddress") ?? "").trim();
  const fromName = String(formData.get("fromName") ?? "").trim() || "Softuerino";
  const appUrl = String(formData.get("appUrl") ?? "").trim().replace(/\/+$/, "");

  if (host && !/^[A-Za-z0-9.-]+$/.test(host)) {
    return { error: "Server SMTP non valido" };
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { error: "Porta non valida" };
  }
  if (!EMAIL_SECURITY.includes(security as EmailSecurity)) {
    return { error: "Tipo di cifratura non valido" };
  }
  if (fromAddress && !EMAIL_PATTERN.test(fromAddress)) {
    return { error: "Indirizzo mittente non valido" };
  }
  if (appUrl && !/^https?:\/\/[^\s/]+/.test(appUrl)) {
    return { error: "L'indirizzo dell'app deve iniziare con https:// (o http://)" };
  }
  if (enabled && (!host || !fromAddress)) {
    return { error: "Per attivare le notifiche servono server SMTP e mittente" };
  }
  if (password && !isEncryptionConfigured()) {
    return {
      error:
        "Manca SETTINGS_ENCRYPTION_KEY nell'ambiente del server: la password non può essere salvata cifrata",
    };
  }

  const passwordEncrypted = clearPassword
    ? { passwordEncrypted: null }
    : password
      ? { passwordEncrypted: encryptSecret(password) }
      : {};
  const data = { enabled, host, port, security, username, fromAddress, fromName, appUrl };

  await prisma.emailSettings.upsert({
    where: { id: 1 },
    create: { id: 1, ...data, ...passwordEncrypted },
    update: { ...data, ...passwordEncrypted },
  });

  revalidatePath("/impostazioni/email");
  return { success: "Impostazioni salvate." };
}

// Invio di prova, sempre all'indirizzo del super admin che lo chiede (non a
// destinatari arbitrari). Usa le impostazioni salvate anche se le notifiche
// non sono ancora attive, così si può verificare prima di accenderle.
async function sendToSelf(
  build: (recipient: { name: string; email: string }, appUrl: string) => Mail
): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const settings = await getEmailSettings();
  if (!settings) {
    return { error: "Salva prima le impostazioni" };
  }
  try {
    await sendMail(settings, build({ name: user.name, email: user.email }, settings.appUrl));
  } catch (err) {
    // Il dettaglio (es. autenticazione rifiutata, host irraggiungibile) serve
    // proprio a chi sta configurando: lo si restituisce, non lo si lancia.
    const detail = err instanceof Error ? err.message : String(err);
    return { error: `Invio non riuscito: ${detail}` };
  }
  return { success: `Email inviata a ${user.email}.` };
}

export async function sendTestEmail(): Promise<ActionResult> {
  return sendToSelf((recipient, appUrl) => buildSample("smtp", recipient, appUrl));
}

// Prova di una notifica: stesso template delle email vere, con dati di
// esempio e oggetto preceduto da "[Prova]".
export async function sendSampleNotification(kind: string): Promise<ActionResult> {
  // "kind" arriva dal client: solo i valori previsti.
  if (!SAMPLE_KINDS.includes(kind as SampleKind) || kind === "smtp") {
    return { error: "Tipo di notifica non valido" };
  }
  return sendToSelf((recipient, appUrl) => {
    const mail = buildSample(kind as SampleKind, recipient, appUrl);
    return { ...mail, subject: `[Prova] ${mail.subject}` };
  });
}
