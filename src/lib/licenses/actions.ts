"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireWritableUser } from "@/lib/auth/session";
import { decryptSecret, encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { canAccessDepartment, licenseScopeFor } from "@/lib/licenses/access";
import { LICENSE_KINDS, type LicenseKind } from "@/lib/constants";

type ActionResult = { error: string } | undefined;

const READ_ONLY_ERROR = {
  error: "Stai vedendo l'app come un altro utente: in questa modalità non puoi modificare nulla",
};
const NOT_ALLOWED = { error: "Non hai accesso alle licenze di questo reparto" };

// Utente che può scrivere + reparti accessibili; null se non autorizzato.
async function writableScope() {
  const user = await requireWritableUser();
  if (!user) return { user: null, scope: null } as const;
  return { user, scope: await licenseScopeFor(user) } as const;
}

async function findAccessibleLicense(licenseId: string) {
  const { user, scope } = await writableScope();
  if (!user) return { error: READ_ONLY_ERROR } as const;
  if (!scope) return { error: NOT_ALLOWED } as const;
  const license = await prisma.license.findUnique({ where: { id: licenseId } });
  if (!license || !canAccessDepartment(scope, license.departmentId)) {
    return { error: { error: "Licenza non trovata" } } as const;
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

  if (!name) return { error: "Il nome è obbligatorio" } as const;
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
    },
  } as const;
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
  if (key && !isEncryptionConfigured()) {
    return { error: "Manca SETTINGS_ENCRYPTION_KEY sul server: la chiave non può essere salvata cifrata" };
  }

  const license = await prisma.license.create({
    data: { ...parsed.data, ...(key ? sealKey(key) : {}) },
  });
  revalidatePath("/utilita/licenze");
  return { id: license.id };
}

export async function updateLicense(licenseId: string, formData: FormData): Promise<ActionResult> {
  const found = await findAccessibleLicense(licenseId);
  if ("error" in found) return found.error;

  const parsed = parseLicenseForm(formData);
  if ("error" in parsed) return { error: parsed.error! };
  // Spostare la licenza in un altro reparto: anche quello deve essere accessibile.
  if (!canAccessDepartment(found.scope, parsed.data.departmentId)) return NOT_ALLOWED;

  const activations = await prisma.licenseActivation.count({ where: { licenseId } });
  if (parsed.data.activationLimit !== null && activations > parsed.data.activationLimit) {
    return { error: `Ci sono già ${activations} attivazioni: il limite non può essere più basso` };
  }

  // Chiave: vuota = invariata, "clearKey" = rimuovila.
  const key = String(formData.get("key") ?? "").trim();
  const clearKey = formData.get("clearKey") === "true";
  if (key && !isEncryptionConfigured()) {
    return { error: "Manca SETTINGS_ENCRYPTION_KEY sul server: la chiave non può essere salvata cifrata" };
  }
  const keyData = clearKey ? { keyEncrypted: null, keyHint: null } : key ? sealKey(key) : {};

  await prisma.license.update({ where: { id: licenseId }, data: { ...parsed.data, ...keyData } });
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

// Chiave completa, solo su richiesta esplicita ("Mostra" o "Copia"): ogni
// accesso finisce nel registro della licenza.
export async function revealLicenseKey(
  licenseId: string,
  action: string
): Promise<{ error: string } | { key: string }> {
  if (action !== "show" && action !== "copy") return { error: "Azione non valida" };
  const found = await findAccessibleLicense(licenseId);
  if ("error" in found) return found.error!;
  if (!found.license.keyEncrypted) return { error: "Nessuna chiave salvata" };

  let key: string;
  try {
    key = decryptSecret(found.license.keyEncrypted);
  } catch {
    return { error: "Chiave non leggibile (chiave di cifratura del server cambiata?)" };
  }
  await prisma.licenseKeyAccess.create({ data: { licenseId, userId: found.user.id, action } });
  revalidatePath(`/utilita/licenze/${licenseId}`);
  return { key };
}
