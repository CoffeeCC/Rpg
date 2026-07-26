// =========================================================================
// CARD CHECK — the contact sheet cannot see what is wrong with a card.
//
//     node tools/art/blender/cards.mjs
//     node tools/art/blender/cards.mjs --pitch web/art-staging/materials/pitch
//
// `sheet.mjs` exists and is still right about everything it measures. It is
// also, for these four shapes, nearly blind, for two reasons the bake.py header
// already names:
//
//   IT AVERAGES. Gotcha 8: a symmetric feature averages to 127.5 whether it is
//     present or absent, which is how a completely flat normal map once shipped
//     looking clean. A card is symmetric about its own centreline and made
//     almost entirely of symmetric features — every panel bead, the frame
//     moulding, the linen tooth — so its means are 127.5 no matter what
//     happened. Every number below counts DEVIATION instead.
//
//   IT SHOWS THE TEXTURE, NOT THE CARD. A 731x1024 bake looked at whole is a
//     poster. The thing being judged is 132 pixels wide — `.hand-fan
//     .playing-card` at two of its five breakpoints — and ornament that is
//     handsome at 731 and gone at 132 is wasted work, while ornament that turns
//     to noise at 132 is worse than none at all. So everything here is filtered
//     down to the real size FIRST and magnified back up nearest-neighbour, so
//     what you are looking at is actual player pixels.
//
// Three outputs, written beside the bakes:
//
//   _cards_true.png    the four shapes at 132px wide, then the same at 4x
//                      nearest-neighbour. Judge at the left; diagnose at right.
//   _cards_lit.png     stock + border composited and LIT, at true size, under
//                      three light directions — because a normal map cannot be
//                      judged as a picture of lilac and green. The third panel
//                      adds a stand-in iridescence keyed off `card_foil` so the
//                      mask and the grating can be seen doing their job.
//   _cards_back.png    the same for the back.
//
// And a table: one row per feature that is SUPPOSED to be there, with the peak
// deviation from flat measured on a line drawn across it. A zero in that column
// is gotcha 8 happening again.
// =========================================================================

import { existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { readImage, writePng } = await import(new URL('../image.mjs', import.meta.url).href);

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const DIR = resolve(here, '..', '..', '..', argOf('--dir', 'web/art-staging/materials/cards'));

// The reference the whole file is calibrated to. Keep in sync with bake.py's
// CARD_REF_PX, which is in turn `.hand-fan .playing-card`'s CSS width.
const CARD_PX = 132;
const CARD_PY = Math.round(CARD_PX * 1.4);
const ZOOM = 4;

// -------------------------------------------------------------------------
// Resampling. Box filter down, nearest up — never the reverse, and never a
// smooth magnify: the whole question is what a texel does on screen, and a
// bilinear zoom answers a different one.
// -------------------------------------------------------------------------

function boxFit(img, w, h) {
  const out = new Float64Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy0 = Math.floor((y * img.height) / h);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * img.height) / h));
    for (let x = 0; x < w; x++) {
      const sx0 = Math.floor((x * img.width) / w);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * img.width) / w));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const i = (sy * img.width + sx) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al;
          a += img.data[i + 3]; n++;
        }
      }
      const o = (y * w + x) * 4;
      const aa = a / n, un = aa > 0 ? 255 / aa : 0;
      out[o] = (r / n) * un; out[o + 1] = (g / n) * un; out[o + 2] = (b / n) * un; out[o + 3] = aa;
    }
  }
  return { width: w, height: h, data: out };
}

function nearest(img, k) {
  const w = img.width * k, h = img.height * k;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
      const d = (y * w + x) * 4;
      for (let c = 0; c < 4; c++) out[d + c] = img.data[s + c];
    }
  }
  return { width: w, height: h, data: out };
}

