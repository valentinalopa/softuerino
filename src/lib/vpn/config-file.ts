import "server-only";

// Controlli sul file di configurazione OpenVPN caricato dai super admin.
export const VPN_CONFIG_MAX_BYTES = 256 * 1024;

export async function readVpnConfigFile(
  file: FormDataEntryValue | null
): Promise<{ error: string } | { fileName: string; content: string } | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (file.size > VPN_CONFIG_MAX_BYTES) return { error: "File troppo grande (massimo 256 KB)" };
  if (!/\.(ovpn|conf)$/i.test(file.name)) return { error: "Carica il file di configurazione OpenVPN (.ovpn)" };

  const bytes = new Uint8Array(await file.arrayBuffer());
  let content: string;
  try {
    content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { error: "Il file non è un file di testo: carica il file .ovpn" };
  }
  // Una configurazione client indica sempre il server ("remote" o un blocco <connection>).
  if (content.includes("\0") || !/^\s*(remote\s+\S+|<connection>)/m.test(content)) {
    return { error: "Il file non sembra una configurazione OpenVPN (manca «remote»)" };
  }
  return { fileName: safeFileName(file.name), content };
}

// Nome usato nel download: solo caratteri sicuri, sempre .ovpn.
function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/\.(ovpn|conf)$/i, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  return `${clean.slice(0, 80) || "vpn"}.ovpn`;
}
