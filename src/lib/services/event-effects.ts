import "server-only";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { notifyEventInvite } from "@/lib/email/notifications";

// Effetti di contorno dopo una scrittura di eventi fatta dall'app, gli stessi
// delle server action del web: le pagine si aggiornano e chi è stato aggiunto
// riceve l'invito (solo i nuovi partecipanti, mai chi c'era già).
export function afterEventWrite(eventId: string, newParticipantIds: string[], actorId: string) {
  revalidatePath("/");
  revalidatePath("/calendario");
  if (newParticipantIds.length > 0) {
    after(() => notifyEventInvite(eventId, newParticipantIds, actorId));
  }
}

export function afterEventDelete() {
  revalidatePath("/");
  revalidatePath("/calendario");
}
