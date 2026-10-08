"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";
import { encryptSecret, isEncryptionConfigured } from "@/lib/crypto/secret-box";
import { readVpnConfigFile } from "@/lib/vpn/config-file";

type ActionResult = { error: string } | undefined;
type VpnFields = { name: string; notes: string | null };

// Sezioni VPN: le gestiscono solo i super admin (requireSuperAdmin blocca
// anche le impersonificazioni, dove l'utente effettivo è un membro).
function parseVpnForm(formData: FormData): { error: string } | { data: VpnFields } {
  const name = String(formData.get("name") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;
  if (!name) return { error: "Indica il nome (es. la sede)" };
  if (name.length > 60) return { error: "Nome troppo lungo (massimo 60 caratteri)" };
  if (notes && notes.length > 500) return { error: "Note troppo lunghe (massimo 500 caratteri)" };
  return { data: { name, notes } };
}

// File .ovpn cifrato; null = nessun file nuovo nel form.
async function parseConfig(formData: FormData) {
  const file = await readVpnConfigFile(formData.get("configFile"));
  if (!file || "error" in file) return file;
  if (!isEncryptionConfigured()) {
    return { error: "Cifratura non configurata sul server (SETTINGS_ENCRYPTION_KEY): impossibile salvare il file" };
  }
  return { configFileName: file.fileName, configEncrypted: encryptSecret(file.content) };
}

export async function createVpnSection(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = parseVpnForm(formData);
  if ("error" in parsed) return parsed;
  const config = await parseConfig(formData);
  if (!config) return { error: "Carica il file di configurazione (.ovpn)" };
  if ("error" in config) return config;
  await prisma.vpnSection.create({ data: { ...parsed.data, ...config } });
  revalidatePath("/utilita/vpn");
}

// Senza un file nuovo resta quello già caricato.
export async function updateVpnSection(id: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = parseVpnForm(formData);
  if ("error" in parsed) return parsed;
  const config = await parseConfig(formData);
  if (config && "error" in config) return config;
  const { count } = await prisma.vpnSection.updateMany({ where: { id }, data: { ...parsed.data, ...config } });
  if (count === 0) return { error: "VPN non trovata" };
  revalidatePath("/utilita/vpn");
}

export async function deleteVpnSection(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const { count } = await prisma.vpnSection.deleteMany({ where: { id } });
  if (count === 0) return { error: "VPN non trovata" };
  revalidatePath("/utilita/vpn");
}