// -------------------------------------------------------------------------
// Lighting. A normal map judged as a picture is a picture of lilac; the only
// honest way to look at one is to light it, in the same basis the engine will.
//
// THE BASIS IS THE BILLBOARD ONE — `lighting.ts`'s `vUpright > 1.5` branch, and
// `bake.py billboard_basis()`. R is camera right, G is camera UP, B points at
// the viewer. So a light from the upper left is (-x, +y, +z), and if the card
// lights as though it came from the lower left instead, the G channel is
// inverted and the bake is wrong.
// -------------------------------------------------------------------------

const LIGHTS = [
  { L: norm([-0.55, 0.55, 0.63]), label: 'upper left' },
  { L: norm([0.0, 0.30, 0.95]), label: 'head on' },
  { L: norm([0.62, -0.42, 0.66]), label: 'lower right' },
];

function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / m, v[1] / m, v[2] / m];
}

function decodeN(d, o) {
  return norm([d[o] / 127.5 - 1, d[o + 1] / 127.5 - 1, d[o + 2] / 127.5 - 1]);
}

/**
 * One layer, lit. `gloss`/`spec` are the stand-in for the per-material
 * roughness §19.1 asks for: gilt low-roughness so its highlight travels, stock
 * high so it does not. This is a preview and not the engine's shader — but the
 * inputs are the real ones, so an ornament that vanishes here vanishes there.
 */
function light(albedo, normal, ao, L, { gloss, spec, ambient }) {
  const { width: w, height: h } = albedo;
  const out = new Uint8ClampedArray(w * h * 4);
  const H = norm([L[0], L[1], L[2] + 1]);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = albedo.data[o + 3] / 255;
    if (a <= 0.004) continue;
    const N = decodeN(normal.data, o);
    const occ = (ao.data[o] / 255) ** 1.1;
    const ndl = Math.max(0, N[0] * L[0] + N[1] * L[1] + N[2] * L[2]);
    const s = spec * Math.max(0, N[0] * H[0] + N[1] * H[1] + N[2] * H[2]) ** gloss;
    const k = (ambient + (1 - ambient) * ndl) * occ;
    for (let c = 0; c < 3; c++) out[o + c] = albedo.data[o + c] * k + 255 * s;
    out[o + 3] = albedo.data[o + 3];
  }
  return { width: w, height: h, data: out };
}

function over(dst, src) {
  for (let i = 0; i < dst.width * dst.height; i++) {
    const o = i * 4;
    const a = src.data[o + 3] / 255;
    if (a <= 0) continue;
    for (let c = 0; c < 3; c++) dst.data[o + c] = src.data[o + c] * a + dst.data[o + c] * (1 - a);
    dst.data[o + 3] = Math.max(dst.data[o + 3], src.data[o + 3]);
  }
  return dst;
}

/**
 * A STAND-IN for the real holo shader — enough to see the two deliverables
 * working and no more. The hue phase is driven by the grating normal exactly
 * the way a real iridescence term would be (it is the thing that makes the
 * bands sweep when the card moves), and the whole term is multiplied by the
 * mask, which is the channel `card_foil`'s albedo exists to be.
 */
function holo(dst, mask, grating, phase, strength = 0.85) {
  for (let i = 0; i < dst.width * dst.height; i++) {
    const o = i * 4;
    const m = mask.data[o] / 255;
    if (m <= 0.004 || dst.data[o + 3] <= 0) continue;
    const N = decodeN(grating.data, o);
    const t = (N[0] * 2.6 + N[1] * 1.1) * 6.0 + phase;
    const rgb = [
      0.5 + 0.5 * Math.sin(t),
      0.5 + 0.5 * Math.sin(t + 2.094),
      0.5 + 0.5 * Math.sin(t + 4.189),
    ];
    for (let c = 0; c < 3; c++) {
      dst.data[o + c] = dst.data[o + c] + 255 * rgb[c] * m * strength * 0.55;
    }
  }
  return dst;
}

