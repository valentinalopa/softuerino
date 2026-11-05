// Copertura OpenAPI: ogni route sotto src/app/api/mobile deve essere in
// openapi/mobile-v1.yaml (stesso metodo) e viceversa. Nessun DB.
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, it } from "node:test";

const ROOT = resolve("src/app/api/mobile");
const spec = readFileSync(resolve("openapi/mobile-v1.yaml"), "utf8");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

// route reali: "METODO /percorso"
const real = walk(ROOT)
  .filter((f) => /\/route\.ts$/.test(f))
  .flatMap((f) => {
    const path = "/" + relative(ROOT, f).replace(/\/route\.ts$/, "");
    const src = readFileSync(f, "utf8");
    return [...src.matchAll(/export (?:const|async function) (GET|POST|PUT|PATCH|DELETE)\b/g)].map(
      (m) => `${m[1]} ${path}`
    );
  })
  .sort();

// route documentate: sezione `paths:` con chiavi a 2 spazi e metodi a 4 spazi
function documented(): string[] {
  const out: string[] = [];
  let path = "";
  let inPaths = false;
  for (const line of spec.split("\n")) {
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (inPaths && /^\S/.test(line)) break;
    if (!inPaths) continue;
    const p = line.match(/^ {2}(\/\S*):\s*$/);
    if (p) { path = p[1]; continue; }
    const m = line.match(/^ {4}(get|post|put|patch|delete):\s*$/);
    if (m && path) out.push(`${m[1].toUpperCase()} ${path}`);
  }
  return out.sort();
}

describe("OpenAPI mobile v1", () => {
  it("ogni route mobile è documentata e non ci sono route documentate inesistenti", () => {
    assert.deepEqual(documented(), real);
  });

  it("descrive superAdminActive, schema Error e la prova automatica dei percorsi", () => {
    assert.match(spec, /superAdminActive:/);
    assert.match(spec, /\n {4}Error:/);
    assert.match(spec, /time\.local\.colibrivision\.it/);
    assert.match(spec, /time\.colibrivision\.it/);
    assert.match(spec, /cambia la rete/);
  });
});
