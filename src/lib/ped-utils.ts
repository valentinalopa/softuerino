import { dateKey } from "@/lib/attendance-utils";
import type { PedEntry } from "@/components/ped/PedCalendar";

type PedContentRow = {
  id: string;
  title: string;
  date: Date;
  status: string;
  socials: string;
  script: string | null;
  clientId: string;
  assigneeId: string | null;
  client: { name: string };
};

// Riga Prisma -> payload serializzabile per il calendario client-side.
// I social viaggiano in DB come CSV (SQLite non ha array).
export function toPedEntry(row: PedContentRow): PedEntry {
  return {
    id: row.id,
    title: row.title,
    dateKey: dateKey(row.date),
    status: row.status,
    socials: row.socials ? row.socials.split(",") : [],
    script: row.script,
    clientId: row.clientId,
    clientName: row.client.name,
    assigneeId: row.assigneeId,
  };
}