// -------------------------------------------------------------------------
// The presence test. Gotcha 8's lesson stated as code: draw a line across
// where a feature is SUPPOSED to be and report the largest deviation from flat
// found on it. Averages cannot see a symmetric feature; this can.
//
// Coordinates are CSS pixels at the 132px reference, i.e. the same numbers the
// builders in bake.py are written in, so a probe and the feature it probes are
// stated in one language.
// -------------------------------------------------------------------------

const U = (px) => px / CARD_PX;

const PROBES = {
  card_stock: [
    ['perimeter chamfer (top)', 66, 0, 66, 6, 'G'],
    ['perimeter chamfer (left)', 0, 92, 6, 92, 'R'],
    ['art window mouth (left)', 12, 77, 22, 77, 'R'],
    ['art window mouth (top)', 66, 32, 66, 42, 'G'],
    ['name panel mouth (left)', 29, 20, 38, 20, 'R'],
    ['rules panel mouth (top)', 66, 136, 66, 145, 'G'],
    ['cost socket wall', 1, 17, 10, 17, 'R'],
  ],
  card_border: [
    ['frame moulding (left)', 0, 92, 9, 92, 'R'],
    ['frame moulding (top)', 66, 0, 66, 9, 'G'],
    ['corner brace', 0, 15, 8, 15, 'R'],
    ['art bezel (left)', 11, 77, 20, 77, 'R'],
    ['name bead (top)', 66, 8, 66, 14, 'G'],
    ['cost medallion', 16, 1, 16, 32, 'G'],
  ],
  card_back: [
    ['border moulding (left)', 0, 92, 10, 92, 'R'],
    ['centre ring (left)', 33, 92, 45, 92, 'R'],
    // Crossing the boss's EDGE at y = 92.4 - 20.4 = 72, not its face. Sized
    // from GUILLOCHE_FLOOR_PX like the boss itself is — an earlier version
    // probed a fixed y=79 and started reporting the guilloche's own amplitude
    // the moment the boss grew, which reads as a feature that got weaker.
    ['centre boss (edge)', 66, 67, 66, 77, 'G'],
    ['spoke', 66, 66, 80, 78, 'R'],
  ],
};
// Every tier's normal pass is the same grating, so it gets the same two probes.
for (const t of ['starter', 'common', 'uncommon', 'rare', 'star']) {
  PROBES[`card_foil_${t}`] = [
    ['grating', 20, 60, 112, 60, 'R'],
    ['grating (across)', 66, 40, 66, 110, 'R'],
  ];
}

/**
 * Peak |value - 127.5| on a line, in full-resolution texels.
 *
 * IT SAMPLES A BAND, NOT A LINE, and that is a correction rather than a
 * refinement. A chamfer here is under two CSS pixels wide, and a bare line walk
 * rounds each step to a texel — so it can step straight over a feature that is
 * unmistakably present. It did: the card back's boss reported 23.5 (the
 * guilloche's own amplitude, i.e. "missing") while a box around the same point
 * measured 100.5. A presence test that can miss a present feature is worse than
 * no presence test, because it sends you looking for a bug in the geometry.
 */
const PROBE_BAND = 2; // texels either side

function probe(img, x0, y0, x1, y1, ch) {
  const c = { R: 0, G: 1, B: 2 }[ch];
  const sx = img.width / CARD_PX, sy = img.height / CARD_PY;
  const steps = Math.max(24, Math.round(Math.hypot((x1 - x0) * sx, (y1 - y0) * sy)) * 2);
  let peak = 0;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = Math.round((x0 + (x1 - x0) * t) * sx);
    const py = Math.round((y0 + (y1 - y0) * t) * sy);
    for (let dy = -PROBE_BAND; dy <= PROBE_BAND; dy++) {
      for (let dx = -PROBE_BAND; dx <= PROBE_BAND; dx++) {
        const x = px + dx, y = py + dy;
        if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue;
        const o = (y * img.width + x) * 4;
        if (img.data[o + 3] < 250) continue;
        peak = Math.max(peak, Math.abs(img.data[o + c] - 127.5));
      }
    }
  }
  return peak;
}

