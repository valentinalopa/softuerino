// Caratterizzazione delle server action degli eventi (createEvent, updateEvent,
// deleteEvent in src/lib/actions.ts): messaggi, revalidatePath e invio inviti
// devono restare identici quando le action diventano wrapper del service.
//   DATABASE_URL=file:/tmp/softuerino-test/<db>.db npx tsx --test tests/event-actions.test.ts
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { beforeEach, describe, it } from "node:test";

// next/cache e next/server (after) registrano le chiamate: nessuna email parte.
const revalidated = cacheCalls.revalidated;

import { prisma } from "../src/lib/prisma";
import { SESSION_COOKIE_NAME } from "../src/lib/auth/constants";
import { createEvent, deleteEvent, updateEvent } from "../src/lib/actions";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
const DAY = 24 * 60 * 60 * 1000;

async function user(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role },
  });
}

async function loginAs(id: string, impersonatedUserId?: string) {
  const token = `tok-${id}`;
  await prisma.session.create({
    data: {
      userId: id,
      token: hash(token),
      expiresAt: new Date(Date.now() + 10 * DAY),
      authMethod: "oidc",
      impersonatedUserId,
    },
  });
  setRequest({ cookie: [SESSION_COOKIE_NAME, token] });
}

function form(over: Record<string, string | string[]> = {}) {
  const base: Record<string, string | string[]> = {
    title: "T-azione",
    type: "riunione",
    startAt: "2026-12-10T09:00",
    endAt: "2026-12-10T10:00",
    location: "Sala",
    description: "odg",
    participantIds: [],
    ...over,
  };
  const fd = new FormData();
  for (const [k, v] of Object.entries(base)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.set(k, v);
  }
  return fd;
}

async function mkEvent(createdById: string, participants: string[] = []) {
  return prisma.calendarEvent.create({
    data: {
      title: "T-esistente",
      type: "riunione",
      startAt: new Date("2026-12-10T09:00:00Z"),
      endAt: new Date("2026-12-10T10:00:00Z"),
      createdById,
      participants: { create: participants.map((userId) => ({ userId })) },
    },
  });
}

