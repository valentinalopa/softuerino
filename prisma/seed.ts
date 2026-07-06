import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import "dotenv/config";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  const [anna, luca, sara, marco] = await Promise.all([
    prisma.user.upsert({
      where: { email: "anna@softuerino.it" },
      update: {},
      create: { name: "Anna Rossi", email: "anna@softuerino.it", role: "admin" },
    }),
    prisma.user.upsert({
      where: { email: "luca@softuerino.it" },
      update: {},
      create: { name: "Luca Bianchi", email: "luca@softuerino.it" },
    }),
    prisma.user.upsert({
      where: { email: "sara@softuerino.it" },
      update: {},
      create: { name: "Sara Verdi", email: "sara@softuerino.it" },
    }),
    prisma.user.upsert({
      where: { email: "marco@softuerino.it" },
      update: {},
      create: { name: "Marco Neri", email: "marco@softuerino.it" },
    }),
  ]);

  await prisma.leaveRequest.createMany({
    data: [
      {
        userId: luca.id,
        type: "ferie",
        startDate: new Date("2026-08-10"),
        endDate: new Date("2026-08-20"),
        status: "approved",
      },
      {
        userId: sara.id,
        type: "smartworking",
        startDate: new Date("2026-07-08"),
        endDate: new Date("2026-07-08"),
        status: "pending",
      },
      {
        userId: marco.id,
        type: "permesso",
        startDate: new Date("2026-07-10"),
        endDate: new Date("2026-07-10"),
        status: "pending",
        note: "Visita medica",
      },
    ],
  });

  const meeting = await prisma.calendarEvent.create({
    data: {
      title: "Weekly team sync",
      type: "riunione",
      startAt: new Date("2026-07-08T10:00:00"),
      endAt: new Date("2026-07-08T11:00:00"),
      location: "Sala riunioni / Meet",
    },
  });

  const shooting = await prisma.calendarEvent.create({
    data: {
      title: "Shooting cliente ACME",
      type: "shooting",
      startAt: new Date("2026-07-15T09:00:00"),
      endAt: new Date("2026-07-15T13:00:00"),
      location: "Studio",
    },
  });

  await prisma.eventParticipant.createMany({
    data: [
      { eventId: meeting.id, userId: anna.id },
      { eventId: meeting.id, userId: luca.id },
      { eventId: meeting.id, userId: sara.id },
      { eventId: meeting.id, userId: marco.id },
      { eventId: shooting.id, userId: sara.id },
      { eventId: shooting.id, userId: marco.id },
    ],
  });

  console.log("Seed completato.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
