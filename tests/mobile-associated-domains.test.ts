// Redirect HTTPS del login mobile: file Associated Domains, pagina di callback e
// esenzione dal login nel proxy. Non usa il database.
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { proxy } from "../src/proxy";
import { GET as getAasa } from "../src/app/.well-known/apple-app-site-association/route";
import { GET as getCallback } from "../src/app/mobile/oauth/callback/route";

const APP_ID = "ABCDE12345.it.colibrivision.softuerino";
const original = process.env.MOBILE_APPLE_APP_ID;

afterEach(() => {
  if (original === undefined) delete process.env.MOBILE_APPLE_APP_ID;
  else process.env.MOBILE_APPLE_APP_ID = original;
});

describe("apple-app-site-association", () => {
  it("senza MOBILE_APPLE_APP_ID → 404", async () => {
    delete process.env.MOBILE_APPLE_APP_ID;
    assert.equal(getAasa().status, 404);
  });

  it("app id con formato non valido → 404", () => {
    for (const bad of ["", "softuerino", "abc.it.colibrivision.softuerino", `${APP_ID}"}`, "ABCDE12345."]) {
      process.env.MOBILE_APPLE_APP_ID = bad;
      assert.equal(getAasa().status, 404, bad);
    }
  });

  it("con l'app id: JSON, cache pubblica 1 ora, webcredentials e applinks solo sul callback", async () => {
    process.env.MOBILE_APPLE_APP_ID = APP_ID;
    const res = getAasa();
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/json");
    assert.equal(res.headers.get("cache-control"), "public, max-age=3600");
    assert.equal(res.headers.get("location"), null);
    assert.deepEqual(await res.json(), {
      webcredentials: { apps: [APP_ID] },
      applinks: { details: [{ appIDs: [APP_ID], components: [{ "/": "/mobile/oauth/callback" }] }] },
    });
  });
});

describe("pagina /mobile/oauth/callback", () => {
  it("HTML statico, no-store, no-referrer, senza script né testo di code/state", async () => {
    const res = getCallback();
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/);
    assert.equal(res.headers.get("cache-control"), "no-store");
    assert.equal(res.headers.get("referrer-policy"), "no-referrer");
    const html = await res.text();
    assert.match(html, /Torna all'app Softuerino/);
    assert.doesNotMatch(html, /<script|location|code|state/i);
  });

  it("la route non legge la richiesta (nessun parametro in ingresso)", () => {
    assert.equal(getCallback.length, 0);
  });
});

describe("proxy: solo due percorsi esatti sono aperti", () => {
  const open = ["/mobile/oauth/callback", "/.well-known/apple-app-site-association"];
  const closed = [
    "/mobile",
    "/mobile/oauth",
    "/mobile/oauth/callback/x",
    "/mobile/oauth/callbackx",
    "/.well-known",
    "/.well-known/apple-app-site-association/x",
    "/.well-known/assetlinks.json",
  ];

  it("senza cookie i due percorsi non vengono reindirizzati e non ricevono l'header del Bearer", () => {
    for (const path of open) {
      const res = proxy(new NextRequest(`https://time.test${path}`));
      assert.equal(res.headers.get("location"), null, path);
      assert.equal(res.headers.get("x-middleware-request-x-softuerino-mobile"), null, path);
    }
  });

  it("con query (code/state) i due percorsi restano aperti", () => {
    const res = proxy(new NextRequest("https://time.test/mobile/oauth/callback?code=a&state=b"));
    assert.equal(res.headers.get("location"), null);
  });

  it("ogni altro percorso simile viene reindirizzato a /login", () => {
    for (const path of closed) {
      const res = proxy(new NextRequest(`https://time.test${path}`));
      assert.equal(res.status, 307, path);
      assert.match(res.headers.get("location") ?? "", /\/login$/, path);
    }
  });
});
