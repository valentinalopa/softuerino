// Eventi in arrivo per il widget (F2). DB di prova:
//   DATABASE_URL=file:/tmp/softuerino-test/f2.db npx tsx --test tests/calendar-upcoming.test.ts
import "./helpers/next-stubs";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { upcomingEvents } from "../src/lib/services/calendar";

const NOW = new Date("2026-12-10T08:00:00Z");
const plus = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

async function user(id: string) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role: "membro" },
  });
}
async function event(title: string, startH: number, endH: number, opts: { createdById?: string; participants?: string[] } = {}) {
  return prisma.calendarEvent.create({
    data: {
      title: `T-${title}`, type: "riunione", startAt: plus(startH), endAt: plus(endH),
      location: "Via Segreta 1", description: "dettagli riservati", createdById: opts.createdById ?? null,
      participants: { create: (opts.participants ?? []).map((userId) => ({ userId })) },
    },
  });
}

describe("upcomingEvents (widget)", () => {
  beforeEach(async () => {
    await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: "T-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    await user("w1");
    await user("w2");
  });

  it("solo gli eventi in cui sei partecipante o creatore, in ordine di inizio", async () => {
    await event("tardi", 30, 31, { participants: ["w1"] });
    await event("presto", 2, 3, { createdById: "w1" });
    await event("altrui", 4, 5, { participants: ["w2"] });
    await event("di-nessuno", 6, 7);
    const out = await upcomingEvents({ id: "w1", role: "membro" }, NOW);
    assert.deepEqual(out.map((e) => e.title), ["T-presto", "T-tardi"]);
  });

  it("finestra di 7 giorni: l'evento in corso c'è, quello passato e quello oltre i 7 giorni no", async () => {
    await event("in-corso", -1, 1, { participants: ["w1"] });
    await event("passato", -5, -2, { participants: ["w1"] });
    await event("giorno-7", 24 * 7 - 1, 24 * 7, { participants: ["w1"] });
    await event("giorno-8", 24 * 8, 24 * 8 + 1, { participants: ["w1"] });
    const out = await upcomingEvents({ id: "w1", role: "membro" }, NOW);
    assert.deepEqual(out.map((e) => e.title), ["T-in-corso", "T-giorno-7"]);
  });

  it("un admin vede comunque solo i propri eventi (come la dashboard)", async () => {
    await event("altrui", 2, 3, { participants: ["w2"] });
    assert.deepEqual(await upcomingEvents({ id: "w1", role: "admin" }, NOW), []);
  });

  it("solo i campi minimi: niente luogo, descrizione, partecipanti o creatore", async () => {
    await event("campi", 2, 3, { createdById: "w1", participants: ["w1", "w2"] });
    const [first] = await upcomingEvents({ id: "w1", role: "membro" }, NOW);
    assert.deepEqual(Object.keys(first).sort(), ["endAt", "id", "startAt", "title", "type"]);
    assert.equal(first.startAt, plus(2).toISOString());
  });

  it("al massimo 20 eventi", async () => {
    for (let i = 0; i < 25; i++) await event(`n${i}`, 1 + i, 2 + i, { participants: ["w1"] });
    assert.equal((await upcomingEvents({ id: "w1", role: "membro" }, NOW)).length, 20);
  });
});
