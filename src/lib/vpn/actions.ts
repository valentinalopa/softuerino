"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin } from "@/lib/auth/session";

type ActionResult = { error: string } | undefined;

// Sezioni VPN: le gestiscono solo i super admin (requireSuperAdmin blocca
// anche le impersonificazioni, dove l'utente effettivo è un membro).
type VpnData = { name: string; configUrl: string; notes: string | null };

function parseVpnForm(formData: FormData): { error: string } | { data: VpnData } {
  const name = String(formData.get("name") ?? "").trim();
  const configUrl = String(formData.get("configUrl") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (!name) return { error: "Indica il nome (es. la sede)" };
  if (name.length > 60) return { error: "Nome troppo lungo (massimo 60 caratteri)" };
  let url: URL;
  try {
    url = new URL(configUrl);
  } catch {
    return { error: "Il link al file di configurazione non è valido" };
  }
  if (url.protocol !== "https:") return { error: "Il link deve iniziare con https://" };
  if (configUrl.length > 500) return { error: "Link troppo lungo" };
  if (notes && notes.length > 500) return { error: "Note troppo lunghe (massimo 500 caratteri)" };
  return { data: { name, configUrl: url.toString(), notes } };
}

export async function createVpnSection(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = parseVpnForm(formData);
  if ("error" in parsed) return parsed;
  await prisma.vpnSection.create({ data: parsed.data });
  revalidatePath("/utilita/vpn");
}

export async function updateVpnSection(id: string, formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const parsed = parseVpnForm(formData);
  if ("error" in parsed) return parsed;
  const { count } = await prisma.vpnSection.updateMany({ where: { id }, data: parsed.data });
  if (count === 0) return { error: "VPN non trovata" };
  revalidatePath("/utilita/vpn");
}

export async function deleteVpnSection(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  const { count } = await prisma.vpnSection.deleteMany({ where: { id } });
  if (count === 0) return { error: "VPN non trovata" };
  revalidatePath("/utilita/vpn");
}
