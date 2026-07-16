import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

// Hash fittizio usato per equalizzare i tempi di risposta del login quando l'email
// non corrisponde a nessun utente, così il timing non rivela quali account esistono.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing-equalization", SALT_ROUNDS);

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Confronta sempre contro un hash bcrypt reale (fittizio se l'utente non esiste),
// per non lasciar trapelare via timing se un'email è registrata o meno.
export async function verifyPasswordTimingSafe(
  plain: string,
  hash: string | null
): Promise<boolean> {
  return bcrypt.compare(plain, hash ?? DUMMY_HASH);
}
