import { PrismaClient } from "@/generated/prisma/client";
import { PrismaLibSql } from "@prisma/adapter-libsql";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// SQLite su file, in locale come sul server: DATABASE_URL="file:./dev.db".
const adapter = new PrismaLibSql({ url: process.env.DATABASE_URL! });

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
