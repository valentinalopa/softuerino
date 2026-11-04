// Archivio dei task (fase W1). Usa un DB di prova SUO (mai quello di produzione,
// e diverso da quello di retention.test.ts: i file di test girano in parallelo):
//   DATABASE_URL=file:/tmp/softuerino-test/archivio.db npx prisma migrate deploy
//   DATABASE_URL=file:/tmp/softuerino-test/archivio.db npx tsx --test tests/task-archive.test.ts
import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { applyRetention } from "../src/lib/retention";
import { hasProjectManagerRole } from "../src/lib/project-manager";
import {
  archiveScope,
  canViewTaskArchive,
  ForbiddenError,
  listArchivedTasks,
  purgeTaskArchive,
  type ArchiveViewer,
} from "../src/lib/task-archive";

const NOW = new Date("2026-11-03T04:10:00Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

const viewer = (id: string, role = "membro", projectManager = false): ArchiveViewer => ({ id, role, projectManager });

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({ data: { id, name: id, email: `${id}@example.test`, passwordHash: "x", role } });
}

async function makeTask(id: string, completedDaysAgo: number | null, assigneeIds: string[]) {
  return prisma.task.create({
    data: {
      id,
      title: id,
      status: completedDaysAgo === null ? "in_progress" : "done",
      completedAt: completedDaysAgo === null ? null : daysAgo(completedDaysAgo),
      assignees: { create: assigneeIds.map((userId) => ({ userId })) },
    },
  });
}

const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort();

describe("task archiviati: visibilità e svuotamento", () => {
  let itId = "";
  let comId = "";

  before(async () => {
    for (const id of ["resp-it", "resp-com", "membro-it", "membro-com", "membro-solo", "arch-admin", "super", "pm"]) {
      await makeUser(id, id === "arch-admin" ? "admin" : id === "super" ? "super_admin" : "membro");
    }
    const it_ = await prisma.department.create({ data: { name: "IT" } });
    const com = await prisma.department.create({ data: { name: "COM" } });
    itId = it_.id;
    comId = com.id;
    const link = (userId: string, departmentId: string, isManager = false) =>
      prisma.userDepartment.create({ data: { userId, departmentId, isManager } });
    await link("resp-it", itId, true);
    await link("membro-it", itId);
    await link("resp-com", comId, true);
    await link("membro-com", comId);

    await makeTask("it-vecchio", 31, ["membro-it"]);
    await makeTask("com-vecchio", 31, ["membro-com"]);
    await makeTask("misto-vecchio", 40, ["membro-it", "membro-com"]);
    await makeTask("senza-reparto-vecchio", 45, ["membro-solo"]);
    await makeTask("it-recente", 29, ["membro-it"]);
    await makeTask("it-attivo", null, ["membro-it"]);
  });

  it("membro: nessun accesso (ForbiddenError, status 403)", async () => {
    const scope = archiveScope(viewer("membro-it"), []);
    assert.equal(canViewTaskArchive(scope), false);
    await assert.rejects(listArchivedTasks(viewer("membro-it"), [], {}, NOW), (e: unknown) => {
      assert.ok(e instanceof ForbiddenError);
      assert.equal(e.status, 403);
      return true;
    });
  });

  it("responsabile IT: vede solo i task con un assegnatario nei suoi reparti", async () => {
    const rows = await listArchivedTasks(viewer("resp-it"), [itId], {}, NOW);
    assert.deepEqual(ids(rows), ["it-vecchio", "misto-vecchio"]);
  });

  it("responsabile COM: non vede i task di IT né quelli senza reparto", async () => {
    const rows = await listArchivedTasks(viewer("resp-com"), [comId], {}, NOW);
    assert.deepEqual(ids(rows), ["com-vecchio", "misto-vecchio"]);
    assert.ok(!ids(rows).includes("it-vecchio"));
    assert.ok(!ids(rows).includes("senza-reparto-vecchio"));
  });

  it("i filtri per persona e cliente restano dentro l'ambito del responsabile", async () => {
    const rows = await listArchivedTasks(viewer("resp-it"), [itId], { userId: "membro-com" }, NOW);
    assert.deepEqual(ids(rows), ["misto-vecchio"]);
  });

  it("admin, super admin e project manager: vedono tutto l'archivio", async () => {
    const all = ["com-vecchio", "it-vecchio", "misto-vecchio", "senza-reparto-vecchio"];
    for (const v of [viewer("arch-admin", "admin"), viewer("super", "super_admin"), viewer("pm", "membro", true)]) {
      assert.deepEqual(ids(await listArchivedTasks(v, [], {}, NOW)), all, v.id);
    }
  });

  it("task fatto da 31 giorni: in archivio; da 29: non c'è (resta tra i completati); attivo: non c'è", async () => {
    const rows = ids(await listArchivedTasks(viewer("arch-admin", "admin"), [], {}, NOW));
    assert.ok(rows.includes("it-vecchio"));
    assert.ok(!rows.includes("it-recente"));
    assert.ok(!rows.includes("it-attivo"));
  });

  it("svuotare l'archivio: admin e membro → 403, nessun task cancellato", async () => {
    for (const role of ["admin", "membro"]) {
      await assert.rejects(purgeTaskArchive({ role }, NOW), ForbiddenError, role);
    }
    assert.equal(await prisma.task.count(), 6);
  });

  it("svuotare l'archivio: super admin → cancella solo gli archiviati", async () => {
    assert.equal(await purgeTaskArchive({ role: "super_admin" }, NOW), 4);
    assert.deepEqual(ids(await prisma.task.findMany({ select: { id: true } })), ["it-attivo", "it-recente"]);
  });
});

