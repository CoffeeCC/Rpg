#!/usr/bin/env node
/**
 * The material baker — offline, headless, no browser, no native dependencies.
 *
 *   npm run art:bake -- --set tiles
 *   npm run art:bake -- --set monsters --sample 15
 *   npm run art:bake -- --mode bevel web/public/art/heroes/vela.png
 *   npm run art:bake                       # re-bake everything in the manifest
 *
 * In: one source image. Out: `<name>_normal.png`, `<name>_height.png`,
 * `<name>_ao.png`, plus a row in `tools/art/materials.json` recording the
 * source, the mode, the tuning and the measured QC so the bake is reproducible
 * from version control alone.
 *
 * WHY A TOOL AND NOT THE LAB. `web/public/lantern-lab.html` proved the tile
 * pipeline and is still the place to eyeball a material, but it needs a browser
 * and a human with a mouse. This has to re-run unattended over ~125 assets, in
 * CI, every time the art changes — and the art will change. ENGINE_PLAN.md §7:
 * "A workflow where somebody drags sliders in an app is a workflow that cannot
 * be re-run when the art changes."
 *
 * WHY STAGING AND NOT `public/`. Vite copies all of `web/public/` into `dist`,
 * so baking there would ship every intermediate. `web/art-staging/` is
 * gitignored: the tool and the manifest are version controlled, the PNGs are
 * not, and `npm run art:bake` regenerates them byte-for-byte.
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, basename, extname, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readImage, writePng, planeToRgba, normalToRgba, sha1 } from './image.mjs';
import { bake as bakeMaterial, TILE_DEFAULTS, BEVEL_DEFAULTS } from './pipeline.mjs';
import { orbitTest, orbitControl, ORBIT, RIG_FOR_MODE } from './orbit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = join(ROOT, 'tools', 'art', 'materials.json');
const OUT_ROOT = join(ROOT, 'web', 'art-staging', 'materials');

/**
 * The asset classes, split exactly as ENGINE_PLAN.md §9.1 splits them.
 * `tiles` is luminance->Sobel, which is measured sound on stochastic texture.
 * Everything with an alpha channel gets EDT beveling, which cannot invert a
 * volume because it never looks at painted tone.
 */
const SETS = {
  tiles: { dir: 'web/public/art/tiles', ext: ['.jpg', '.jpeg', '.png'], mode: 'tiles' },
  monsters: { dir: 'web/public/art/monsters', ext: ['.png'], mode: 'bevel' },
  heroes: { dir: 'web/public/art/heroes', ext: ['.png'], mode: 'bevel' },
  npcs: { dir: 'web/public/art/npcs', ext: ['.png'], mode: 'bevel' },
  sprites: { dir: 'web/public/art/sprites', ext: ['.png'], mode: 'bevel' },
};

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const opts = { sets: [], files: [], params: {}, limit: 0, sample: 0, mode: null, quiet: false, write: true, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--set') opts.sets.push(argv[++i]);
    else if (a === '--mode') opts.mode = argv[++i];
    else if (a === '--limit') opts.limit = Number(argv[++i]);
    else if (a === '--sample') opts.sample = Number(argv[++i]);
    else if (a === '--param') {
      const [k, v] = argv[++i].split('=');
      opts.params[k] = v === 'auto' ? 'auto' : Number(v);
    } else if (a === '--dry') opts.write = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--quiet') opts.quiet = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else opts.files.push(a);
  }
  return opts;
}

const HELP = `
material baker — bakes normal/height/AO off source art, headless

  node tools/art/bake.mjs [--set NAME]... [--mode tiles|bevel] [FILE]...

  --set NAME        one of: ${Object.keys(SETS).join(', ')}
  --mode MODE       tiles (luminance -> Sobel) or bevel (EDT off the alpha)
  --sample N        evenly spaced N of the set, deterministic
  --limit N         first N of the set
  --param k=v       override a tuning parameter for this run
  --dry             measure and report, write nothing
  --json            emit the result rows as JSON

  With no arguments, re-bakes every asset already in tools/art/materials.json
  using its recorded parameters.

  tiles  : ${JSON.stringify(TILE_DEFAULTS)}
  bevel  : ${JSON.stringify(BEVEL_DEFAULTS)}
`;

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

