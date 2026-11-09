// Service di scrittura degli eventi (F2). DB di prova:
//   DATABASE_URL=file:/tmp/softuerino-test/f2.db npx tsx --test tests/event-service.test.ts
import "./helpers/next-stubs";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { createEvent, deleteEvent, updateEvent } from "../src/lib/services/events";
import { ConflictError, NotFoundError, ValidationError } from "../src/lib/services/errors";
import { ForbiddenError } from "../src/lib/task-archive";

const v = (id: string, role = "membro", impersonating = false) => ({ id, role, impersonating });
const input = (over: Record<string, unknown> = {}) => ({
  title: "T-riunione",
  type: "riunione",
  startAt: "2026-12-10T09:00:00.000Z",
  endAt: "2026-12-10T10:00:00.000Z",
  location: "Sala",
  description: "odg",
  participantIds: [] as string[],
  ...over,
});

async function user(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@example.test`, passwordHash: "x", role },
  });
}

describe("servizio eventi", () => {
  beforeEach(async () => {
    await prisma.calendarEvent.deleteMany({ where: { title: { startsWith: "T-" } } });
    await prisma.leaveRequest.deleteMany({ where: { user: { email: { endsWith: "@example.test" } } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
    for (const id of ["cr", "pa", "pb", "xx"]) await user(id);
    await user("ad", "admin");
  });

  it("createEvent: crea con il creatore e i partecipanti (senza doppioni) e dice chi invitare", async () => {
    const out = await createEvent(v("cr"), input({ participantIds: ["pa", "pa", "pb"] }));
    assert.equal(out.event.title, "T-riunione");
    assert.equal(out.event.canEdit, true);
    assert.deepEqual(out.event.participants.map((p) => p.id).sort(), ["pa", "pb"]);
    assert.deepEqual([...out.newParticipantIds].sort(), ["pa", "pb"]);
    const row = await prisma.calendarEvent.findUniqueOrThrow({ where: { id: out.event.id } });
    assert.equal(row.createdById, "cr");
  });

  it("createEvent: viewer che sta impersonificando → ForbiddenError, niente scritto", async () => {
    await assert.rejects(createEvent(v("cr", "membro", true), input()), ForbiddenError);
    assert.equal(await prisma.calendarEvent.count({ where: { title: "T-riunione" } }), 0);
  });

  it("validazione (stessi messaggi del web)", async () => {
    const bad: [Record<string, unknown>, string][] = [
      [{ title: "  " }, "Dati evento non validi"],
      [{ type: "boh" }, "Dati evento non validi"],
      [{ startAt: "" }, "Le date/ora sono obbligatorie"],
      [{ endAt: undefined }, "Le date/ora sono obbligatorie"],
      [{ startAt: "non-una-data" }, "Le date/ora non sono valide"],
      [{ endAt: "2026-12-10T08:00:00.000Z" }, "La fine non può precedere l'inizio"],
      [{ participantIds: ["non-esiste"] }, "Partecipante non valido"],
      [{ title: "x".repeat(201) }, "Dati evento non validi"],
    ];
    for (const [over, message] of bad) {
      await assert.rejects(createEvent(v("cr"), input(over)), (e: unknown) => e instanceof ValidationError && e.message === message, message);
    }
  });

  it("partecipante assente (ferie approvate) → ConflictError con nome e motivo", async () => {
    await prisma.leaveRequest.create({
      data: { userId: "pa", type: "ferie", status: "approved", startDate: new Date(2026, 11, 10), endDate: new Date(2026, 11, 10) },
    });
    await assert.rejects(
      createEvent(v("cr"), input({ participantIds: ["pa"] })),
      (e: unknown) => e instanceof ConflictError && /Nome pa è assente in quelle date \(.+\)\. Rimuovi questa persona dai partecipanti/.test(e.message)
    );
  });

  it("malattia di un collega: l'errore non rivela il motivo a un membro, sì a un admin", async () => {
    await prisma.leaveRequest.create({
      data: { userId: "pa", type: "malattia", status: "registrata", startDate: new Date(2026, 11, 10), endDate: new Date(2026, 11, 10) },
    });
    const asMember = await createEvent(v("cr"), input({ participantIds: ["pa"] })).catch((e) => e);
    assert.ok(asMember instanceof ConflictError);
    assert.doesNotMatch(asMember.message, /malattia/i);
    const asAdmin = await createEvent(v("ad", "admin"), input({ participantIds: ["pa"] })).catch((e) => e);
    assert.ok(asAdmin instanceof ConflictError);
    assert.match(asAdmin.message, /malattia/i);
  });

  it("updateEvent: ammessi creatore, partecipante e admin; altri → Forbidden 'Non autorizzato'; invita solo i nuovi", async () => {
    const { event } = await createEvent(v("cr"), input({ participantIds: ["pa"] }));
    await assert.rejects(
      updateEvent(v("xx"), event.id, input({ title: "T-nuovo" })),
      (e: unknown) => e instanceof ForbiddenError && e.message === "Non autorizzato"
    );
    const byParticipant = await updateEvent(v("pa"), event.id, input({ title: "T-nuovo", participantIds: ["pa", "pb"] }));
    assert.equal(byParticipant.event.title, "T-nuovo");
    assert.deepEqual(byParticipant.newParticipantIds, ["pb"]);
    await updateEvent(v("cr"), event.id, input({ title: "T-creatore", participantIds: ["pa", "pb"] }));
    const byAdmin = await updateEvent(v("ad", "admin"), event.id, input({ title: "T-admin", participantIds: ["pb"] }));
    assert.deepEqual(byAdmin.newParticipantIds, []);
    assert.deepEqual(byAdmin.event.participants.map((p) => p.id), ["pb"]);
    await assert.rejects(updateEvent(v("cr", "membro", true), event.id, input()), ForbiddenError);
  });

  it("evento inesistente → NotFoundError 'Evento non trovato (forse è stato eliminato)'", async () => {
    await assert.rejects(
      updateEvent(v("cr"), "non-esiste", input()),
      (e: unknown) => e instanceof NotFoundError && e.message === "Evento non trovato (forse è stato eliminato)"
    );
    await assert.rejects(deleteEvent(v("cr"), "non-esiste"), NotFoundError);
  });

  it("deleteEvent: stessi permessi; elimina davvero", async () => {
    const { event } = await createEvent(v("cr"), input({ participantIds: ["pa"] }));
    await assert.rejects(deleteEvent(v("xx"), event.id), ForbiddenError);
    await assert.rejects(deleteEvent(v("cr", "membro", true), event.id), ForbiddenError);
    await deleteEvent(v("pa"), event.id);
    assert.equal(await prisma.calendarEvent.count({ where: { id: event.id } }), 0);
  });
});
