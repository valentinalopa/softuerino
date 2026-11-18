// VPN e Certificato Colibrì dall'app (F6 T3): /v1/vpn, /v1/vpn/{id}/config,
// /v1/security/cert-link e /api/cert/dl/{token}. Solo DB di prova in /tmp.
import { setRequest } from "./helpers/next-stubs";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, it } from "node:test";
import { prisma } from "../src/lib/prisma";
import { issueSessionToken } from "../src/lib/auth/session";
import { encryptSecret } from "../src/lib/crypto/secret-box";
import { GET as getVpn } from "../src/app/api/mobile/v1/vpn/route";
import { GET as getConfig } from "../src/app/api/mobile/v1/vpn/[id]/config/route";
import { POST as postCertLink } from "../src/app/api/mobile/v1/security/cert-link/route";
import { GET as getCertDl } from "../src/app/api/cert/dl/[token]/route";
import { GET as getCertWeb } from "../src/app/api/cert/[file]/route";
import { clearCertLinks, consumeCertLink, createCertLink, CERT_LINK_TTL_MS } from "../src/lib/cert-link";

const URL_BASE = "https://time.test/api/mobile/v1";
const req = (method: string, path: string, body?: unknown) =>
  new Request(`${URL_BASE}${path}`, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const idCtx = (id: string) => ({ params: Promise.resolve({ id }) });
const tokCtx = (token: string) => ({ params: Promise.resolve({ token }) });

async function makeUser(id: string, role = "membro") {
  return prisma.user.create({
    data: { id, name: `Nome ${id}`, email: `${id}@vpncert.test`, passwordHash: "x", role, active: true, employmentType: "dipendente" },
  });
}
async function login(userId: string) {
  const { token } = await issueSessionToken(userId, { authMethod: "oidc", client: "ios" });
  setRequest({ bearer: token });
}

describe("VPN e certificato dall'app", () => {
  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.impersonationLog.deleteMany();
    await prisma.vpnDownload.deleteMany();
    await prisma.vpnSection.deleteMany({ where: { name: { startsWith: "VC-" } } });
    await prisma.user.deleteMany({ where: { email: { endsWith: "@vpncert.test" } } });
    clearCertLinks();
    setRequest();
  });

  it("senza Bearer → 401 su tutte le route", async () => {
    assert.equal((await getVpn(req("GET", "/vpn"))).status, 401);
    assert.equal((await getConfig(req("GET", "/vpn/x/config"), idCtx("x"))).status, 401);
    assert.equal((await postCertLink(req("POST", "/security/cert-link", { file: "mobileconfig" }))).status, 401);
  });

  it("elenco profili e download: contenuto, registro VpnDownload, 404 se senza file", async () => {
    await makeUser("vc1");
    const s = await prisma.vpnSection.create({
      data: { name: "VC-uno", configFileName: "uno.ovpn", configEncrypted: encryptSecret("client\nremote x 1194\n") },
    });
    const vuota = await prisma.vpnSection.create({ data: { name: "VC-due" } });
    await login("vc1");

    const list = await getVpn(req("GET", "/vpn"));
    assert.equal(list.status, 200);
    const body = (await list.json()) as { profiles: { id: string; name: string; hasConfig: boolean }[] };
    const mine = body.profiles.filter((p) => p.name.startsWith("VC-"));
    assert.deepEqual(mine.map((p) => [p.name, p.hasConfig]), [["VC-due", false], ["VC-uno", true]]);
    assert.ok(!JSON.stringify(body).includes("remote x"), "il contenuto non è nell'elenco");

    const res = await getConfig(req("GET", `/vpn/${s.id}/config`), idCtx(s.id));
    assert.equal(res.status, 200);
    assert.equal(await res.text(), "client\nremote x 1194\n");
    assert.match(res.headers.get("content-disposition") ?? "", /uno\.ovpn/);
    assert.equal(await prisma.vpnDownload.count({ where: { vpnSectionId: s.id, userId: "vc1" } }), 1);

    assert.equal((await getConfig(req("GET", `/vpn/${vuota.id}/config`), idCtx(vuota.id))).status, 404);
    assert.equal((await getConfig(req("GET", "/vpn/nope/config"), idCtx("nope"))).status, 404);
  });

  it("\"vedi come\": download VPN → 403 e nessun registro; cert-link → 403", async () => {
    await makeUser("vca", "admin");
    await makeUser("vcm");
    const s = await prisma.vpnSection.create({
      data: { name: "VC-imp", configFileName: "i.ovpn", configEncrypted: encryptSecret("x") },
    });
    await login("vca");
    await prisma.session.updateMany({ where: { userId: "vca" }, data: { impersonatedUserId: "vcm" } });
    assert.equal((await getConfig(req("GET", `/vpn/${s.id}/config`), idCtx(s.id))).status, 403);
    assert.equal(await prisma.vpnDownload.count({ where: { vpnSectionId: s.id } }), 0);
    assert.equal((await postCertLink(req("POST", "/security/cert-link", { file: "mobileconfig" }))).status, 403);
  });

  it("cert-link: corpo non valido → 400; link valido scarica una volta, poi 410 (anche senza sessione)", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "certdir-"));
    await writeFile(path.join(dir, "colibri.mobileconfig"), "PROFILO-DI-PROVA");
    process.env.CERT_FILES_DIR = dir;
    await makeUser("vc2");
    await login("vc2");

    assert.equal((await postCertLink(req("POST", "/security/cert-link", { file: "../etc/passwd" }))).status, 400);
    assert.equal((await postCertLink(req("POST", "/security/cert-link", {}))).status, 400);

    const res = await postCertLink(req("POST", "/security/cert-link", { file: "mobileconfig" }));
    assert.equal(res.status, 200);
    const { url, expiresAt } = (await res.json()) as { url: string; expiresAt: string };
    assert.match(url, /^https:\/\/time\.colibrivision\.it\/api\/cert\/dl\/[A-Za-z0-9_-]{43}$/);
    const ms = new Date(expiresAt).getTime() - Date.now();
    assert.ok(ms > 4 * 60 * 1000 && ms <= 5 * 60 * 1000, `scadenza a 5 minuti (${ms} ms)`);

    setRequest(); // Safari: né cookie né Bearer
    const token = url.split("/").pop()!;
    const dl = await getCertDl(new Request(url), tokCtx(token));
    assert.equal(dl.status, 200);
    assert.equal(await dl.text(), "PROFILO-DI-PROVA");
    assert.match(dl.headers.get("content-disposition") ?? "", /Certificato-Colibri-Vision\.mobileconfig/);
    assert.equal((await getCertDl(new Request(url), tokCtx(token))).status, 410, "riuso → 410");
    assert.equal((await getCertDl(new Request(url), tokCtx("sconosciuto"))).status, 410);
  });

  it("link scaduto → 410; file mancante → 404 e il link resta utilizzabile", async () => {
    const t0 = Date.now();
    const { token } = createCertLink("colibri.mobileconfig", "u", t0);
    assert.equal(consumeCertLink(token, t0 + CERT_LINK_TTL_MS + 1), null);
    const dir = await mkdtemp(path.join(os.tmpdir(), "certdir-"));
    process.env.CERT_FILES_DIR = dir; // vuota
    const { token: t2 } = createCertLink("colibri.mobileconfig", "u");
    assert.equal((await getCertDl(new Request("https://time.test/x"), tokCtx(t2))).status, 404);
    await writeFile(path.join(dir, "colibri.mobileconfig"), "ok");
    assert.equal((await getCertDl(new Request("https://time.test/x"), tokCtx(t2))).status, 200);
  });

  it("la route web /api/cert/[file] resta con login: senza sessione 401", async () => {
    setRequest();
    const res = await getCertWeb(new Request("https://time.test/api/cert/colibri.mobileconfig"), {
      params: Promise.resolve({ file: "colibri.mobileconfig" }),
    });
    assert.equal(res.status, 401);
  });
});
