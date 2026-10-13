import { prisma } from "@/lib/prisma";
import { startOfDay } from "@/lib/calendar-utils";

// Un membro nuovo eredita le chiusure aziendali non ancora iniziate: quelle
// passate o in corso non lo riguardano (non era ancora in team).
export async function addUpcomingClosuresFor(userId: string) {
  const closures = await prisma.companyClosure.findMany({
    where: { startDate: { gte: startOfDay(new Date()) } },
  });
  if (closures.length === 0) return;
  await prisma.leaveRequest.createMany({
    data: closures.map((closure) => ({
      userId,
      type: "chiusura",
      status: "approved",
      startDate: closure.startDate,
      endDate: closure.endDate,
      note: closure.note,
      closureId: closure.id,
    })),
  });
}
