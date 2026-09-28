"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { verifyPasswordTimingSafe } from "@/lib/auth/password";
import { createSession, destroySession } from "@/lib/auth/session";
import { homePathFor } from "@/lib/constants";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        omit: { passwordHash: false },
      })
    : null;

  // Il confronto password gira sempre, anche se l'utente non esiste, così i tempi
  // di risposta non rivelano quali email sono registrate.
  const valid = await verifyPasswordTimingSafe(password, user?.passwordHash ?? null);

  if (!user || !user.active || !valid) {
    redirect("/login?error=1");
  }

  await createSession(user.id);
  redirect(homePathFor(user.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
