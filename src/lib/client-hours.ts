import "server-only";
import { prisma } from "@/lib/prisma";
import type { ClientHoursEntryWithParent } from "@/lib/panoramica-utils";

// Ore di tutto il team dal giorno indicato, con il cliente padre delle voci
// (Panoramica e relativo CSV).
export async function loadClientHoursEntries(from: Date): Promise<ClientHoursEntryWithParent[]> {
  const entries = await prisma.timeEntry.findMany({
    where: { date: { gte: from } },
    select: {
      date: true,
      hours: true,
      clientId: true,
      client: { select: { name: true, parentId: true, parent: { select: { name: true } } } },
    },
  });
  return entries.map((entry) => ({
    date: entry.date,
    hours: entry.hours,
    clientId: entry.clientId,
    clientName: entry.client.name,
    parentId: entry.client.parentId,
    parentName: entry.client.parent?.name ?? null,
  }));
}
