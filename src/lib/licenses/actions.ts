"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWritableUser } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { canAccessDepartment, canAccessLicense, licenseScopeFor, type LicenseMode } from "@/lib/licenses/access";
import { LICENSE_KINDS, type LicenseKind } from "@/lib/constants";
import { RENEWAL_PERIODS } from "@/lib/licenses/expiry";

type ActionResult = { error: string } | undefined;

const READ_ONLY_ERROR = {
  error: "Stai vedendo l'app come un altro utente: in questa modalità non puoi modificare nulla",
};
const NOT_ALLOWED = { error: "Non hai accesso alle licenze di questo reparto" };

// Utente che può scrivere + reparti accessibili; null se non autorizzato.
// "gestire" per creare, modificare, eliminare e togliere attivazioni;
// "vedere" per mostrare o copiare la chiave (registrando dove la si usa).
async function writableScope(mode: LicenseMode = "gestire") {
  const user = await requireWritableUser();
  if (!user) return { user: null, scope: null } as const;
  return { user, scope: await licenseScopeFor(user, mode) } as const;
}

async function findAccessibleLicense(licenseId: string, mode: LicenseMode = "gestire") {
  const { user, scope } = await writableScope(mode);
  if (!user) return { error: READ_ONLY_ERROR } as const;
  const license = await prisma.license.findUnique({
    where: { id: licenseId },
    include: { sharedDepartments: { select: { departmentId: true } } },
  });
  if (!license || !canAccessLicense(scope, license, mode)) {
    return { error: scope ? { error: "Licenza non trovata" } : NOT_ALLOWED } as const;
  }
  return { user, scope, license } as const;
}

function localDate(dateStr: string) {
  return new Date(`${dateStr}T00:00:00`);
}

// Campi comuni a creazione e modifica. La chiave si gestisce a parte.
function parseLicenseForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "licenza");
  const vendor = String(formData.get("vendor") ?? "").trim() || null;
  const departmentId = String(formData.get("departmentId") ?? "");
  const limitRaw = String(formData.get("activationLimit") ?? "").trim();
  const unlimited = formData.get("unlimited") === "true";
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();
  const reminderRaw = String(formData.get("reminderDays") ?? "7").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const visibleToAll = formData.get("visibleToAll") === "true";
  const autoRenew = formData.get("autoRenew") === "true";
  const renewalMonths = Number(formData.get("renewalMonths") ?? 12);
  const notifyExpiry = formData.get("notifyExpiry") !== "false";

  // Reparti con cui è condivisa, oltre al principale.
  const sharedDepartmentIds = [
    ...new Set(formData.getAll("sharedDepartmentIds").map(String).filter((id) => id && id !== departmentId)),
  ];

  if (!name) return { error: "Il nome è obbligatorio" } as const;
  if (String(formData.get("account") ?? "").trim().length > 200) return { error: "Account troppo lungo" } as const;
  if (!LICENSE_KINDS.includes(kind as LicenseKind)) return { error: "Tipo non valido" } as const;
  if (!departmentId) return { error: "Scegli il reparto" } as const;

  let activationLimit: number | null = null;
  if (!unlimited) {
    activationLimit = Number(limitRaw);
    if (!Number.isInteger(activationLimit) || activationLimit < 1 || activationLimit > 100000) {
      return { error: "Limite di attivazioni non valido (oppure scegli illimitate)" } as const;
    }
  }
  if (expiresRaw && !/^\d{4}-\d{2}-\d{2}$/.test(expiresRaw)) {
    return { error: "Data di scadenza non valida" } as const;
  }
  if (autoRenew && !expiresRaw) return { error: "Con il rinnovo automatico indica la data del prossimo rinnovo" } as const;
  if (autoRenew && !(RENEWAL_PERIODS as readonly number[]).includes(renewalMonths)) {
    return { error: "Cadenza di rinnovo non valida" } as const;
  }
  const reminderDays = Number(reminderRaw);
  if (!Number.isInteger(reminderDays) || reminderDays < 1 || reminderDays > 365) {
    return { error: "Giorni di preavviso non validi (da 1 a 365)" } as const;
  }

  return {
    data: {
      name,
      kind,
      vendor,
      departmentId,
      activationLimit,
      expiresAt: expiresRaw ? localDate(expiresRaw) : null,
      reminderDays,
      notes,
      visibleToAll,
      autoRenew,
      renewalMonths: autoRenew ? renewalMonths : 12,
      notifyExpiry,
    },
    sharedDepartmentIds,
  } as const;
}

