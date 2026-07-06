"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { EVENT_TYPES, LEAVE_TYPES } from "@/lib/constants";

export async function createUser(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const role = String(formData.get("role") ?? "member");

  if (!name || !email) {
    throw new Error("Nome ed email sono obbligatori");
  }

  await prisma.user.create({
    data: { name, email, role },
  });

  revalidatePath("/team");
}

export async function toggleUserActive(userId: string, active: boolean) {
  await prisma.user.update({
    where: { id: userId },
    data: { active },
  });
  revalidatePath("/team");
}

export async function createLeaveRequest(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const type = String(formData.get("type") ?? "");
  const startDate = String(formData.get("startDate") ?? "");
  const endDate = String(formData.get("endDate") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;

  if (!userId || !LEAVE_TYPES.includes(type as (typeof LEAVE_TYPES)[number])) {
    throw new Error("Dati richiesta non validi");
  }
  if (!startDate || !endDate) {
    throw new Error("Le date sono obbligatorie");
  }

  await prisma.leaveRequest.create({
    data: {
      userId,
      type,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      note,
    },
  });

  revalidatePath("/richieste");
  revalidatePath("/");
}

export async function updateLeaveStatus(
  requestId: string,
  status: "approved" | "rejected"
) {
  await prisma.leaveRequest.update({
    where: { id: requestId },
    data: { status },
  });
  revalidatePath("/richieste");
  revalidatePath("/");
}

export async function createEvent(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const type = String(formData.get("type") ?? "");
  const startAt = String(formData.get("startAt") ?? "");
  const endAt = String(formData.get("endAt") ?? "");
  const location = String(formData.get("location") ?? "").trim() || null;
  const description =
    String(formData.get("description") ?? "").trim() || null;
  const participantIds = formData.getAll("participantIds").map(String);

  if (!title || !EVENT_TYPES.includes(type as (typeof EVENT_TYPES)[number])) {
    throw new Error("Dati evento non validi");
  }
  if (!startAt || !endAt) {
    throw new Error("Le date/ora sono obbligatorie");
  }

  await prisma.calendarEvent.create({
    data: {
      title,
      type,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      location,
      description,
      participants: {
        create: participantIds.map((userId) => ({ userId })),
      },
    },
  });

  revalidatePath("/calendario");
  revalidatePath("/");
}

export async function deleteEvent(eventId: string) {
  await prisma.calendarEvent.delete({ where: { id: eventId } });
  revalidatePath("/calendario");
  revalidatePath("/");
}