/** Fraction of opaque texels that deviate from flat at all, and the peak. */
function reliefCoverage(img, thresh = 3) {
  let dev = 0, tot = 0, peak = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    if (img.data[o + 3] < 250) continue;
    tot++;
    const d = Math.max(Math.abs(img.data[o] - 127.5), Math.abs(img.data[o + 1] - 127.5));
    peak = Math.max(peak, d);
    if (d > thresh) dev++;
  }
  return { frac: dev / (tot || 1), peak };
}

/**
 * How much of the grating survives being drawn at the size a card is drawn at.
 *
 * THIS IS THE NUMBER THAT PICKED THE PITCH. A grating finer than two on-screen
 * pixels cannot be represented at all, so box-filtering it to true size cancels
 * it against itself and what is left is moire; a coarse one survives intact and
 * reads as stripes. The ratio below is the amplitude that made it through,
 * which is exactly "how much iridescence is left after the mip".
 */
function rmsR(img) {
  let s = 0, n = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    if (img.data[o + 3] < 250) continue;
    s += (img.data[o] - 127.5) ** 2; n++;
  }
  return Math.sqrt(s / (n || 1));
}

/**
 * The BEATING number, and it is the one that rules pitches out rather than in.
 *
 * Retention alone cannot tell a clean fine grating from an aliased one: both
 * keep amplitude, but an aliased grating keeps it in the WRONG PLACE. A real
 * grating is pure high frequency, so blurring the true-size image over eight
 * pixels should cancel it to nothing. Moire is low frequency by definition —
 * it is the beat between the grating and the pixel grid — so it survives the
 * blur, and a shader sweeping it produces slow crawling blotches rather than
 * fine bands. Measured as a fraction of the grating's own amplitude.
 */
function beating(shrunk, pitchPx) {
  // THE WINDOW IS FOUR WHOLE PERIODS, and that is the entire trick. A box
  // average of a periodic signal over a window of W pixels leaves a residual of
  // |sinc(W/p)| of its own amplitude — so an arbitrary blur radius manufactures
  // a "beat" out of nothing whenever the window happens to hold a half period.
  // The first version of this used a fixed 9px blur and duly reported 13% for a
  // 6px pitch and 1% for a 4px one, which is sinc(1.5) versus sinc(2.25) and has
  // nothing to do with either grating. Average over exactly four periods and
  // sinc is zero, so whatever survives is genuinely low frequency.
  const k = Math.max(1, Math.round(4 * pitchPx));
  const bins = boxFit(shrunk, Math.max(1, Math.round(shrunk.width / k)),
    Math.max(1, Math.round(shrunk.height / k)));
  return rmsR(bins);
}

function gratingRetention(normal, pitchPx = 4) {
  const full = rmsR(normal);
  const shrunk = boxFit(normal, CARD_PX, CARD_PY);
  const small = rmsR(shrunk);
  return {
    full, small, kept: full > 0 ? small / full : 0,
    beat: beating(shrunk, pitchPx), shrunk,
  };
}

// -------------------------------------------------------------------------

function canvas(w, h, shade = 26) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    const c = ((x >> 3) + (y >> 3)) & 1 ? shade + 12 : shade;
    d[i * 4] = c; d[i * 4 + 1] = c; d[i * 4 + 2] = c; d[i * 4 + 3] = 255;
  }
  return { width: w, height: h, data: d };
}

function paste(dst, src, x0, y0) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= dst.width || py >= dst.height) continue;
      const s = (y * src.width + x) * 4, d = (py * dst.width + px) * 4;
      const a = src.data[s + 3] / 255;
      for (let c = 0; c < 3; c++) dst.data[d + c] = src.data[s + c] * a + dst.data[d + c] * (1 - a);
      dst.data[d + 3] = 255;
    }
  }
  return dst;
}

const load = (name, pass) => {
  const f = join(DIR, pass ? `${name}_${pass}.png` : `${name}.png`);
  return existsSync(f) ? readImage(f) : null;
};

