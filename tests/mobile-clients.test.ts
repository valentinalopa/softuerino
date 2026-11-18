// Clienti dell'app: service (src/lib/services/clients.ts) e route /v1/clients. Solo DB di prova in /tmp:
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-clients.test.ts
import { setRequest } from "./helpers/next-stubs";
import { cacheCalls, resetCacheCalls } from "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getClients, POST as postClient } from "../src/app/api/mobile/v1/clients/route";
import { canCreateClient } from "../src/lib/services/clients";

const URL_BASE = "https://time.test/api/mobile/v1";
const send = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@clients.test`, passwordHash: "x", role, active: true },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}
// Il permesso "Aggiungere clienti" ai membri (Ruoli e permessi).
async function grantClientsToMembers() {
  await prisma.permissionSettings.upsert({
    where: { id: 1 },
    create: { id: 1, rules: JSON.stringify({ clienti: { membro: "tutti" } }) },
    update: { rules: JSON.stringify({ clienti: { membro: "tutti" } }) },
  });
}

describe("clienti dell'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.permissionSettings.deleteMany();
    await prisma.client.updateMany({ where: { parentId: { not: null } }, data: { parentId: null } });
    await prisma.client.deleteMany({ where: { name: { startsWith: "CT-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@clients.test" } } });
    setRequest();
    resetCacheCalls();
  });

  it("senza Bearer le route rispondono 401 JSON", async () => {
    for (const res of [await getClients(send("GET", "/clients")), await postClient(send("POST", "/clients", {}))]) {
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error, "unauthorized");
    }
  });

  it("membro senza permesso: GET → 403, POST → 403 e nessun cliente creato", async () => {
    await makeUser("ctc1");
    await login("ctc1");
    assert.equal((await getClients(send("GET", "/clients"))).status, 403);
    assert.equal((await postClient(send("POST", "/clients", { name: "CT-no" }))).status, 403);
    assert.equal(await prisma.client.count({ where: { name: "CT-no" } }), 0);
    assert.equal(await canCreateClient({ id: "ctc1", role: "membro" }), false);
  });

  it("utente con il permesso: GET → 200 con voci sotto il padre; POST semplice → 201", async () => {
    await grantClientsToMembers();
    await makeUser("ctc2");
    const padre = await prisma.client.create({ data: { name: "CT-Padre" } });
    await prisma.client.create({ data: { name: "CT-Voce", parentId: padre.id, categories: "it_design,produzione" } });
    await login("ctc2");
    const list = await getClients(send("GET", "/clients"));
    assert.equal(list.status, 200);
    const { clients } = await list.json();
    const mine = clients.filter((c: { name: string }) => c.name.startsWith("CT-"));
    assert.deepEqual(mine.map((c: { name: string }) => c.name), ["CT-Padre", "CT-Voce"]);
    assert.equal(mine[0].childrenCount, 1);
    assert.equal(mine[1].parent.name, "CT-Padre");
    assert.deepEqual(mine[1].categories, ["it_design", "produzione"]);

    const res = await postClient(send("POST", "/clients", { name: "  CT-Nuovo  ", categories: ["comunicazione"] }));
    assert.equal(res.status, 201);
    const { client } = await res.json();
    assert.equal(client.name, "CT-Nuovo");
    assert.deepEqual(client.categories, ["comunicazione"]);
    assert.equal(client.parent, null);
    assert.ok(cacheCalls.revalidated.includes("/clienti"));
    assert.equal(await canCreateClient({ id: "ctc2", role: "membro" }), true);
  });

  it("utente con il permesso: POST con parent o loggers → 403, nessuna riga scritta", async () => {
    await grantClientsToMembers();
    await makeUser("ctc3");
    const padre = await prisma.client.create({ data: { name: "CT-P3" } });
    await login("ctc3");
    assert.equal((await postClient(send("POST", "/clients", { name: "CT-conparent", parentId: padre.id }))).status, 403);
    assert.equal((await postClient(send("POST", "/clients", { name: "CT-conlog", loggerIds: ["ctc3"] }))).status, 403);
    assert.equal(await prisma.client.count({ where: { name: { in: ["CT-conparent", "CT-conlog"] } } }), 0);
  });

  it("admin: POST con parent e loggers → 201", async () => {
    await makeUser("cta1", "admin");
    await makeUser("ctc4");
    const padre = await prisma.client.create({ data: { name: "CT-P4" } });
    await login("cta1");
    const res = await postClient(send("POST", "/clients", { name: "CT-Figlio", parentId: padre.id, loggerIds: ["ctc4"] }));
    assert.equal(res.status, 201);
    const { client } = await res.json();
    assert.equal(client.parent.id, padre.id);
    assert.deepEqual(client.loggers.map((l: { id: string }) => l.id), ["ctc4"]);
  });

  it("admin: padre che è già una voce, persona inesistente, categoria non valida → 400", async () => {
    await makeUser("cta2", "admin");
    const padre = await prisma.client.create({ data: { name: "CT-P5" } });
    const voce = await prisma.client.create({ data: { name: "CT-V5", parentId: padre.id } });
    await login("cta2");
    for (const body of [
      { name: "CT-x1", parentId: voce.id },
      { name: "CT-x2", parentId: "non-esiste" },
      { name: "CT-x3", loggerIds: ["non-esiste"] },
      { name: "CT-x4", categories: ["boh"] },
    ]) {
      assert.equal((await postClient(send("POST", "/clients", body))).status, 400, JSON.stringify(body));
    }
  });

  it("nome vuoto → 400; nome duplicato → 409 (messaggio storico)", async () => {
    await makeUser("cta3", "admin");
    await prisma.client.create({ data: { name: "CT-Dup" } });
    await login("cta3");
    assert.equal((await postClient(send("POST", "/clients", { name: "   " }))).status, 400);
    const res = await postClient(send("POST", "/clients", { name: "CT-Dup" }));
    assert.equal(res.status, 409);
    assert.equal((await res.json()).message, "Esiste già un cliente con questo nome");
  });

  it("impersonificazione: lettura sì, scrittura → 403", async () => {
    await makeUser("cta4", "admin");
    await makeUser("ctc5");
    await login("cta4");
    await prisma.session.updateMany({ where: { userId: "cta4" }, data: { impersonatedUserId: "ctc5" } });
    // l'utente effettivo è il membro: senza permesso nemmeno la lettura
    assert.equal((await getClients(send("GET", "/clients"))).status, 403);
    await grantClientsToMembers();
    assert.equal((await getClients(send("GET", "/clients"))).status, 200);
    assert.equal((await postClient(send("POST", "/clients", { name: "CT-imp" }))).status, 403);
    assert.equal(await prisma.client.count({ where: { name: "CT-imp" } }), 0);
  });
});
