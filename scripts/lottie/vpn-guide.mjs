// Genera le animazioni Lottie della guida VPN (Utilità → VPN), una per
// dispositivo: public/lottie/vpn-{ios,android,macos,windows}.json.
//
//   node scripts/lottie/vpn-guide.mjs
//
// Solo forme (niente testo né immagini): il player "light" di lottie-web le
// disegna senza eval, compatibile con la CSP dell'app. Quattro scene da 3 s,
// una per passo della guida (STEP_FRAMES nella pagina deve restare allineato):
//   1. installa l'app   2. scarica la configurazione
//   3. importala nell'app   4. accedi e collegati

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const FPS = 30;
const SCENE = 90;
const TOTAL = SCENE * 4;
const W = 480;
const H = 320;

const hex = (h) => [1, 3, 5].map((i) => Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1000) / 1000);
const PRIMARY = hex("#6d6aef");
const DEVICE = hex("#1f2937");
const SCREEN = hex("#f8fafc");
const WHITE = hex("#ffffff");
const LINE = hex("#cbd5e1");
const TRACK = hex("#e2e8f0");
const MUTED = hex("#94a3b8");
const GREEN = hex("#22c55e");

// --- primitive Lottie ---
const isProp = (v) => v && typeof v === "object" && "a" in v && "k" in v;
const st = (k) => ({ a: 0, k });
const prop = (v) => (isProp(v) ? v : st(v));
const arr = (v) => (Array.isArray(v) ? v : [v]);
// Keyframe con easing morbido; [t, valore] in ordine di tempo.
function an(keys) {
  return {
    a: 1,
    k: keys.map(([t, s], i) =>
      i < keys.length - 1
        ? { t, s: arr(s), o: { x: [0.33], y: [0] }, i: { x: [0.25], y: [1] } }
        : { t, s: arr(s) }
    ),
  };
}
const rect = (w, h, x = 0, y = 0, r = 0) => ({ ty: "rc", d: 1, s: st([w, h]), p: st([x, y]), r: st(r) });
const ellipse = (d, x = 0, y = 0) => ({ ty: "el", d: 1, s: st([d, d]), p: st([x, y]) });
const shape = (v, closed = false) => ({
  ty: "sh",
  ks: st({ i: v.map(() => [0, 0]), o: v.map(() => [0, 0]), v, c: closed }),
});
const fill = (c) => ({ ty: "fl", c: isProp(c) ? c : st([...c, 1]), o: st(100), r: 1 });
const stroke = (c, w) => ({ ty: "st", c: st([...c, 1]), o: st(100), w: st(w), lc: 2, lj: 2, ml: 4 });
const trim = (e) => ({ ty: "tm", s: st(0), e, o: st(0), m: 1 });
const tr = ({ p = [0, 0], s = [100, 100], o = 100, r = 0 } = {}) => ({
  ty: "tr",
  p: prop(p),
  a: st([0, 0]),
  s: prop(s),
  r: prop(r),
  o: prop(o),
  sk: st(0),
  sa: st(0),
});
// Nei gruppi Lottie il primo elemento sta sopra.
const group = (items, t = {}) => ({ ty: "gr", it: [...items, tr(t)] });

function layer(name, shapes, { ip = 0, op = TOTAL, p, o = 100, scale = 100 }) {
  return {
    ddd: 0,
    ty: 4,
    nm: name,
    sr: 1,
    ks: { o: prop(o), r: st(0), p: prop([...p, 0]), a: st([0, 0, 0]), s: st([scale, scale, 100]) },
    ao: 0,
    shapes,
    ip,
    op,
    st: 0,
    bm: 0,
  };
}

// --- elementi ricorrenti ---
function appIcon(t = {}) {
  return group(
    [
      group([ellipse(7, 0, -3), rect(3, 8, 0, 3, 1.5), fill(PRIMARY)]),
      group([shape([[0, -17], [13, -11], [13, 1], [0, 16], [-13, 1], [-13, -11]], true), fill(WHITE), stroke(WHITE, 3)]),
      group([rect(56, 56, 0, 0, 15), fill(PRIMARY)]),
    ],
    t
  );
}