const toU8 = (img) => ({
  width: img.width, height: img.height,
  data: img.data instanceof Uint8ClampedArray ? img.data : Uint8ClampedArray.from(img.data),
});

const small = (name, pass) => {
  const img = load(name, pass);
  return img ? toU8(boxFit(img, CARD_PX, CARD_PY)) : null;
};

// Every sheet here is TRUE SIZE beside a nearest-neighbour magnification of
// the same pixels, so `GAP` and `ZOOM` are layout for all of them.
const GAP = 10;

// --- pitch sweep mode ----------------------------------------------------
// `--pitch DIR` expects one subdirectory per candidate, each holding a
// card_foil bake. Reports what survived the trip down to true size.
if (argv.includes('--pitch')) {
  const root = resolve(here, '..', '..', '..', argOf('--pitch', 'web/art-staging/materials/pitch'));
  const { readdirSync } = await import('node:fs');
  console.log('pitch'.padStart(8), 'rms@731'.padStart(9), 'rms@132'.padStart(9), 'kept'.padStart(7),
    'beat'.padStart(7), 'beat%'.padStart(7));
  const strips = [];
  for (const d of readdirSync(root).sort((a, b) => parseFloat(a) - parseFloat(b))) {
    const f = join(root, d, 'card_foil_normal.png');
    if (!existsSync(f)) continue;
    const r = gratingRetention(readImage(f), parseFloat(d));
    console.log(d.padStart(8), r.full.toFixed(2).padStart(9), r.small.toFixed(2).padStart(9),
      `${(r.kept * 100).toFixed(0)}%`.padStart(7), r.beat.toFixed(2).padStart(7),
      `${(100 * r.beat / (r.small || 1)).toFixed(0)}%`.padStart(7));
    strips.push({ label: d, img: toU8(r.shrunk) });
  }
  // And LOOK at them. The two numbers bracket the answer; only the eye can say
  // whether what is left reads as foil or as corduroy.
  const cellW = CARD_PX + GAP + CARD_PX * ZOOM;
  const sheet = canvas(GAP + strips.length * (cellW + GAP), GAP * 2 + CARD_PY * ZOOM, 20);
  strips.forEach((s, i) => {
    const x = GAP + i * (cellW + GAP);
    paste(sheet, s.img, x, GAP);
    paste(sheet, nearest(s.img, ZOOM), x + CARD_PX + GAP, GAP);
  });
  writePng(join(root, '_pitch.png'), sheet.width, sheet.height, sheet.data);
  console.log(`\n-> ${join(root, '_pitch.png')}   (${strips.map((s) => s.label).join(' | ')})`);
  process.exit(0);
}

// --- the true-size sheet -------------------------------------------------
// The rarity ladder, in order, so the sheet reads as a ladder. `starter` is
// omitted from the picture only because it is byte-identical to `common` —
// both are "no foil", and two identical black rectangles teach nothing.
const TIERS = ['common', 'uncommon', 'rare', 'star'];
const NAMES = ['card_stock', 'card_border', 'card_back', ...TIERS.map((t) => `card_foil_${t}`)];
const PASSES = [null, 'normal', 'ao'];
{
  const cellW = CARD_PX + GAP + CARD_PX * ZOOM;
  const W = GAP + NAMES.length * (cellW + GAP);
  const H = GAP + CARD_PY * ZOOM + GAP + PASSES.length * 0; // laid out per pass below
  const sheetH = GAP + PASSES.length * (CARD_PY * ZOOM + GAP);
  const sheet = canvas(W, sheetH);
  NAMES.forEach((name, ci) => {
    PASSES.forEach((pass, ri) => {
      const s = small(name, pass);
      if (!s) return;
      const x = GAP + ci * (cellW + GAP);
      const y = GAP + ri * (CARD_PY * ZOOM + GAP);
      paste(sheet, s, x, y);
      paste(sheet, nearest(s, ZOOM), x + CARD_PX + GAP, y);
    });
  });
  writePng(join(DIR, '_cards_true.png'), sheet.width, sheet.height, sheet.data);
  console.log(`-> ${join(DIR, '_cards_true.png')}   (rows: albedo / normal / AO;`
    + ` left column is TRUE SIZE, right is ${ZOOM}x nearest)`);
}

