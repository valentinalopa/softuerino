import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import bcrypt from "bcryptjs";
import "dotenv/config";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

type SeedPerson = {
  name: string;
  email: string;
  employmentType: "dipendente" | "partita_iva";
  role: "super_admin" | "membro";
};

// Team reale: 3 dipendenti + 6 freelance (partita IVA), 5 dei quali Super Admin.
const PEOPLE: SeedPerson[] = [
  {
    name: "Valentina Loparco",
    email: "v.loparco@colibrivision.it",
    employmentType: "dipendente",
    role: "super_admin",
  },
  {
    name: "Giulia Cadeddu",
    email: "g.cadeddu@colibrivision.it",
    employmentType: "dipendente",
    role: "super_admin",
  },
  {
    name: "Andrea De Pascalis",
    email: "andreadepascalis@colibrivision.it",
    employmentType: "dipendente",
    role: "super_admin",
  },
  {
    name: "Giacomo Imbriani",
    email: "giacomoimbriani@colibrivision.it",
    employmentType: "partita_iva",
    role: "super_admin",
  },
  {
    name: "Giulia Romano",
    email: "g.romano@colibrivision.it",
    employmentType: "partita_iva",
    role: "super_admin",
  },
  {
    name: "Federico Rosa",
    email: "f.rosa@colibrivision.it",
    employmentType: "partita_iva",
    role: "membro",
  },
  {
    name: "Aurora Raso",
    email: "a.raso@colibrivision.it",
    employmentType: "partita_iva",
    role: "membro",
  },
  {
    name: "Debora Savian",
    email: "d.savian@colibrivision.it",
    employmentType: "partita_iva",
    role: "membro",
  },
  {
    name: "Alessio Riso",
    email: "a.riso@colibrivision.it",
    employmentType: "partita_iva",
    role: "membro",
  },
];