describe("server action eventi (caratterizzazione)", () => {
  beforeEach(async () => {
    resetCacheCalls();
    await prisma.session.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
    await prisma.impersonationLog.deleteMany({});
    await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: "T-" } } });
    await prisma.leaveRequest.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    for (const id of ["cr", "pa", "pb", "xx"]) await user(id);
    await user("ad", "admin");
  });

  it("createEvent: crea, revalida / e /calendario, programma gli inviti, ritorna undefined", async () => {
    await loginAs("cr");
    const res = await createEvent(form({ participantIds: ["pa", "pa", "pb"] }));
    assert.equal(res, undefined);
    const ev = await prisma.calendarEvent.findFirstOrThrow({
      where: { title: "T-azione" },
      include: { participants: true },
    });
    assert.equal(ev.createdById, "cr");
    assert.deepEqual(ev.participants.map((p) => p.userId).sort(), ["pa", "pb"]);
    assert.deepEqual(revalidated, ["/", "/calendario"]);
    assert.equal(cacheCalls.after, 1);
  });

  it("createEvent: messaggi di validazione", async () => {
    await loginAs("cr");
    const bad: [Record<string, string>, string][] = [
      [{ title: "  " }, "Dati evento non validi"],
      [{ type: "boh" }, "Dati evento non validi"],
      [{ startAt: "" }, "Le date/ora sono obbligatorie"],
      [{ endAt: "" }, "Le date/ora sono obbligatorie"],
      [{ startAt: "non-una-data" }, "Le date/ora non sono valide"],
      [{ endAt: "2026-12-10T08:00" }, "La fine non può precedere l'inizio"],
    ];
    for (const [over, error] of bad) {
      assert.deepEqual(await createEvent(form(over)), { error }, JSON.stringify(over));
    }
    assert.equal(await prisma.calendarEvent.count({ where: { title: "T-azione" } }), 0);
    assert.deepEqual(revalidated, []);
    assert.equal(cacheCalls.after, 0);
  });

  it("createEvent: partecipante assente → errore con nome e motivo, niente scritto", async () => {
    await prisma.leaveRequest.create({
      data: { userId: "pa", type: "ferie", status: "approved", startDate: new Date(2026, 11, 10), endDate: new Date(2026, 11, 10) },
    });
    await loginAs("cr");
    const res = await createEvent(form({ participantIds: ["pa"] }));
    assert.ok(res && /^Nome pa è assente in quelle date \(.+\)\. Rimuovi questa persona dai partecipanti$/.test(res.error), String(res?.error));
    assert.equal(await prisma.calendarEvent.count({ where: { title: "T-azione" } }), 0);
    assert.equal(cacheCalls.after, 0);
  });

  it("createEvent: malattia di un collega non svelata a un membro, visibile a un admin", async () => {
    await prisma.leaveRequest.create({
      data: { userId: "pa", type: "malattia", status: "registrata", startDate: new Date(2026, 11, 10), endDate: new Date(2026, 11, 10) },
    });
    await loginAs("cr");
    const asMember = await createEvent(form({ participantIds: ["pa"] }));
    assert.ok(asMember?.error.includes("è assente in quelle date"));
    assert.doesNotMatch(asMember!.error, /malattia/i);
    await loginAs("ad");
    const asAdmin = await createEvent(form({ participantIds: ["pa"] }));
    assert.match(asAdmin!.error, /malattia/i);
  });

  it("impersonificazione: nessuna scrittura, messaggio di sola lettura", async () => {
    const ev = await mkEvent("cr");
    await loginAs("ad", "cr");
    const msg = { error: "Stai vedendo l'app come un altro membro: in questa modalità non puoi modificare nulla" };
    assert.deepEqual(await createEvent(form()), msg);
    assert.deepEqual(await updateEvent(ev.id, form({ title: "T-nuovo" })), msg);
    assert.deepEqual(await deleteEvent(ev.id), msg);
    assert.equal(await prisma.calendarEvent.count({ where: { title: "T-azione" } }), 0);
    assert.equal(await prisma.calendarEvent.count({ where: { id: ev.id, title: "T-esistente" } }), 1);
    assert.deepEqual(revalidated, []);
  });

  it("updateEvent: evento inesistente, non autorizzato, validazione", async () => {
    const ev = await mkEvent("cr");
    await loginAs("cr");
    assert.deepEqual(await updateEvent("non-esiste", form()), {
      error: "Evento non trovato (forse è stato eliminato)",
    });
    assert.deepEqual(await updateEvent(ev.id, form({ title: "" })), { error: "Dati evento non validi" });
    await loginAs("xx");
    assert.deepEqual(await updateEvent(ev.id, form({ title: "T-nuovo" })), { error: "Non autorizzato" });
    assert.equal((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } })).title, "T-esistente");
    assert.deepEqual(revalidated, []);
  });

  it("updateEvent: creatore, partecipante e admin possono; invita solo i nuovi", async () => {
    const ev = await mkEvent("cr", ["pa"]);
    await loginAs("cr");
    assert.equal(await updateEvent(ev.id, form({ title: "T-uno", participantIds: ["pa", "pb"] })), undefined);
    assert.deepEqual(revalidated, ["/", "/calendario"]);
    assert.equal(cacheCalls.after, 1);
    const row = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id }, include: { participants: true } });
    assert.equal(row.title, "T-uno");
    assert.deepEqual(row.participants.map((p) => p.userId).sort(), ["pa", "pb"]);

    // Nessun nuovo partecipante → nessun invito; il partecipante può modificare.
    resetCacheCalls();
    await loginAs("pa");
    assert.equal(await updateEvent(ev.id, form({ title: "T-due", participantIds: ["pa", "pb"] })), undefined);
    assert.equal(cacheCalls.after, 0);
    assert.deepEqual(revalidated, ["/", "/calendario"]);

    await loginAs("ad");
    assert.equal(await updateEvent(ev.id, form({ title: "T-tre", participantIds: ["pb"] })), undefined);
    assert.equal((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } })).title, "T-tre");
  });

  it("updateEvent: partecipante assente → errore, evento invariato", async () => {
    const ev = await mkEvent("cr");
    await prisma.leaveRequest.create({
      data: { userId: "pb", type: "ferie", status: "approved", startDate: new Date(2026, 11, 10), endDate: new Date(2026, 11, 10) },
    });
    await loginAs("cr");
    const res = await updateEvent(ev.id, form({ title: "T-nuovo", participantIds: ["pb"] }));
    assert.match(res!.error, /^Nome pb è assente in quelle date/);
    assert.equal((await prisma.calendarEvent.findUniqueOrThrow({ where: { id: ev.id } })).title, "T-esistente");
  });

  it("deleteEvent: inesistente, non autorizzato, poi creatore/admin eliminano e revalidano", async () => {
    const ev = await mkEvent("cr", ["pa"]);
    await loginAs("cr");
    assert.deepEqual(await deleteEvent("non-esiste"), { error: "Evento non trovato (forse è stato eliminato)" });
    await loginAs("xx");
    assert.deepEqual(await deleteEvent(ev.id), { error: "Non autorizzato" });
    assert.equal(await prisma.calendarEvent.count({ where: { id: ev.id } }), 1);
    assert.deepEqual(revalidated, []);

    await loginAs("pa");
    assert.equal(await deleteEvent(ev.id), undefined);
    assert.equal(await prisma.calendarEvent.count({ where: { id: ev.id } }), 0);
    assert.deepEqual(revalidated, ["/", "/calendario"]);
    assert.equal(cacheCalls.after, 0);

    const ev2 = await mkEvent("cr");
    await loginAs("ad");
    assert.equal(await deleteEvent(ev2.id), undefined);
    assert.equal(await prisma.calendarEvent.count({ where: { id: ev2.id } }), 0);
  });
});
