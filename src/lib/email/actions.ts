"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { escapeHtml, getEmailSettings, renderHtml, sendMail } from "@/lib/email/mailer";
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

// Email di prova, sempre all'indirizzo del super admin che la chiede (non a
// destinatari arbitrari). Usa le impostazioni salvate, anche se le notifiche
// non sono ancora attive, così si può verificare prima di accenderle.
export async function sendTestEmail(): Promise<ActionResult> {
  const user = await requireSuperAdmin();
  const settings = await getEmailSettings();
  if (!settings) {
    return { error: "Salva prima le impostazioni" };
  }

  try {
    await sendMail(settings, {
      to: user.email,
      subject: "Softuerino: email di prova",
      text: `Ciao ${user.name},\n\nse leggi questo messaggio le impostazioni SMTP di Softuerino funzionano.\n`,
      html: renderHtml([
        `Ciao ${escapeHtml(user.name)},`,
        "se leggi questo messaggio le impostazioni SMTP di Softuerino funzionano.",
      ]),
    });
  } catch (err) {
    // Il dettaglio (es. autenticazione rifiutata, host irraggiungibile) serve
    // proprio a chi sta configurando: lo si restituisce, non lo si lancia.
    const detail = err instanceof Error ? err.message : String(err);
    return { error: `Invio non riuscito: ${detail}` };
  }

  return { success: `Email di prova inviata a ${user.email}.` };
}
