import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { randomBytes, createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME } from "@/lib/auth/constants";

const SESSION_DURATION_DAYS = 30; // placeholder, nessun requisito specifico ricevuto

// Il cookie contiene il token in chiaro; solo il suo hash finisce nel DB, così una
// fuga del file DB non espone token di sessione direttamente utilizzabili.
function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000
  );

  await prisma.session.create({
    data: { userId, token: hashToken(token), expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export const getSession = cache(async () => {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token: hashToken(token) },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date()) {
    return null;
  }

  return session;
});

export async function requireUser() {
  const session = await getSession();
  if (!session || !session.user.active) {
    redirect("/login");
  }
  return session.user;
}

export async function requireSuperAdmin() {
  const user = await requireUser();
  if (user.role !== "super_admin") {
    redirect("/");
  }
  return user;
}

// Revoca le sessioni di un utente dopo un cambio password: tutte, oppure
// tutte tranne quella corrente (per non buttare fuori chi sta cambiando la
// propria password dal dispositivo su cui è loggato).
export async function revokeSessions(
  userId: string,
  { exceptCurrent = false }: { exceptCurrent?: boolean } = {}
) {
  let currentTokenHash: string | undefined;
  if (exceptCurrent) {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    currentTokenHash = token ? hashToken(token) : undefined;
  }

  await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentTokenHash ? { token: { not: currentTokenHash } } : {}),
    },
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (token) {
    await prisma.session.deleteMany({ where: { token: hashToken(token) } });
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