// --- the lit composite ---------------------------------------------------
const MAT = {
  stock: { gloss: 12, spec: 0.05, ambient: 0.34 },
  gilt: { gloss: 46, spec: 0.85, ambient: 0.22 },
  back: { gloss: 40, spec: 0.62, ambient: 0.24 },
};

function litCard(layers, L) {
  let base = null;
  for (const [name, mat] of layers) {
    const a = small(name), n = small(name, 'normal'), o = small(name, 'ao');
    if (!a || !n || !o) continue;
    const lit = light(a, n, o, L, MAT[mat]);
    base = base ? over(base, lit) : lit;
  }
  return base;
}

{
  const rowA = [];
  for (const { L, label } of LIGHTS) {
    rowA.push({ img: litCard([['card_stock', 'stock'], ['card_border', 'gilt']], L), label });
  }
  const panels = [];
  // THE LADDER, which is the thing that actually has to be judged: foil is a
  // rarity signal, so what matters is not whether one card shines but whether
  // four cards side by side read as four steps. Same light, same card, only the
  // mask changes. If `uncommon` is indistinguishable from `common` here the
  // accent is too small; if it is as loud as `rare` the ladder has no rungs.
  for (const t of TIERS) {
    const mask = small(`card_foil_${t}`);
    const gr = small(`card_foil_${t}`, 'normal');
    const c = litCard([['card_stock', 'stock'], ['card_border', 'gilt']], LIGHTS[0].L);
    panels.push({ img: mask && gr ? holo(c, mask, gr, 0.9) : c, label: t });
  }
  // TWO ROWS, because seven cards in a line is 4700 pixels wide and nobody
  // looks at that; the row that matters is the ladder and it has to fit in one
  // glance beside itself.
  const rows = [rowA, panels];
  const cellW = CARD_PX + GAP + CARD_PX * ZOOM;
  const wide = Math.max(...rows.map((r) => r.length));
  const sheet = canvas(GAP + wide * (cellW + GAP),
    GAP + rows.length * (CARD_PY * ZOOM + GAP), 18);
  rows.forEach((row, ri) => {
    row.forEach((p, i) => {
      if (!p.img) return;
      const x = GAP + i * (cellW + GAP);
      const y = GAP + ri * (CARD_PY * ZOOM + GAP);
      paste(sheet, p.img, x, y);
      paste(sheet, nearest(p.img, ZOOM), x + CARD_PX + GAP, y);
    });
  });
  writePng(join(DIR, '_cards_lit.png'), sheet.width, sheet.height, sheet.data);
  console.log(`-> ${join(DIR, '_cards_lit.png')}   (row 1: ${rowA.map((p) => p.label).join(' | ')}`
    + `;  row 2, the rarity ladder: ${panels.map((p) => p.label).join(' | ')})`);
}

{
  const panels = LIGHTS.map(({ L }) => litCard([['card_back', 'back']], L));
  const cellW = CARD_PX + GAP + CARD_PX * ZOOM;
  const sheet = canvas(GAP + panels.length * (cellW + GAP), GAP * 2 + CARD_PY * ZOOM, 18);
  panels.forEach((img, i) => {
    if (!img) return;
    const x = GAP + i * (cellW + GAP);
    paste(sheet, img, x, GAP);
    paste(sheet, nearest(img, ZOOM), x + CARD_PX + GAP, GAP);
  });
  writePng(join(DIR, '_cards_back.png'), sheet.width, sheet.height, sheet.data);
  console.log(`-> ${join(DIR, '_cards_back.png')}`);
}

