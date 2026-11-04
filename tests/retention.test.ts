// Eseguire con un DB di prova (mai quello di produzione):
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/t.db npx tsx --test tests/retention.test.ts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { applyRetention, computeRetention, nextDeactivatedAt } from "../src/lib/retention";

const NOW = new Date("2026-11-03T04:10:00Z");
const yearsAgo = (y: number, extraDays = 0) => {
  const d = new Date(NOW);
  d.setUTCFullYear(d.getUTCFullYear() - y);
  d.setUTCDate(d.getUTCDate() - extraDays);
  return d;
};

async function makeUser(id: string, data: { active: boolean; deactivatedAt?: Date | null; role?: string }) {
  return prisma.user.create({
    data: {
      id,
      name: `Nome ${id}`,
      email: `${id}@example.test`,
      passwordHash: "x",
      role: data.role ?? "membro",
      active: data.active,
      deactivatedAt: data.deactivatedAt ?? null,
    },
  });
}

async function addData(userId: string, clientId: string, date: Date) {
  await prisma.leaveRequest.create({
    data: { userId, type: "malattia", startDate: date, endDate: date, status: "registrata", note: "n" },
  });
  await prisma.presenceEntry.create({ data: { userId, date, slot: "mattina", mode: "ufficio" } });
  await prisma.timeEntry.create({ data: { userId, clientId, date, hours: 2, description: "lavoro" } });
}

describe("nextDeactivatedAt", () => {
  it("riattivazione → null (Review Focus 2)", () => {
    assert.equal(nextDeactivatedAt(true, { active: false, deactivatedAt: yearsAgo(3) }, NOW), null);
  });
  it("disattivazione di un utente attivo → adesso", () => {
    assert.equal(nextDeactivatedAt(false, { active: true, deactivatedAt: null }, NOW), NOW);
  });
  it("già disattivato: la data resta quella originale", () => {
    const d = yearsAgo(2);
    assert.equal(nextDeactivatedAt(false, { active: false, deactivatedAt: d }, NOW), d);
  });
  it("disattivato senza data → adesso", () => {
    assert.equal(nextDeactivatedAt(false, { active: false, deactivatedAt: null }, NOW), NOW);
  });
});

describe("conservazione", () => {
  before(async () => {
    const client = await prisma.client.create({ data: { name: "Cliente prova" } });
    // Scaduto: disattivato da 10 anni e 1 giorno.
    await makeUser("scaduto", { active: false, deactivatedAt: yearsAgo(10, 1) });
    // Non scaduto: disattivato da 9 anni.
    await makeUser("recente", { active: false, deactivatedAt: yearsAgo(9) });
    // Attivo con dati di 11 anni fa (Review Focus 4), anche admin.
    await makeUser("attivo", { active: true });
    await makeUser("admin", { active: true, role: "admin" });
    // Migrazione: disattivato "oggi", non scaduto (Review Focus 3).
    await makeUser("migrato", { active: false, deactivatedAt: NOW });
    for (const id of ["scaduto", "recente", "attivo", "admin", "migrato"]) {
      await addData(id, client.id, yearsAgo(11));
    }
    await prisma.session.create({
      data: { userId: "scaduto", token: "tok", expiresAt: NOW },
    });
    await prisma.accountRequest.create({
      data: { firstName: "A", lastName: "B", email: "vecchia@example.test", status: "pending", createdAt: yearsAgo(1, 1) },
    });
    await prisma.accountRequest.create({
      data: { firstName: "C", lastName: "D", email: "rifiutata@example.test", status: "rejected", createdAt: yearsAgo(1, 1) },
    });
    await prisma.accountRequest.create({
      data: { firstName: "E", lastName: "F", email: "approvata@example.test", status: "done", createdAt: yearsAgo(2) },
    });
    await prisma.accountRequest.create({
      data: { firstName: "G", lastName: "H", email: "nuova@example.test", status: "pending", createdAt: NOW },
    });
  });

  it("computeRetention: solo scaduto e richieste non approvate vecchie", async () => {
    const r = await computeRetention(NOW);
    assert.deepEqual(r.expiredUserIds, ["scaduto"]);
    assert.equal(r.expiredAccountRequestIds.length, 2);
  });

  it("dry-run: conteggi > 0 ma nessuna riga cambia (Review Focus 5)", async () => {
    const before = await Promise.all([prisma.user.count(), prisma.leaveRequest.count(), prisma.accountRequest.count()]);
    const r = await applyRetention(NOW, false);
    assert.deepEqual(r, { users: 1, accountRequests: 2, tasks: 0, applied: false });
    const after = await Promise.all([prisma.user.count(), prisma.leaveRequest.count(), prisma.accountRequest.count()]);
    assert.deepEqual(after, before);
    const u = await prisma.user.findUniqueOrThrow({ where: { id: "scaduto" } });
    assert.equal(u.email, "scaduto@example.test");
  });

  it("apply: anonimizza solo l'utente scaduto e cancella le richieste vecchie", async () => {
    const r = await applyRetention(NOW, true);
    assert.deepEqual(r, { users: 1, accountRequests: 2, tasks: 0, applied: true });

    const u = await prisma.user.findUniqueOrThrow({ where: { id: "scaduto" }, omit: { passwordHash: false } });
    assert.equal(u.name, "Utente rimosso");
    assert.equal(u.email, "rimosso-scaduto@invalid");
    assert.equal(u.oidcSubject, null);
    assert.notEqual(u.passwordHash, "x");
    assert.equal(u.active, false);
    assert.equal(await prisma.leaveRequest.count({ where: { userId: "scaduto" } }), 0);
    assert.equal(await prisma.presenceEntry.count({ where: { userId: "scaduto" } }), 0);
    assert.equal(await prisma.session.count({ where: { userId: "scaduto" } }), 0);
    // Le ore restano, legate all'utente anonimizzato.
    assert.equal(await prisma.timeEntry.count({ where: { userId: "scaduto" } }), 1);

    for (const id of ["recente", "attivo", "admin", "migrato"]) {
      const other = await prisma.user.findUniqueOrThrow({ where: { id } });
      assert.equal(other.email, `${id}@example.test`, `${id} non va toccato`);
      assert.equal(await prisma.leaveRequest.count({ where: { userId: id } }), 1, `${id}: assenze intatte`);
      assert.equal(await prisma.presenceEntry.count({ where: { userId: id } }), 1, `${id}: presenze intatte`);
    }
    const left = await prisma.accountRequest.findMany({ select: { email: true }, orderBy: { email: "asc" } });
    assert.deepEqual(left.map((x) => x.email), ["approvata@example.test", "nuova@example.test"]);
  });

  it("seconda esecuzione: niente da fare (idempotente)", async () => {
    assert.deepEqual(await applyRetention(NOW, true), { users: 0, accountRequests: 0, tasks: 0, applied: true });
  });
});
