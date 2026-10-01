import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// In locale: DATABASE_URL="file:./dev.db" (nessun authToken).
// Su Vercel/Turso: TURSO_DATABASE_URL="libsql://..." + TURSO_AUTH_TOKEN.
// `||` e non `??`: una TURSO_DATABASE_URL presente ma vuota (come in
// .env.example) deve ricadere su DATABASE_URL, non far connettere a "".
const adapter = new PrismaLibSql({
  url: process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN || undefined,
});

// passwordHash è escluso da ogni query per default: le pagine passano righe User
// ai client component e l'hash non deve mai finire nel payload RSC. Dove serve
// davvero (login, cambio password) va richiesto esplicitamente con
// `omit: { passwordHash: false }`.
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({ adapter, omit: { user: { passwordHash: true } } });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
