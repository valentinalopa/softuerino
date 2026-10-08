import "server-only";
import { isAdminRole } from "@/lib/constants";

// La malattia è un dato sanitario (GDPR art. 9): la vedono solo l'interessato
// e gli admin. Agli altri membri arriva come una generica "assenza", e il
// mascheramento va fatto qui, lato server, prima che i dati partano verso il
// browser: nasconderla solo nell'interfaccia la lascerebbe nel payload.
// Anche lo stato "registrata" va coperto, perché lo ha solo la malattia.
export function maskLeaveForViewer<T extends { userId: string; type: string; status: string }>(
  leave: T,
  viewer: { id: string; role: string }
): T {
  if (leave.type !== "malattia" || leave.userId === viewer.id || isAdminRole(viewer.role)) {
    return leave;
  }
  return {
    ...leave,
    type: "assenza",
    status: leave.status === "registrata" ? "approved" : leave.status,
  };
}
