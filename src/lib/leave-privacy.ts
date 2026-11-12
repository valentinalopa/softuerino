import "server-only";
import { isAdminRole, isSensitiveLeave } from "@/lib/constants";

// Malattia e permesso 104 sono dati sanitari (GDPR art. 9): la vedono solo l'interessato
// e gli admin. Agli altri membri arriva come una generica "assenza", e il
// mascheramento va fatto qui, lato server, prima che i dati partano verso il
// browser: nasconderla solo nell'interfaccia la lascerebbe nel payload.
// Anche lo stato "registrata" va coperto, perché lo ha solo la malattia.
export function maskLeaveForViewer<T extends { userId: string; type: string; status: string }>(
  leave: T,
  viewer: { id: string; role: string }
): T {
  if (!isSensitiveLeave(leave.type) || leave.userId === viewer.id || isAdminRole(viewer.role)) {
    return leave;
  }
  return {
    ...leave,
    type: "assenza",
    status: leave.status === "registrata" ? "approved" : leave.status,
  };
}
