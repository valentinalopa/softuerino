// Superficie dell'API mobile: fissa quali route esistono sotto /api/mobile e che
// non espongano le funzioni da super admin (Email/SMTP, Aggiornamenti, Ruoli, VPN,
// impersonificazione) né il login con password. Se si aggiunge una route mobile,
// questo test obbliga a rivedere l'elenco. Nessun DB.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

const ROOT = resolve("src/app/api/mobile");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const files = walk(ROOT).filter((f) => !/\.bak/.test(f));
const routes = files
  .filter((f) => /\/route\.ts$/.test(f))
  .map((f) => "/" + relative(ROOT, f).replace(/\/route\.ts$/, ""))
  .sort();

describe("superficie dell'API mobile", () => {
  it("le route mobili sono solo quelle attese (aggiornare qui con consapevolezza)", () => {
    assert.deepEqual(routes, [
      "/v1/auth/logout",
      "/v1/auth/token",
      "/v1/balance",
      "/v1/calendar",
      "/v1/calendar/upcoming",
      "/v1/clients",
      "/v1/events",
      "/v1/events/[id]",
      "/v1/leave-requests",
      "/v1/leave-requests/[id]",
      "/v1/licenses",
      "/v1/licenses/[id]",
      "/v1/licenses/[id]/reveal",
      "/v1/me",
      "/v1/presence",
      "/v1/presence/[date]",
      "/v1/recovery-credits",
      "/v1/tasks",
      "/v1/tasks/[id]",
      "/v1/tasks/[id]/status",
      "/v1/tasks/options",
      "/v1/team-calendar",
      "/v1/time",
      "/v1/time/[date]",
      "/v1/time/clients",
    ]);
  });

  it("nessun percorso mobile per Email/SMTP, Aggiornamenti, Ruoli, VPN, impersonificazione, password locale", () => {
    const forbidden = /email|smtp|aggiornament|update|system|ruoli|roles|vpn|impersona|password|login|settings|impostazion|cron|delete/i;
    // v1/auth/token è il login con codice PKCE (Keycloak), non il login con password.
    const offenders = routes.filter((r) => forbidden.test(r) && r !== "/v1/auth/token");
    assert.deepEqual(offenders, []);
  });

  it("le route mobili non importano azioni da super admin, login con password o impersonificazione", () => {
    const forbiddenImports =
      /requireSuperAdmin|loginAction|setImpersonation|startImpersonation|deleteUser|lib\/email|lib\/system|lib\/roles|lib\/vpn|softuerino-aggiorna/;
    for (const file of files.filter((f) => /\.tsx?$/.test(f))) {
      assert.ok(!forbiddenImports.test(readFileSync(file, "utf8")), `${file} importa qualcosa di vietato`);
    }
    // anche gli helper mobili in src/lib/mobile
    for (const file of walk(resolve("src/lib/mobile")).filter((f) => /\.tsx?$/.test(f) && !/\.bak/.test(f))) {
      assert.ok(!forbiddenImports.test(readFileSync(file, "utf8")), `${file} importa qualcosa di vietato`);
    }
  });

  it("ogni route mobile (tranne /v1/auth/token, pubblico per definizione) passa da withMobileAuth", () => {
    for (const file of files.filter((f) => /\/route\.ts$/.test(f))) {
      const route = "/" + relative(ROOT, file).replace(/\/route\.ts$/, "");
      if (route === "/v1/auth/token") continue;
      assert.match(readFileSync(file, "utf8"), /withMobileAuth(?:<[^>]*>)?\(/, `${route} senza withMobileAuth`);
    }
  });
});