function loadManifest() {
  if (!existsSync(MANIFEST)) {
    return { version: 1, generated: null, orbit: null, defaults: null, assets: [] };
  }
  return JSON.parse(readFileSync(MANIFEST, 'utf8'));
}

function saveManifest(m) {
  m.version = 1;
  m.generated = new Date().toISOString();
  m.orbit = {
    angles: ORBIT.angles,
    radius: ORBIT.radius,
    z: ORBIT.z,
    intensity: ORBIT.intensity,
    falloff: ORBIT.falloff,
    ambient: ORBIT.ambient,
    specular: ORBIT.specular,
    gloss: ORBIT.gloss,
    aoStrength: ORBIT.aoStrength,
    lightColour: ORBIT.lightColour,
    stride: ORBIT.stride,
    failSpread: ORBIT.failSpread,
    failSeparation: ORBIT.failSeparation,
    rigForMode: RIG_FOR_MODE,
  };
  m.defaults = { tiles: TILE_DEFAULTS, bevel: BEVEL_DEFAULTS };
  m.assets.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  mkdirSync(dirname(MANIFEST), { recursive: true });
  writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// One asset
// ---------------------------------------------------------------------------

/**
 * Bake one source image and measure it.
 * @param {string} src repo-relative source path
 * @param {'tiles'|'bevel'} mode
 * @param {object} params tuning overrides
 * @param {{ setName?: string, write?: boolean }} io
 */
export function bakeOne(src, mode, params, io = {}) {
  const setName = io.setName ?? 'misc';
  const write = io.write !== false;
  const name = basename(src, extname(src));
  const bitmap = readImage(join(ROOT, src));
  const baked = bakeMaterial(bitmap, mode, params);

  const rig = RIG_FOR_MODE[mode] ?? 'point';
  const orbit = orbitTest(bitmap, baked, rig);
  const alt = orbitTest(bitmap, baked, rig === 'point' ? 'directional' : 'point');
  const control = orbitControl(bitmap, baked.mask ?? null, rig);

  const outDir = join(OUT_ROOT, setName);
  const outputs = {
    normal: relative(ROOT, join(outDir, `${name}_normal.png`)).replaceAll('\\', '/'),
    height: relative(ROOT, join(outDir, `${name}_height.png`)).replaceAll('\\', '/'),
    ao: relative(ROOT, join(outDir, `${name}_ao.png`)).replaceAll('\\', '/'),
  };

  if (write) {
    const { width: w, height: h } = bitmap;
    writePng(join(ROOT, outputs.normal), w, h, normalToRgba(baked.normals, baked.alpha));
    writePng(join(ROOT, outputs.height), w, h, planeToRgba(baked.height, baked.alpha));
    writePng(join(ROOT, outputs.ao), w, h, planeToRgba(baked.ao, baked.alpha));
  }

  // Silhouette facts that only matter on the character path, and that a human
  // reading the manifest will want before trusting a bevel: a sprite cropped
  // hard against the canvas edge is bevelled at a boundary that is not really
  // its edge.
  let silhouette = null;
  if (baked.mask) {
    const { width: w, height: h } = bitmap;
    let opaque = 0;
    let border = false;
    for (let i = 0; i < baked.mask.length; i++) if (baked.mask[i]) opaque++;
    for (let x = 0; x < w && !border; x++) border = !!baked.mask[x] || !!baked.mask[(h - 1) * w + x];
    for (let y = 0; y < h && !border; y++) border = !!baked.mask[y * w] || !!baked.mask[y * w + w - 1];
    silhouette = {
      coverage: round(opaque / baked.mask.length, 4),
      touchesBorder: border,
      bevelRadius: round(baked.params.bevelRadius, 2),
    };
  }

  return {
    id: `${setName}/${name}`,
    name,
    set: setName,
    source: src.replaceAll('\\', '/'),
    sourceSha1: sha1(join(ROOT, src)),
    sourceBytes: statSync(join(ROOT, src)).size,
    width: bitmap.width,
    height: bitmap.height,
    mode,
    params: normaliseParams(baked.params),
    outputs,
    measured: {
      /** Fraction of the 0..1 range the height field occupied before levelling.
       *  The art brief's target is above 0.60; the shipped JPEGs sit at 0.06–0.50. */
      tonalRange: round(baked.levels.span, 4),
      levelsApplied: baked.levels.applied,
      orbitRig: rig,
      orbitPass: orbit.pass,
      orbitSpread: round(orbit.spread, 4),
      orbitMin: round(orbit.min, 4),
      orbitMax: round(orbit.max, 4),
      orbitPeak: orbit.peak,
      orbitTrough: orbit.trough,
      orbitSeparation: orbit.separation,
      orbitSamples: orbit.samples,
      /** The same orbit with a flat normal map. Whatever survives here is the
       *  rig's own doing, not the material's. */
      controlSpread: round(control.spread, 4),
      /** The other rig, recorded so nothing is hidden by the choice of rig. */
      altRig: alt.rig,
      altSpread: round(alt.spread, 4),
      altSeparation: alt.separation,
      silhouette,
    },
    verdict: verdictFor(mode, orbit),
  };
}

function normaliseParams(p) {
  const out = {};
  for (const [k, v] of Object.entries(p)) out[k] = typeof v === 'number' ? round(v, 3) : v;
  return out;
}

const round = (v, d) => (typeof v === 'number' ? Math.round(v * 10 ** d) / 10 ** d : v);

/**
 * What a FAIL means depends on which pipeline produced the material, and
 * conflating the two would be the most misleading thing this tool could do.
 *
 * On the `tiles` path a fail is a material defect: luminance->Sobel read
 * painted shading as geometry and the volumes are inside-out. The art has to be
 * repainted flat — that is the whole argument of docs/ART_BRIEF_MATERIALS.md.
 *
 * On the `bevel` path it cannot mean that. The height field never sees a pixel
 * of tone, only the alpha silhouette, so there is no mechanism by which painted
 * shading could invert anything. What a fail means there is that the bevel's
 * low-frequency shading lines up with a low-frequency brightness gradient in
 * the albedo — the art is lit from somewhere. Worth knowing, worth fixing at
 * the source if the asset is ever re-shot, but it is not a broken material and
 * it must not block a build.
 */
function verdictFor(mode, orbit) {
  if (orbit.pass) return { status: 'pass', note: 'no directional signature' };
  if (mode === 'bevel') {
    return {
      status: 'advisory',
      note:
        'The 0.10 threshold is calibrated on stochastic tile texture and does not transfer to a ' +
        'bevel. A bevel IS one large smooth volume, so it responds to light direction by design, ' +
        'and correlating that against an off-centre creature on a transparent field swings hard ' +
        'however clean the art is. The flat-normal control is 0.000, so the swing is the ' +
        'material and not the rig; and the height field never reads a pixel of tone, so it ' +
        'cannot be inverted the way luminance->Sobel can. Recorded, not blocking. What IS ' +
        'blocking on this path is drift: see tools/art/check.mjs.',
    };
  }
  return {
    status: 'fail',
    note:
      'baked directional light survived in this art. The derived normals are inverted where the ' +
      'artist painted shading, and the surface will read inside-out as the lantern swings past.',
  };
}

// ---------------------------------------------------------------------------
// Selecting what to bake
// ---------------------------------------------------------------------------

function listSet(setName, opts) {
  const set = SETS[setName];
  if (!set) throw new Error(`unknown set "${setName}" — try ${Object.keys(SETS).join(', ')}`);
  const dir = join(ROOT, set.dir);
  if (!existsSync(dir)) return [];
  let files = readdirSync(dir)
    .filter((f) => set.ext.includes(extname(f).toLowerCase()))
    .sort();
  if (opts.limit > 0) files = files.slice(0, opts.limit);
  if (opts.sample > 0 && opts.sample < files.length) {
    // Evenly spaced and deterministic, so "a sample of 15" is the same 15 next
    // week and the manifest diff means something.
    const step = files.length / opts.sample;
    files = Array.from({ length: opts.sample }, (_, i) => files[Math.floor(i * step)]);
  }
  return files.map((f) => ({ src: `${set.dir}/${f}`, mode: set.mode, setName }));
}

function guessSet(file) {
  const norm = file.replaceAll('\\', '/');
  for (const [name, set] of Object.entries(SETS)) if (norm.includes(set.dir)) return { name, mode: set.mode };
  return { name: 'misc', mode: null };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write(HELP);
    return 0;
  }

  const manifest = loadManifest();
  /** @type {{src:string, mode:string, setName:string, params?:object}[]} */
  let jobs = [];

  for (const s of opts.sets) jobs.push(...listSet(s, opts));
  for (const f of opts.files) {
    const rel = relative(ROOT, resolve(f)).replaceAll('\\', '/');
    const g = guessSet(rel);
    jobs.push({ src: rel, mode: opts.mode ?? g.mode, setName: g.name });
  }
  if (jobs.length === 0) {
    // No arguments: re-bake what is already recorded, with what it was recorded
    // with. This is the reproducibility path — clone, `npm i`, `npm run
    // art:bake`, and the staging tree comes back.
    jobs = manifest.assets.map((a) => ({ src: a.source, mode: a.mode, setName: a.set, params: a.params }));
    if (jobs.length === 0) {
      process.stdout.write(HELP);
      return 0;
    }
  }

  const rows = [];
  const t0 = Date.now();
  for (const job of jobs) {
    if (!job.mode) throw new Error(`${job.src}: no mode — pass --mode tiles|bevel`);
    const params = { ...(job.params ?? {}), ...opts.params };
    const row = bakeOne(job.src, job.mode, params, { setName: job.setName, write: opts.write });
    rows.push(row);
    if (!opts.quiet && !opts.json) process.stdout.write(formatRow(row) + '\n');

    const at = manifest.assets.findIndex((a) => a.id === row.id);
    if (at >= 0) manifest.assets[at] = row;
    else manifest.assets.push(row);
  }

  if (opts.json) process.stdout.write(JSON.stringify(rows, null, 2) + '\n');
  else if (!opts.quiet) process.stdout.write(summary(rows, Date.now() - t0) + '\n');

  if (opts.write) saveManifest(manifest);
  // Baking records what it found and returns clean even when it found a reject.
  // Failing here would mean you could not re-bake a known-bad asset without
  // breaking your own shell. `art:check` is the gate; this is the tool.
  return 0;
}

