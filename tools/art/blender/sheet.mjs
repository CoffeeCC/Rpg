// =========================================================================
// CONTACT SHEET for the Blender bake — because "it rendered" is not "it is
// right".
//
//     node tools/art/blender/sheet.mjs
//     node tools/art/blender/sheet.mjs --dir web/art-staging/materials/board
//
// Writes `_sheet.png` beside the bakes: one row per shape, albedo / normal /
// AO across, labelled, on a checkerboard so alpha is visible. Then open it
// and LOOK at it.
//
// It also prints the four numbers that have actually caught bugs. Every one
// of these corresponds to a mistake recorded in `bake.py`'s header:
//
//   R mean ~= 128 on a symmetric shape. 185 means an sRGB encode leaked onto
//     a data pass — sRGB(0.5) = 185/255 exactly, and the giveaway is that it
//     is the SAME 185 on unrelated shapes.
//   B dominant, not G. A green-dominant normal map is one baked in the wrong
//     space: a plan view of a flat-topped object is almost all (128,128,255).
//   G rising DOWN the image on a lying decal. `piece.ts` states the
//     convention — texture +v is board +y, toward the player — so the near
//     lip of a rim is the bright-green one. A sheet where the far lip is
//     brighter is inverted, and it lights backwards without ever looking
//     wrong in a still.
//   AO minimum well below 1. If nothing in the shape is occluded, the AO pass
//     is a white rectangle and the geometry has no interior detail at all.
//
// Pure JS via `tools/art/image.mjs` — no native deps, same as the rest of the
// pipeline (see that file's header for why that is not negotiable).
// =========================================================================

import { readdirSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const { readImage, writePng } = await import(new URL('../image.mjs', import.meta.url).href);

const argv = process.argv.slice(2);
const argOf = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : fallback;
};

const DIR = resolve(here, '..', '..', '..', argOf('--dir', 'web/art-staging/materials/board'));
const CELL_W = Number(argOf('--cell', 200));
const CELL_H = Math.round(CELL_W * 0.8);
const PAD = 8;
const LABEL_W = 132;

// -------------------------------------------------------------------------
// A 3x5 bitmap font. Small enough to inline, big enough to read the shape
// names, and it means the sheet describes itself instead of relying on the
// row order matching whatever was printed to a terminal an hour ago.
// -------------------------------------------------------------------------
const GLYPHS = {
  A: '25255', B: '65656', C: '34443', D: '65556', E: '74647', F: '74644', G: '34556',
  H: '55755', I: '72227', J: '11157', K: '55655', L: '44447', M: '57555', N: '65555',
  O: '25552', P: '65644', Q: '25573', R: '65655', S: '34317', T: '72222', U: '55553',
  V: '55552', W: '55575', X: '55255', Y: '55222', Z: '71247',
  0: '25552', 1: '22227', 2: '61247', 3: '61213', 4: '55711', 5: '74317', 6: '34753',
  7: '71222', 8: '25252', 9: '25311',
  _: '00007', '-': '00200', '.': '00002', ' ': '00000', '/': '11244',
};
// Each character is five rows of a 3-bit mask; the digits above are those
// masks in octal, top row first.
function glyphRows(ch) {
  const s = GLYPHS[ch] ?? GLYPHS[' '];
  return [...s].map((d) => parseInt(d, 8) & 7);
}

function drawText(sheet, W, H, text, x0, y0, rgb, scale = 2) {
  let x = x0;
  for (const ch of text.toUpperCase()) {
    const rows = glyphRows(ch);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 3; c++) {
        if (!(rows[r] & (4 >> c))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = x + c * scale + sx;
            const py = y0 + r * scale + sy;
            if (px < 0 || py < 0 || px >= W || py >= H) continue;
            const i = (py * W + px) * 4;
            sheet[i] = rgb[0];
            sheet[i + 1] = rgb[1];
            sheet[i + 2] = rgb[2];
            sheet[i + 3] = 255;
          }
        }
      }
    }
    x += 4 * scale;
  }
}

/** Box-filter down to fit inside the cell, preserving aspect. */
function fit(img, maxW, maxH) {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
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
          // Premultiply so a transparent-but-coloured texel does not bleed
          // its colour into the average. Blender leaves the normal pass's
          // background at (0,0,0,0) and an unweighted mean darkens the edge.
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al; g += img.data[i + 1] * al; b += img.data[i + 2] * al;
          a += img.data[i + 3];
          n++;
        }
      }
      const o = (y * w + x) * 4;
      const aa = a / n;
      const un = aa > 0 ? 255 / aa : 0;
      out[o] = (r / n) * un;
      out[o + 1] = (g / n) * un;
      out[o + 2] = (b / n) * un;
      out[o + 3] = aa;
    }
  }
  return { width: w, height: h, data: out };
}

function blit(sheet, W, H, img, x0, y0) {
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const px = x0 + x, py = y0 + y;
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const s = (y * img.width + x) * 4;
      const d = (py * W + px) * 4;
      const a = img.data[s + 3] / 255;
      for (let k = 0; k < 3; k++) sheet[d + k] = img.data[s + k] * a + sheet[d + k] * (1 - a);
      sheet[d + 3] = 255;
    }
  }
}