// Account e password (cifrati): vuoti = invariati, "clear..." = rimuovili.
function credentialsData(formData: FormData) {
  const account = String(formData.get("account") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  return {
    ...(formData.get("clearAccount") === "true"
      ? { accountEncrypted: null, accountHint: null }
      : account
        ? { accountEncrypted: encryptSecret(account), accountHint: account.slice(0, 3) }
        : {}),
    ...(formData.get("clearPassword") === "true"
      ? { passwordEncrypted: null }
      : password
        ? { passwordEncrypted: encryptSecret(password) }
        : {}),
  };
}

async function existingDepartmentIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.department.findMany({ where: { id: { in: ids } }, select: { id: true } });
  return rows.map((r) => r.id);
}

function sealKey(key: string) {
  return { keyEncrypted: encryptSecret(key), keyHint: key.slice(0, 4) };
}

export async function createLicense(formData: FormData): Promise<ActionResult | { id: string }> {
  const { user, scope } = await writableScope();
  if (!user) return READ_ONLY_ERROR;
  if (!scope) return NOT_ALLOWED;

  const parsed = parseLicenseForm(formData);
  if ("error" in parsed) return { error: parsed.error! };
  if (!canAccessDepartment(scope, parsed.data.departmentId)) return NOT_ALLOWED;
  if (!(await prisma.department.findUnique({ where: { id: parsed.data.departmentId } }))) {
    return { error: "Reparto non trovato" };
  }

  const key = String(formData.get("key") ?? "").trim();
  if ((key || formData.get("password") || formData.get("account")) && !isEncryptionConfigured()) {
    return { error: "Manca SETTINGS_ENCRYPTION_KEY sul server: chiave, account e password non possono essere salvati cifrati" };
  }

  const shared = await existingDepartmentIds(parsed.sharedDepartmentIds);
  const license = await prisma.license.create({
    data: {
      ...parsed.data,
      ...(key ? sealKey(key) : {}),
      ...credentialsData(formData),
      sharedDepartments: { create: shared.map((departmentId) => ({ departmentId })) },
    },
  });
  revalidatePath("/utilita/licenze");
  return { id: license.id };
}

export async function updateLicense(licenseId: string, formData: FormData): Promise<ActionResult> {
  const found = await findAccessibleLicense(licenseId);
  if ("error" in found) return found.error;

  const parsed = parseLicenseForm(formData);
  if ("error" in parsed) return { error: parsed.error! };
  // Spostare la licenza in un altro reparto principale: anche quello deve
  // essere nel proprio ambito (chi la gestisce da un reparto condiviso può
  // modificarla, non spostarla).
  if (
    parsed.data.departmentId !== found.license.departmentId &&
    (!found.scope || !canAccessDepartment(found.scope, parsed.data.departmentId))
  ) {
    return NOT_ALLOWED;
  }

  const activations = await prisma.licenseActivation.count({ where: { licenseId } });
  if (parsed.data.activationLimit !== null && activations > parsed.data.activationLimit) {
    return { error: `Ci sono già ${activations} attivazioni: il limite non può essere più basso` };
  }

  // Chiave: vuota = invariata, "clearKey" = rimuovila.
  const key = String(formData.get("key") ?? "").trim();
  const clearKey = formData.get("clearKey") === "true";
  if ((key || formData.get("password") || formData.get("account")) && !isEncryptionConfigured()) {
    return { error: "Manca SETTINGS_ENCRYPTION_KEY sul server: chiave, account e password non possono essere salvati cifrati" };
  }
  const keyData = clearKey ? { keyEncrypted: null, keyHint: null } : key ? sealKey(key) : {};

  const shared = await existingDepartmentIds(parsed.sharedDepartmentIds);
  await prisma.$transaction([
    prisma.licenseDepartment.deleteMany({ where: { licenseId } }),
    prisma.license.update({
      where: { id: licenseId },
      data: {
        ...parsed.data,
        ...keyData,
        ...credentialsData(formData),
        sharedDepartments: { create: shared.map((departmentId) => ({ departmentId })) },
      },
    }),
  ]);
  revalidatePath("/utilita/licenze");
  revalidatePath(`/utilita/licenze/${licenseId}`);
}