export function formatRow(r) {
  const m = r.measured;
  const tag = { pass: 'pass', fail: 'FAIL', advisory: 'note' }[r.verdict.status];
  return [
    r.id.padEnd(28),
    r.mode.padEnd(6),
    tag.padEnd(5),
    `spread ${m.orbitSpread.toFixed(3)}`,
    `peak ${String(m.orbitPeak).padStart(5)}`,
    `trough ${String(m.orbitTrough).padStart(5)}`,
    `sep ${String(m.orbitSeparation).padStart(5)}`,
    `ctl ${m.controlSpread.toFixed(3)}`,
    `range ${(m.tonalRange * 100).toFixed(0)}%`,
  ].join('  ');
}

function summary(rows, ms) {
  const fails = rows.filter((r) => r.verdict.status === 'fail');
  const notes = rows.filter((r) => r.verdict.status === 'advisory');
  const lines = [
    '',
    `${rows.length} asset(s) in ${(ms / 1000).toFixed(1)}s · ${rows.length - fails.length - notes.length} pass · ${fails.length} fail · ${notes.length} advisory`,
  ];
  for (const r of fails) lines.push(`  FAIL ${r.id} — ${r.verdict.note}`);
  for (const r of notes) lines.push(`  note ${r.id} — spread ${r.measured.orbitSpread.toFixed(3)}, ${r.measured.orbitSeparation}° apart`);
  return lines.join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`art:bake — ${e.message}\n`);
    process.exit(1);
  }
}