// --- the numbers ---------------------------------------------------------
console.log('\nPRESENCE  peak |dev| from flat on a line drawn across each intended feature.');
console.log('          0 is gotcha 8: the AO shows it, the normal does not.\n');
for (const name of NAMES) {
  const n = load(name, 'normal');
  if (!n) continue;
  const cov = reliefCoverage(n);
  console.log(`${name}  relief covers ${(cov.frac * 100).toFixed(1)}% of the face, peak dev ${cov.peak.toFixed(1)}`);
  for (const [label, x0, y0, x1, y1, ch] of PROBES[name] ?? []) {
    const v = probe(n, x0, y0, x1, y1, ch);
    console.log(`    ${label.padEnd(26)} ${ch}  ${v.toFixed(1).padStart(6)}${v < 4 ? '   <-- MISSING' : ''}`);
  }
}

// --- the masks, which have rules of their own ----------------------------
//
// Three things have to hold on every tier, and only the third differs between
// them: the art window's interior is black (the per-card art foil composites
// there), the rules field's interior is black (DOM text sits in it), and the
// tier foils exactly the gilt its rung of the ladder calls for.
{
  for (const tier of ['starter', 'common', 'uncommon', 'rare', 'star']) {
    const m = load(`card_foil_${tier}`);
    if (!m) continue;
    const region = (x0, y0, x1, y1) => {
      const sx = m.width / CARD_PX, sy = m.height / CARD_PY;
      let lo = 255, hi = 0;
      for (let y = Math.round(y0 * sy); y < Math.round(y1 * sy); y++) {
        for (let x = Math.round(x0 * sx); x < Math.round(x1 * sx); x++) {
          const o = (y * m.width + x) * 4;
          lo = Math.min(lo, m.data[o]); hi = Math.max(hi, m.data[o]);
        }
      }
      return { lo, hi };
    };
    // Each named piece of gilt, sampled where only that piece can be.
    const at = {
      art: region(24, 44, 108, 106),      // must be black at every tier
      rules: region(26, 148, 106, 166),   // must be black at every tier
      frame: region(2, 60, 5, 120),       // the frame band's left run
      // OUTSIDE the frame band (x > 7) and ABOVE the cost keystone (y < 5), or
      // the probe reports the frame at `rare` and the medallion's antialiased
      // top edge at `uncommon`, and answers neither question.
      brace: region(8, 2, 20, 4.5),
      name: region(40, 9.5, 70, 11),      // the title panel's bead
      cost: region(12, 12, 18, 20),       // inside the keystone
      pip: region(118, 15, 122, 19),      // inside the diamond
    };
    let white = 0, tot = 0;
    for (let i = 0; i < m.width * m.height; i++) {
      const o = i * 4;
      if (m.data[o + 3] < 250) continue;
      tot++;
      if (m.data[o] > 250) white++;
    }
    const on = (k) => (at[k].hi > 250 ? 'FOIL' : at[k].hi < 3 ? '  . ' : '????');
    console.log(`  card_foil_${tier.padEnd(9)} `
      + `frame ${on('frame')}  brace ${on('brace')}  title ${on('name')}  `
      + `cost ${on('cost')}  pip ${on('pip')}   `
      + `art ${at.art.hi < 3 ? 'black' : `NOT BLACK (${at.art.hi})`}  `
      + `rules ${at.rules.hi < 3 ? 'black' : `NOT BLACK (${at.rules.hi})`}  `
      + `${(100 * white / tot).toFixed(1)}% of the card`);
  }
}

{
  const g = load('card_foil_common', 'normal');
  if (g) {
    const r = gratingRetention(g, 4);
    console.log(`\nGRATING   rms ${r.full.toFixed(2)} at 731px -> ${r.small.toFixed(2)} at ${CARD_PX}px`
      + `, ${(r.kept * 100).toFixed(0)}% kept, beat ${(100 * r.beat / r.small).toFixed(0)}% of what is kept`);
  }
}