export async function deleteLicense(licenseId: string): Promise<ActionResult> {
  const found = await findAccessibleLicense(licenseId);
  if ("error" in found) return found.error;
  await prisma.license.delete({ where: { id: licenseId } });
  revalidatePath("/utilita/licenze");
}

export async function addLicenseActivation(licenseId: string, formData: FormData): Promise<ActionResult> {
  const found = await findAccessibleLicense(licenseId);
  if ("error" in found) return found.error;

  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  if (!label) return { error: "Indica dove è attiva (sito, PC, account...)" };

  if (found.license.activationLimit !== null) {
    const used = await prisma.licenseActivation.count({ where: { licenseId } });
    if (used >= found.license.activationLimit) {
      return { error: `Limite raggiunto: ${used} attivazioni su ${found.license.activationLimit}` };
    }
  }

  await prisma.licenseActivation.create({
    data: { licenseId, label, note, createdById: found.user.id },
  });
  revalidatePath("/utilita/licenze");
  revalidatePath(`/utilita/licenze/${licenseId}`);
}

export async function removeLicenseActivation(activationId: string): Promise<ActionResult> {
  const activation = await prisma.licenseActivation.findUnique({
    where: { id: activationId },
    select: { licenseId: true },
  });
  if (!activation) return { error: "Attivazione non trovata" };
  const found = await findAccessibleLicense(activation.licenseId);
  if ("error" in found) return found.error;

  await prisma.licenseActivation.delete({ where: { id: activationId } });
  revalidatePath("/utilita/licenze");
  revalidatePath(`/utilita/licenze/${activation.licenseId}`);
}

// Chiave completa, solo su richiesta esplicita ("Mostra" o "Copia") e solo
// dicendo dove viene usata: un'attivazione già registrata (activationId) o una
// nuova (activationId "new" + label, entro il limite di attivazioni). Ogni
// accesso finisce nel registro della licenza con l'uso indicato.
export async function revealLicenseKey(
  licenseId: string,
  action: string,
  formData: FormData
): Promise<{ error: string } | { key: string }> {
  if (action !== "show" && action !== "copy") return { error: "Azione non valida" };
  const found = await findAccessibleLicense(licenseId, "vedere");
  if ("error" in found) return found.error!;
  // Cosa mostrare: la chiave di licenza, l'account o la sua password.
  const requested = String(formData.get("field") ?? "key");
  const field = requested === "password" || requested === "account" ? requested : "key";
  const sealed = {
    key: found.license.keyEncrypted,
    password: found.license.passwordEncrypted,
    account: found.license.accountEncrypted,
  }[field];
  if (!sealed) return { error: `Nessun${field === "key" ? "a chiave salvata" : field === "password" ? "a password salvata" : " account salvato"}` };

  const activationId = String(formData.get("activationId") ?? "new");
  const label = String(formData.get("label") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim() || null;
  let existing: { id: string; label: string } | null = null;
  if (activationId === "new") {
    if (!label) return { error: "Indica dove la usi (sito, PC, account...)" };
    if (label.length > 120) return { error: "Testo troppo lungo (massimo 120 caratteri)" };
    if (found.license.activationLimit !== null) {
      const used = await prisma.licenseActivation.count({ where: { licenseId } });
      if (used >= found.license.activationLimit) {
        return {
          error: `Limite raggiunto (${used} su ${found.license.activationLimit}): scegli un'attivazione già registrata o liberane una`,
        };
      }
    }
  } else {
    existing = await prisma.licenseActivation.findFirst({
      where: { id: activationId, licenseId },
      select: { id: true, label: true },
    });
    if (!existing) return { error: "Attivazione non trovata" };
  }

  let key: string;
  try {
    key = decryptSecret(sealed);
  } catch {
    return { error: "Dato non leggibile (chiave di cifratura del server cambiata?)" };
  }
  await prisma.$transaction(async (tx) => {
    const activation =
      existing ?? (await tx.licenseActivation.create({ data: { licenseId, label, note, createdById: found.user.id } }));
    await tx.licenseKeyAccess.create({
      data: { licenseId, userId: found.user.id, action, field, activationId: activation.id, usedFor: activation.label },
    });
  });
  revalidatePath("/utilita/licenze");
  revalidatePath(`/utilita/licenze/${licenseId}`);
  return { key };
}