/** The measurements, over opaque texels only. */
function stats(normal, ao, albedo) {
  const N = normal.width * normal.height;
  let r = 0, g = 0, b = 0, n = 0;
  let topG = 0, topN = 0, botG = 0, botN = 0;
  let leftR = 0, leftN = 0, rightR = 0, rightN = 0;
  const third = normal.height / 3;
  for (let y = 0; y < normal.height; y++) {
    for (let x = 0; x < normal.width; x++) {
      const i = (y * normal.width + x) * 4;
      if (normal.data[i + 3] < 250) continue;
      r += normal.data[i]; g += normal.data[i + 1]; b += normal.data[i + 2]; n++;
      if (y < third) { topG += normal.data[i + 1]; topN++; }
      else if (y > normal.height - third) { botG += normal.data[i + 1]; botN++; }
      if (x < normal.width / 3) { leftR += normal.data[i]; leftN++; }
      else if (x > (normal.width * 2) / 3) { rightR += normal.data[i]; rightN++; }
    }
  }
  let aoMin = 255, aoSum = 0, aoN = 0;
  for (let i = 0; i < ao.width * ao.height; i++) {
    if (ao.data[i * 4 + 3] < 250) continue;
    aoMin = Math.min(aoMin, ao.data[i * 4]);
    aoSum += ao.data[i * 4]; aoN++;
  }
  let cover = 0;
  for (let i = 0; i < albedo.width * albedo.height; i++) if (albedo.data[i * 4 + 3] > 128) cover++;
  return {
    px: `${normal.width}x${normal.height}`,
    R: r / n, G: g / n, B: b / n,
    topG: topG / (topN || 1), botG: botG / (botN || 1),
    leftR: leftR / (leftN || 1), rightR: rightR / (rightN || 1),
    aoMin, aoMean: aoSum / (aoN || 1),
    cover: cover / (albedo.width * albedo.height),
  };
}

const names = [...new Set(
  readdirSync(DIR)
    .filter((f) => f.endsWith('.png') && !f.startsWith('_'))
    .map((f) => f.replace(/(_normal|_ao)?\.png$/, '')),
)].sort();

const rows = [];
for (const name of names) {
  const files = [join(DIR, `${name}.png`), join(DIR, `${name}_normal.png`), join(DIR, `${name}_ao.png`)];
  if (!files.every(existsSync)) { console.warn(`skip ${name}: missing a pass`); continue; }
  const [albedo, normal, ao] = files.map(readImage);
  rows.push({ name, imgs: [albedo, normal, ao], s: stats(normal, ao, albedo) });
}

const W = LABEL_W + 3 * (CELL_W + PAD) + PAD;
const HEADER = 22;
const H = PAD + HEADER + rows.length * (CELL_H + PAD) + PAD;
const sheet = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    // Mid-grey ground with a checker inside the cells, so a transparent
    // sprite is distinguishable from a black one — which matters most for
    // `trap_hole`, whose whole point is the hole.
    const inCell = x > LABEL_W && ((x - LABEL_W) % (CELL_W + PAD)) > PAD;
    const c = inCell ? (((x >> 3) + (y >> 3)) & 1 ? 92 : 74) : 34;
    sheet[i] = c; sheet[i + 1] = c; sheet[i + 2] = c; sheet[i + 3] = 255;
  }
}

drawText(sheet, W, H, 'shape', PAD, PAD, [200, 200, 200], 2);
['albedo', 'normal', 'ao'].forEach((t, c) => {
  drawText(sheet, W, H, t, LABEL_W + PAD + c * (CELL_W + PAD), PAD, [200, 200, 200], 2);
});

rows.forEach((row, r) => {
  const y0 = PAD + HEADER + r * (CELL_H + PAD);
  drawText(sheet, W, H, row.name, PAD, (y0 + CELL_H / 2 - 12) | 0, [235, 225, 200], 2);
  drawText(sheet, W, H, row.s.px, PAD, (y0 + CELL_H / 2 + 6) | 0, [140, 150, 160], 1);
  row.imgs.forEach((img, c) => {
    const cell = fit(img, CELL_W, CELL_H);
    blit(sheet, W, H, cell, LABEL_W + PAD + c * (CELL_W + PAD) + (CELL_W - cell.width) / 2 | 0,
      y0 + ((CELL_H - cell.height) / 2 | 0));
  });
});

const outFile = join(DIR, '_sheet.png');
writePng(outFile, W, H, sheet);

const f = (v) => v.toFixed(1).padStart(6);
console.log('shape'.padEnd(20), 'size'.padStart(9), 'R'.padStart(6), 'G'.padStart(6), 'B'.padStart(6),
  'G^'.padStart(6), 'Gv'.padStart(6), 'R<'.padStart(6), 'R>'.padStart(6), 'aoMin'.padStart(6), 'aoAvg'.padStart(6), '  cover');
for (const { name, s } of rows) {
  console.log(
    name.padEnd(20), s.px.padStart(9), f(s.R), f(s.G), f(s.B),
    f(s.topG), f(s.botG), f(s.leftR), f(s.rightR),
    String(s.aoMin).padStart(6), f(s.aoMean), `  ${(s.cover * 100).toFixed(0)}%`,
  );
}
console.log(`\n-> ${outFile}`);
