// Service del calendario (F2). DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/f2.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/f2.db npx tsx --test tests/calendar-service.test.ts
import "./helpers/next-stubs";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { listCalendar, parseCalendarRange } from "../src/lib/services/calendar";
import { ValidationError } from "../src/lib/services/errors";

const at = (iso: string) => new Date(iso);
const day = (y: number, m: number, d: number) => new Date(y, m - 1, d);

async function user(id: string, role = "membro", active = true) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role, active },
  });
}
const viewer = (id: string, role = "membro") => ({ id, role });
const range = () => parseCalendarRange("2026-12-01", "2026-12-31");

async function clean() {
  await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: "T-" } } });
  await prisma.leaveRequest.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
  await prisma.presenceEntry.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
  await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
}

describe("parseCalendarRange", () => {
  it("accetta AAAA-MM-GG e rifiuta il resto con ValidationError", () => {
    const r = parseCalendarRange("2026-12-01", "2026-12-31");
    assert.equal(r.from.getDate(), 1);
    assert.equal(r.to.getDate(), 31);
    for (const [a, b] of [
      [undefined, "2026-12-31"],
      ["2026-12-01", null],
      ["01/12/2026", "2026-12-31"],
      ["2026-13-01", "2026-13-02"],
      ["2026-02-30", "2026-03-01"],
      ["2026-12-31", "2026-12-01"],
    ] as const) {
      assert.throws(() => parseCalendarRange(a, b), ValidationError, `${a} ${b}`);
    }
  });

  it("al massimo 62 giorni per richiesta", () => {
    assert.doesNotThrow(() => parseCalendarRange("2026-12-01", "2027-01-31")); // 62 giorni
    assert.throws(() => parseCalendarRange("2026-12-01", "2027-02-01"), ValidationError); // 63
  });
});

describe("listCalendar", () => {
  beforeEach(clean);

  it("malattia altrui: il membro la vede come assenza generica, l'admin e l'interessato no", async () => {
    await user("v1");
    await user("s1");
    await user("ad1", "admin");
    await prisma.leaveRequest.create({
      data: { userId: "s1", type: "malattia", status: "registrata", startDate: day(2026, 12, 10), endDate: day(2026, 12, 11), note: "febbre" },
    });
    const member = await listCalendar(viewer("v1"), range());
    assert.equal(member.absences.length, 1);
    assert.equal(member.absences[0].type, "assenza");
    assert.equal(member.absences[0].status, "approved");
    const admin = await listCalendar(viewer("ad1", "admin"), range());
    assert.deepEqual([admin.absences[0].type, admin.absences[0].status], ["malattia", "registrata"]);
    const own = await listCalendar(viewer("s1"), range());
    assert.equal(own.absences[0].type, "malattia");
  });

  it("le assenze non portano mai la nota né l'id della richiesta; le date sono AAAA-MM-GG", async () => {
    await user("v2");
    await user("u2");
    await prisma.leaveRequest.create({
      data: { userId: "u2", type: "ferie", status: "approved", startDate: day(2026, 12, 14), endDate: day(2026, 12, 16), note: "segreto" },
    });
    const { absences } = await listCalendar(viewer("v2"), range());
    assert.deepEqual(Object.keys(absences[0]).sort(), [
      "endDate", "endTime", "hours", "startDate", "startTime", "status", "type", "userId", "userName",
    ]);
    assert.equal(absences[0].startDate, "2026-12-14");
    assert.equal(absences[0].endDate, "2026-12-16");
    assert.ok(!JSON.stringify(absences).includes("segreto"));
  });

  it("escluse le richieste rifiutate, quelle di utenti disattivati e quelle fuori dal periodo", async () => {
    await user("v3");
    await user("u3");
    await user("off3", "membro", false);
    const base = { type: "ferie", startDate: day(2026, 12, 10), endDate: day(2026, 12, 11) };
    await prisma.leaveRequest.createMany({
      data: [
        { userId: "u3", status: "rejected", ...base },
        { userId: "off3", status: "approved", ...base },
        { userId: "u3", status: "approved", type: "ferie", startDate: day(2027, 3, 1), endDate: day(2027, 3, 2) },
        { userId: "u3", status: "approved", ...base },
      ],
    });
    const { absences } = await listCalendar(viewer("v3"), range());
    assert.equal(absences.length, 1);
    assert.equal(absences[0].userId, "u3");
  });

  it("eventi: solo quelli che toccano il periodo; canEdit per admin, creatore e partecipante", async () => {
    await user("c4");
    await user("p4");
    await user("x4");
    await user("ad4", "admin");
    await prisma.calendarEvent.create({
      data: {
        title: "T-dentro", type: "riunione", startAt: at("2026-12-10T09:00:00Z"), endAt: at("2026-12-10T10:00:00Z"),
        location: "Sala", description: "ordine del giorno", createdById: "c4",
        participants: { create: [{ userId: "p4" }] },
      },
    });
    await prisma.calendarEvent.create({
      data: { title: "T-fuori", type: "altro", startAt: at("2027-03-10T09:00:00Z"), endAt: at("2027-03-10T10:00:00Z") },
    });
    const forCreator = await listCalendar(viewer("c4"), range());
    assert.deepEqual(forCreator.events.map((e) => e.title), ["T-dentro"]);
    assert.equal(forCreator.events[0].startAt, "2026-12-10T09:00:00.000Z");
    assert.deepEqual(forCreator.events[0].participants, [{ id: "p4", name: "Nome p4" }]);
    const canEdit = async (v: ReturnType<typeof viewer>) => (await listCalendar(v, range())).events[0].canEdit;
    assert.equal(await canEdit(viewer("c4")), true);
    assert.equal(await canEdit(viewer("p4")), true);
    assert.equal(await canEdit(viewer("ad4", "admin")), true);
    assert.equal(await canEdit(viewer("x4")), false);
  });

  it("presenze: degli utenti attivi nel periodo, con nome", async () => {
    await user("v5");
    await user("u5");
    await user("off5", "membro", false);
    await prisma.presenceEntry.createMany({
      data: [
        { userId: "u5", date: day(2026, 12, 3), slot: "giornata_intera", mode: "smartworking" },
        { userId: "off5", date: day(2026, 12, 3), slot: "giornata_intera", mode: "ufficio" },
        { userId: "u5", date: day(2027, 3, 3), slot: "giornata_intera", mode: "ufficio" },
      ],
    });
    const { presences } = await listCalendar(viewer("v5"), range());
    assert.deepEqual(presences, [
      { userId: "u5", userName: "Nome u5", date: "2026-12-03", slot: "giornata_intera", mode: "smartworking" },
    ]);
  });
});
