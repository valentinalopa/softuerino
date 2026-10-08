"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireWritableUser } from "@/lib/auth/session";
import { can } from "@/lib/permissions";
import { notifyAccountRequest, notifyAccountRequestOutcome } from "@/lib/email/notifications";

type ActionResult = { error: string } | undefined;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Richiesta di un nuovo utente (permesso "Richiedere nuovi utenti"): nome,
// cognome ed email arrivano a chi gestisce gli account, che lo crea in
// Keycloak; al primo accesso l'utente compare in Softuerino da solo.
export async function requestAccount(formData: FormData): Promise<ActionResult> {
  const user = await requireWritableUser();
  if (!user) return { error: "Stai vedendo l'app come un altro utente: in questa modalità non puoi modificare nulla" };
  if (!(await can(user, "utenti"))) return { error: "Non autorizzato" };

  const firstName = String(formData.get("firstName") ?? "").trim();
  const lastName = String(formData.get("lastName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const departmentId = String(formData.get("departmentId") ?? "").trim() || null;
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!firstName || !lastName || !email) return { error: "Nome, cognome ed email sono obbligatori" };
  if (!EMAIL_RE.test(email) || email.length > 200) return { error: "Email non valida" };
  if (firstName.length > 80 || lastName.length > 80) return { error: "Nome o cognome troppo lunghi" };
  if (note && note.length > 500) return { error: "Note troppo lunghe (massimo 500 caratteri)" };
  if (departmentId && !(await prisma.department.findUnique({ where: { id: departmentId } }))) {
    return { error: "Reparto non trovato" };
  }
  if (await prisma.user.findFirst({ where: { email } })) {
    return { error: "Esiste già un utente con questa email" };
  }
  if (await prisma.accountRequest.findFirst({ where: { email, status: "pending" } })) {
    return { error: "C'è già una richiesta in attesa per questa email" };
  }

  const request = await prisma.accountRequest.create({
    data: { firstName, lastName, email, departmentId, note, requestedById: user.id },
  });
  revalidatePath("/reparto");
  revalidatePath("/ruoli");
  after(() => notifyAccountRequest(request.id));
}

// Chi gestisce gli account la segna come fatta (creato in Keycloak) o la
// rifiuta: chi l'ha chiesta riceve un'email.
export async function handleAccountRequest(requestId: string, status: string): Promise<ActionResult> {
  const admin = await requireSuperAdmin();
  if (status !== "done" && status !== "rejected") return { error: "Stato non valido" };
  const { count } = await prisma.accountRequest.updateMany({
    where: { id: requestId, status: "pending" },
    data: { status, handledById: admin.id, handledAt: new Date() },
  });
  if (count === 0) return { error: "Richiesta già gestita o non trovata" };
  revalidatePath("/ruoli");
  revalidatePath("/reparto");
  after(() => notifyAccountRequestOutcome(requestId, admin.id));
}

// Chi riceve le richieste di nuovi utenti (se nessuno: tutti i super admin).
export async function updateAccountNotify(formData: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const ids = formData.getAll("userId").map(String);
  await prisma.$transaction([
    prisma.user.updateMany({ where: { id: { notIn: ids } }, data: { accountNotify: false } }),
    prisma.user.updateMany({ where: { id: { in: ids }, active: true }, data: { accountNotify: true } }),
  ]);
  revalidatePath("/ruoli");
  return undefined;
}