function badge(x, y, t0) {
  return group(
    [
      group([shape([[-4.5, 0.5], [-1.2, 3.8], [4.8, -2.8]]), stroke(WHITE, 2.6), trim(an([[t0 + 4, 0], [t0 + 12, 100]]))]),
      group([ellipse(19), fill(GREEN)]),
    ],
    { p: [x, y], s: an([[t0, [0, 0]], [t0 + 7, [118, 118]], [t0 + 11, [100, 100]]]) }
  );
}

function doc(t = {}) {
  return group(
    [
      group([shape([[-12, -6], [12, -6]]), shape([[-12, 2], [12, 2]]), shape([[-12, 10], [4, 10]]), stroke(LINE, 3)]),
      group([rect(28, 6, 0, -16, 3), fill(PRIMARY)]),
      group([rect(44, 56, 0, 0, 7), fill(WHITE), stroke(LINE, 2)]),
    ],
    t
  );
}

const sceneOpacity = (s0) => an([[s0, 0], [s0 + 6, 100], [s0 + SCENE - 6, 100], [s0 + SCENE, 0]]);

function scenes(c, scale) {
  const out = [];
  let s0 = 0;
  // 1. Installa l'app: icona che compare, barra di avanzamento, spunta.
  out.push(
    layer("1 installa", [
      badge(25, -37, s0 + 62),
      appIcon({ p: [0, -12], s: an([[s0 + 4, [0, 0]], [s0 + 16, [112, 112]], [s0 + 22, [100, 100]]]) }),
      group([shape([[-40, 40], [40, 40]]), stroke(PRIMARY, 6), trim(an([[s0 + 22, 0], [s0 + 60, 100]]))]),
      group([shape([[-40, 40], [40, 40]]), stroke(TRACK, 6)]),
    ], { ip: s0, op: s0 + SCENE, p: c, o: sceneOpacity(s0), scale })
  );
  s0 += SCENE;
  // 2. Scarica la configurazione: freccia, documento che cade nel vassoio.
  out.push(
    layer("2 scarica", [
      badge(22, -26, s0 + 52),
      doc({ p: an([[s0 + 24, [0, -50]], [s0 + 40, [0, 5]], [s0 + 46, [0, 0]]]), o: an([[s0 + 24, 0], [s0 + 32, 100]]) }),
      group(
        [shape([[0, -26], [0, -4]]), shape([[-9, -13], [0, -4], [9, -13]]), stroke(PRIMARY, 4)],
        { p: an([[s0 + 4, [0, -36]], [s0 + 26, [0, -6]]]), o: an([[s0 + 18, 100], [s0 + 28, 0]]) }
      ),
      group([shape([[-32, 28], [-32, 40], [32, 40], [32, 28]]), stroke(LINE, 4)]),
    ], { ip: s0, op: s0 + SCENE, p: c, o: sceneOpacity(s0), scale })
  );
  s0 += SCENE;
  // 3. Importa nell'app: il documento entra nell'icona, compare il profilo.
  out.push(
    layer("3 importa", [
      doc({
        p: an([[s0 + 12, [-34, -14]], [s0 + 40, [30, -14]]]),
        s: an([[s0 + 12, [80, 80]], [s0 + 40, [20, 20]]]),
        o: an([[s0 + 32, 100], [s0 + 42, 0]]),
      }),
      appIcon({ p: [30, -14], s: an([[s0 + 40, [100, 100]], [s0 + 47, [116, 116]], [s0 + 55, [100, 100]]]) }),
      group(
        [
          group([ellipse(14, -38, 0), fill(PRIMARY)]),
          group([shape([[-24, -4], [22, -4]]), stroke(MUTED, 3)]),
          group([shape([[-24, 4], [6, 4]]), stroke(LINE, 3)]),
          group([rect(112, 30, 0, 0, 8), fill(WHITE), stroke(LINE, 1.5)]),
        ],
        { p: an([[s0 + 50, [0, 50]], [s0 + 62, [0, 36]]]), o: an([[s0 + 50, 0], [s0 + 60, 100]]) }
      ),
    ], { ip: s0, op: s0 + SCENE, p: c, o: sceneOpacity(s0), scale })
  );
  s0 += SCENE;
  // 4. Accedi e collegati: utente e password, poi l'interruttore si accende.
  // Utente: testo che si scrive; password: pallini uno alla volta.
  const dots = (y, n, t0) =>
    Array.from({ length: n }, (_, i) =>
      group([ellipse(6, -42 + i * 11, y), fill(DEVICE)], { o: an([[t0 + i * 4, 0], [t0 + i * 4 + 2, 100]]) })
    );
  out.push(
    layer("4 accedi", [
      badge(46, 30, s0 + 70),
      group([ellipse(18), fill(WHITE)], { p: an([[s0 + 58, [-11, 30]], [s0 + 66, [11, 30]]]) }),
      group([rect(46, 24, 0, 30, 12), fill(an([[s0 + 58, [...LINE, 1]], [s0 + 66, [...GREEN, 1]]]))]),
      group([shape([[-44, -38], [10, -38]]), stroke(MUTED, 4), trim(an([[s0 + 8, 0], [s0 + 28, 100]]))]),
      ...dots(-8, 6, s0 + 32),
      group([rect(112, 24, 0, -38, 6), fill(WHITE), stroke(LINE, 1.5)]),
      group([rect(112, 24, 0, -8, 6), fill(WHITE), stroke(LINE, 1.5)]),
    ], { ip: s0, op: s0 + SCENE, p: c, o: sceneOpacity(s0), scale })
  );
  return out;
}

