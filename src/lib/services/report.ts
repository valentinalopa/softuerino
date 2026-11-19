import "server-only";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/constants";
import { ForbiddenError } from "@/lib/task-archive";
import { NotFoundError } from "@/lib/services/errors";
import {
  buildClientBreakdown,
  buildClientTotals,
  buildHoursByClientByMonth,
  buildLeaveTotals,
  groupSmallClients,
  rollUpToParent,
} from "@/lib/panoramica-utils";
import { loadClientHoursEntries } from "@/lib/client-hours";

// Report per l'app (F6 T2): gli stessi dati di /panoramica, solo admin e super
// admin. Finestra fissa di 12 mesi per le ore, anno corrente per le assenze.
// Solo numeri ed etichette.
export const REPORT_MONTHS = 12;

// Con userId (facoltativo) ore e assenze sono solo di quella persona (Report
// per persona, F6); se la persona non esiste: NotFoundError (404). Senza
// userId il report è quello di tutto il team, identico a prima.
export async function getReport(actor: { role: string }, now: Date = new Date(), userId?: string) {
  if (!isAdminRole(actor.role)) throw new ForbiddenError("Solo gli admin vedono il report");
  if (userId !== undefined) {
    const person = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!person) throw new NotFoundError("Persona non trovata");
  }
  const windowStart = new Date(now.getFullYear(), now.getMonth() - (REPORT_MONTHS - 1), 1);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
  const [timeEntries, leaveRequests] = await Promise.all([
    loadClientHoursEntries(windowStart, userId),
    prisma.leaveRequest.findMany({
      where: { startDate: { lte: yearEnd }, endDate: { gte: yearStart }, ...(userId ? { userId } : {}) },
      include: { user: { select: { employmentType: true } } },
    }),
  ]);
  const hoursEntries = groupSmallClients(rollUpToParent(timeEntries));
  const byMonth = buildHoursByClientByMonth(hoursEntries, REPORT_MONTHS);
  const employmentTypeByUser = new Map(leaveRequests.map((r) => [r.userId, r.user.employmentType]));
  return {
    months: REPORT_MONTHS,
    year: now.getFullYear(),
    hoursByMonth: { clients: byMonth.clients, rows: byMonth.rows },
    clientTotals: buildClientTotals(hoursEntries),
    clientBreakdown: buildClientBreakdown(timeEntries, REPORT_MONTHS),
    leaveTotals: buildLeaveTotals(leaveRequests, yearStart, yearEnd, (userId) => employmentTypeByUser.get(userId)),
  };
}