describe("task: eliminazione dopo 365 giorni (retention)", () => {
  before(async () => {
    await makeUser("assegnatario");
    await makeTask("fatto-364", 364, ["assegnatario"]);
    await makeTask("fatto-366", 366, ["assegnatario"]);
    await makeTask("fatto-400-senza-assegnatari", 400, []);
    await makeTask("attivo-vecchio", null, ["assegnatario"]);
  });

  it("dry-run: conta ma non cancella", async () => {
    const before = await prisma.task.count();
    const r = await applyRetention(NOW, false);
    assert.equal(r.tasks, 2);
    assert.equal(r.applied, false);
    assert.equal(await prisma.task.count(), before);
  });

  it("apply: 366 giorni → eliminato; 364 e task attivi → ancora presenti", async () => {
    const r = await applyRetention(NOW, true);
    assert.equal(r.tasks, 2);
    const left = ids(await prisma.task.findMany({ select: { id: true } }));
    assert.ok(!left.includes("fatto-366"));
    assert.ok(!left.includes("fatto-400-senza-assegnatari"));
    assert.ok(left.includes("fatto-364"));
    assert.ok(left.includes("attivo-vecchio"));
    // Le assegnazioni dei task eliminati spariscono con il task.
    assert.equal(await prisma.taskAssignee.count({ where: { taskId: "fatto-366" } }), 0);
  });

  it("seconda esecuzione: niente da fare", async () => {
    assert.equal((await applyRetention(NOW, true)).tasks, 0);
  });
});

describe("project manager da Keycloak (claim softuerino_roles)", () => {
  it("ruolo presente → project manager", () => {
    assert.equal(hasProjectManagerRole({ softuerino_roles: ["project-manager"] }), true);
    assert.equal(hasProjectManagerRole({ softuerino_roles: ["altro", "project-manager"] }), true);
  });
  it("ruolo assente, claim assente o non valido → falso", () => {
    assert.equal(hasProjectManagerRole({ softuerino_roles: ["altro"] }), false);
    assert.equal(hasProjectManagerRole({ softuerino_roles: [] }), false);
    assert.equal(hasProjectManagerRole({}), false);
    assert.equal(hasProjectManagerRole({ softuerino_roles: "project-manager" }), false);
    assert.equal(hasProjectManagerRole({ softuerino_roles: [42, null] }), false);
  });
  it("un gruppo 'project-manager' in groups non dà nessun effetto", () => {
    assert.equal(hasProjectManagerRole({ groups: ["/project-manager", "project-manager"] }), false);
  });
  it("un responsabile senza il gruppo non è project manager (ambito = solo i suoi reparti)", () => {
    assert.deepEqual(archiveScope(viewer("x"), ["r1"]), { kind: "departments", departmentIds: ["r1"] });
    assert.deepEqual(archiveScope(viewer("x", "membro", true), []), { kind: "all" });
  });
});