// --- dispositivi ---
function phone(kind) {
  const c = [240, 160];
  const details =
    kind === "ios"
      ? [group([rect(40, 11, 0, -124, 5.5), fill(DEVICE)]), group([rect(46, 4, 0, 129, 2), fill(LINE)])]
      : [
          group([ellipse(9, 0, -125), fill(DEVICE)]),
          group([shape([[-30, 125], [-24, 129], [-30, 133]], true), ellipse(7, 0, 129), rect(7, 7, 30, 129, 1.5), fill(LINE)]),
        ];
  return {
    c,
    layer: layer(`telefono ${kind}`, [...details, group([rect(136, 276, 0, 0, 20), fill(SCREEN)]), group([rect(150, 292, 0, 0, 28), fill(DEVICE)])], { p: c }),
  };
}

function laptop(kind) {
  const c = [240, 150];
  const details =
    kind === "macos"
      ? [
          group([ellipse(5, -132, -81), fill(hex("#f87171"))]),
          group([ellipse(5, -124, -81), fill(hex("#fbbf24"))]),
          group([ellipse(5, -116, -81), fill(hex("#34d399"))]),
          group([rect(288, 11, 0, -81, 0), fill(TRACK)]),
        ]
      : [
          group([rect(4, 4, -134, 83, 0.5), rect(4, 4, -129, 83, 0.5), rect(4, 4, -134, 88, 0.5), rect(4, 4, -129, 88, 0.5), fill(PRIMARY)]),
          group([rect(288, 13, 0, 85, 0), fill(TRACK)]),
        ];
  return {
    c: [240, 154],
    layer: layer(`portatile ${kind}`, [
      ...details,
      group([rect(288, 176, 0, 2, 6), fill(SCREEN)]),
      group([rect(64, 5, 0, 101, 2.5), fill(MUTED)]),
      group([rect(372, 14, 0, 105, 7), fill(LINE)]),
      group([rect(304, 194, 0, 0, 14), fill(DEVICE)]),
    ], { p: c }),
  };
}

const outDir = path.join(path.dirname(new URL(import.meta.url).pathname), "../../public/lottie");
mkdirSync(outDir, { recursive: true });
for (const kind of ["ios", "android", "macos", "windows"]) {
  const device = kind === "ios" || kind === "android" ? phone(kind) : laptop(kind);
  // Primo livello = sopra: prima le scene, poi il dispositivo.
  // Contenuto più grande sui portatili, che hanno lo schermo più largo.
  const layers = [...scenes(device.c, device.c[1] === 160 ? 112 : 122), device.layer].map((l, i) => ({ ...l, ind: i + 1 }));
  const anim = { v: "5.12.0", fr: FPS, ip: 0, op: TOTAL, w: W, h: H, nm: `vpn-${kind}`, ddd: 0, assets: [], layers };
  writeFileSync(path.join(outDir, `vpn-${kind}.json`), JSON.stringify(anim));
  console.log(`vpn-${kind}.json`);
}
