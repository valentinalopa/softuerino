import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Cifratura dei segreti salvati nel DB (es. password SMTP) con AES-256-GCM.
// La chiave sta solo nell'ambiente del server (SETTINGS_ENCRYPTION_KEY, 32 byte
// in base64): chi ha una copia del DB senza il .env non può leggerli.
// Formato: "v1:<iv>:<tag>:<testo cifrato>", tutto in base64.

const VERSION = "v1";

function getKey() {
  const raw = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error("SETTINGS_ENCRYPTION_KEY non impostata");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("SETTINGS_ENCRYPTION_KEY deve essere di 32 byte in base64");
  }
  return key;
}

export function isEncryptionConfigured() {
  try {
    getKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(":");
}

export function decryptSecret(value: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== VERSION || !iv || !tag || !encrypted) {
    throw new Error("Segreto cifrato in un formato non riconosciuto");
  }
  const decipher = createDecipheriv("aes-256-gcm", getKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
