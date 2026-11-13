// Organigramma e profilo dell'app: route /v1/org e campi nuovi di /v1/me. Solo DB di prova in /tmp:
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx prisma db push
//   DATABASE_URL=file:/tmp/softuerino-test/<nuovo>.db npx tsx --test tests/mobile-org.test.ts
import { setRequest } from "./helpers/next-stubs";
import "./helpers/next-cache-stub";
import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { GET as getOrg } from "../src/app/api/mobile/v1/org/route";
import { GET as getMe } from "../src/app/api/mobile/v1/me/route";

const req = (path: string) => new Request(`https://time.test/api/mobile/v1${path}`);

async function makeUser(id: string, extra: Record<string, unknown> = {}) {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@org.test`, passwordHash: "x", role: "membro", active: true, ...extra },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}

describe("organigramma e /me dell'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.permissionSettings.deleteMany();
    await prisma.userDepartment.deleteMany({ where: { department: { name: { startsWith: "OT-" } } } });
    await prisma.license.deleteMany({ where: { name: { startsWith: "OT-" } } });
    await prisma.department.deleteMany({ where: { name: { startsWith: "OT-" } } });
    setRequest();
  });

  it("/org senza Bearer → 401", async () => {
    assert.equal((await getOrg(req("/org"))).status, 401);
  });

  it("/org: struttura con managers, people e children; nessun id/email di persona", async () => {
    const top = await prisma.department.create({ data: { name: "OT-Top" } });
    const sub = await prisma.department.create({ data: { name: "OT-Sub" } });
    const boss = await makeUser("ot-boss", { reportsTo: "" });
    const staff = await makeUser("ot-staff", { reportsTo: "OT-Top" });
    await prisma.userDepartment.create({ data: { userId: boss.id, departmentId: top.id, isManager: true } });
    await prisma.userDepartment.create({ data: { userId: staff.id, departmentId: sub.id, isManager: false } });
    await makeUser("ot-viewer");
    await login("ot-viewer");
    const res = await getOrg(req("/org"));
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.ok(!text.includes("@org.test"));
    const { tree } = JSON.parse(text);
    type Node = {
      name: string;
      managers: string[];
      people: { name: string; isManager: boolean }[];
      children: Node[];
    };
    const find = (nodes: Node[], name: string): Node | null => {
      for (const n of nodes) {
        if (n.name === name) return n;
        const f = find(n.children, name);
        if (f) return f;
      }
      return null;
    };
    const topNode = find(tree, "OT-Top");
    assert.ok(topNode);
    if (!topNode) return;
    assert.deepEqual(topNode.managers, ["Nome ot-boss"]);
    assert.ok(topNode.people.some((p) => p.name === "Nome ot-boss" && p.isManager));
    assert.ok(topNode.children.some((c) => c.name === "OT-Sub"));
  });

  it("/me di un membro: capabilities tutte false, projectManager false, reportsTo vuoto", async () => {
    await makeUser("ot-m1");
    await login("ot-m1");
    const body = await (await getMe(req("/me"))).json();
    assert.deepEqual(body.capabilities, { taskArchive: false, clientsView: false, clientsCreate: false, licensesView: false });
    assert.equal(body.projectManager, false);
    assert.deepEqual(body.reportsTo, []);
  });

  it("/me: reportsTo separato in nomi; permesso clienti → clientsView/Create; licenza visibile a tutti → licensesView", async () => {
    await makeUser("ot-m2", { reportsTo: "OT-A, OT-B" });
    await prisma.permissionSettings.create({ data: { id: 1, rules: JSON.stringify({ clienti: { membro: "tutti" } }) } });
    const dept = await prisma.department.create({ data: { name: "OT-Lic" } });
    await prisma.license.create({ data: { name: "OT-lic", departmentId: dept.id, visibleToAll: true } });
    await login("ot-m2");
    const body = await (await getMe(req("/me"))).json();
    assert.deepEqual(body.reportsTo, ["OT-A", "OT-B"]);
    assert.equal(body.capabilities.clientsView, true);
    assert.equal(body.capabilities.clientsCreate, true);
    assert.equal(body.capabilities.licensesView, true);
    assert.equal(body.capabilities.taskArchive, false);
  });

  it("/me di un project manager: taskArchive true; di un responsabile di reparto: taskArchive true", async () => {
    await makeUser("ot-pm", { projectManager: true });
    await login("ot-pm");
    assert.equal((await (await getMe(req("/me"))).json()).capabilities.taskArchive, true);
    assert.equal((await (await getMe(req("/me"))).json()).projectManager, true);

    const dept = await prisma.department.create({ data: { name: "OT-Resp" } });
    const resp = await makeUser("ot-resp");
    await prisma.userDepartment.create({ data: { userId: resp.id, departmentId: dept.id, isManager: true } });
    await login("ot-resp");
    assert.equal((await (await getMe(req("/me"))).json()).capabilities.taskArchive, true);
  });

  it("/me di un admin: archivio e clienti veri", async () => {
    await makeUser("ot-adm");
    await prisma.user.update({ where: { id: "ot-adm" }, data: { role: "admin" } });
    await login("ot-adm");
    const c = (await (await getMe(req("/me"))).json()).capabilities;
    assert.equal(c.taskArchive, true);
    assert.equal(c.clientsView, true);
  });
});