async function main() {
  const primaryAdminName = "Valentina Loparco";
  const primaryAdminDefaultEmail = PEOPLE.find(
    (p) => p.name === primaryAdminName
  )!.email;
  const primaryAdminEmail =
    process.env.SEED_SUPER_ADMIN_EMAIL ?? primaryAdminDefaultEmail;
  const primaryAdminPassword =
    process.env.SEED_SUPER_ADMIN_PASSWORD ?? "changeme123";

  if (!process.env.SEED_SUPER_ADMIN_EMAIL || !process.env.SEED_SUPER_ADMIN_PASSWORD) {
    console.warn(
      `⚠️  Uso credenziali di default per ${primaryAdminName} (${primaryAdminEmail} / ${primaryAdminPassword}). ` +
        "Imposta SEED_SUPER_ADMIN_EMAIL e SEED_SUPER_ADMIN_PASSWORD per cambiarle."
    );
  }

  const defaultPassword = "password123";

  const users = Object.fromEntries(
    await Promise.all(
      PEOPLE.map(async (person) => {
        const isPrimaryAdmin = person.name === primaryAdminName;
        const email = isPrimaryAdmin ? primaryAdminEmail : person.email;
        const password = isPrimaryAdmin ? primaryAdminPassword : defaultPassword;

        const user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            name: person.name,
            email,
            passwordHash: await bcrypt.hash(password, 10),
            role: person.role,
            employmentType: person.employmentType,
          },
        });

        return [person.name, user] as const;
      })
    )
  );

  const valentina = users["Valentina Loparco"];
  const giuliaCadeddu = users["Giulia Cadeddu"];
  const andrea = users["Andrea De Pascalis"];
  const giacomo = users["Giacomo Imbriani"];
  const aurora = users["Aurora Raso"];
  const federico = users["Federico Rosa"];

  // I blocchi demo (richieste, eventi, presenze, ore) vengono creati solo se la
  // relativa tabella è vuota: il seed resta rieseguibile senza duplicare dati
  // né violare vincoli unique, e non tocca mai dati inseriti dopo.
  const [leaveCount, eventCount, presenceCount, timeEntryCount] =
    await Promise.all([
      prisma.leaveRequest.count(),
      prisma.calendarEvent.count(),
      prisma.presenceEntry.count(),
      prisma.timeEntry.count(),
    ]);

  // Nota: createMany con oggetti che hanno set di chiavi diversi (es. "hours"
  // presente solo su alcuni) ha causato un disallineamento dei valori con
  // l'adapter SQLite di Prisma 7 in fase di seed — per sicurezza si usano
  // create() singoli con tutte le chiavi sempre esplicite (null se non usate).
  if (leaveCount === 0) {
    await Promise.all([
      prisma.leaveRequest.create({
      data: {
        userId: giuliaCadeddu.id,
        type: "ferie",
        startDate: new Date("2026-08-10"),
        endDate: new Date("2026-08-20"),
        hours: null,
        note: null,
        status: "approved",
      },
    }),
    prisma.leaveRequest.create({
      data: {
        // Aurora è partita IVA: usa il monte unico "assenza", non i permessi.
        userId: aurora.id,
        type: "assenza",
        startDate: new Date("2026-07-08"),
        endDate: new Date("2026-07-08"),
        hours: null,
        note: null,
        status: "pending",
      },
    }),
    prisma.leaveRequest.create({
      data: {
        userId: andrea.id,
        type: "malattia",
        startDate: new Date("2026-07-01"),
        endDate: new Date("2026-07-02"),
        hours: null,
        note: "Influenza",
        status: "registrata",
      },
    }),
  ]);
  }

  if (eventCount === 0) {
    const meeting = await prisma.calendarEvent.create({
      data: {
        title: "Weekly team sync",
        type: "riunione",
        startAt: new Date("2026-07-08T10:00:00"),
        endAt: new Date("2026-07-08T11:00:00"),
        location: "Sala riunioni / Meet",
        createdById: valentina.id,
      },
    });

    const shooting = await prisma.calendarEvent.create({
      data: {
        title: "Shooting Pininfarina",
        type: "shooting",
        startAt: new Date("2026-07-15T09:00:00"),
        endAt: new Date("2026-07-15T13:00:00"),
        location: "Studio",
        createdById: valentina.id,
      },
    });

    await prisma.eventParticipant.createMany({
      data: [
        { eventId: meeting.id, userId: valentina.id },
        { eventId: meeting.id, userId: giuliaCadeddu.id },
        { eventId: meeting.id, userId: andrea.id },
        { eventId: meeting.id, userId: giacomo.id },
        { eventId: shooting.id, userId: aurora.id },
        { eventId: shooting.id, userId: federico.id },
      ],
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (presenceCount === 0) {
    await prisma.presenceEntry.createMany({
      data: [
        { userId: valentina.id, date: today, slot: "giornata_intera", mode: "ufficio" },
        { userId: giuliaCadeddu.id, date: today, slot: "giornata_intera", mode: "smartworking" },
        { userId: andrea.id, date: today, slot: "mattina", mode: "ufficio" },
      ],
    });
  }

  // Categorie demo.
  const CLIENTS: { name: string; categories: string }[] = [
    { name: "Pininfarina", categories: "produzione" },
    { name: "Loomoon Games", categories: "it_design" },
    { name: "Studio Kubo", categories: "it_design,produzione" },
    { name: "Stresa Festival", categories: "produzione" },
    { name: "Offtopic", categories: "comunicazione" },
    { name: "Athlos Events", categories: "comunicazione,produzione" },
    { name: "Danger Promotion", categories: "comunicazione" },
    { name: "Elcom", categories: "it_design" },
  ];

  const clients = await Promise.all(
    CLIENTS.map(({ name, categories }) =>
      prisma.client.upsert({
        where: { name },
        update: {},
        create: { name, categories },
      })
    )
  );
  const pininfarina = clients[0];

  if (timeEntryCount === 0) {
    await prisma.timeEntry.createMany({
      data: [
        {
          userId: valentina.id,
          clientId: pininfarina.id,
          date: today,
          hours: 3,
          description: "Setup ambiente di sviluppo",
        },
        {
          userId: aurora.id,
          clientId: pininfarina.id,
          date: today,
          hours: 4,
          description: "Editing foto shooting",
        },
      ],
    });
  }

  console.log("Seed completato.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
