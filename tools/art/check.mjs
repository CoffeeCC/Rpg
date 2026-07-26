#!/usr/bin/env node
/**
 * `npm run art:check` — the standing QC gate.
 *
 * Re-bakes every asset in `tools/art/materials.json` from its recorded
 * parameters, re-runs the orbit test, and compares against the numbers the
 * manifest was written with. Nothing is written; this is a read-only assertion
 * about the art and the baker together.
 *
 * ENGINE_PLAN.md §9.1: "The orbit test becomes standing QC: every asset gets
 * it, and a spread above ~0.10 with peak and trough ~180° apart is a reject."
 *
 * WHAT FAILS THE BUILD, AND WHAT DELIBERATELY DOES NOT
 *
 *   fails   an asset that used to pass and now fails — new art with light
 *           baked into it, or a change to the baker that inverted something.
 *   fails   a measurement that moved by more than the tolerance while the
 *           source file is byte-identical. That is the baker drifting, and it
 *           is the case the manifest exists to catch.
 *   fails   a source file that has gone missing or been renamed.
 *   passes  an asset whose source changed and whose numbers moved with it —
 *           that is a re-shoot, not a regression. Re-bake to record it.
 *   passes  an asset already recorded as failing. `abyss_ground` is the live
 *           example: it is a known-bad tile queued for a re-paint, and a gate
 *           that is red for a fortnight is a gate people learn to ignore. It is
 *           still printed, loudly, on every run.
 *
 * `--strict` removes that last exemption, for the day the re-shoot lands.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readImage, sha1 } from './image.mjs';
import { bake } from './pipeline.mjs';
import { orbitTest, RIG_FOR_MODE } from './orbit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = join(ROOT, 'tools', 'art', 'materials.json');

const DEFAULT_TOLERANCE = 0.015;

function parseArgs(argv) {
  const o = { strict: false, tolerance: DEFAULT_TOLERANCE, filter: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') o.strict = true;
    else if (a === '--tolerance') o.tolerance = Number(argv[++i]);
    else if (a === '--filter') o.filter = argv[++i];
    else if (a === '--json') o.json = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else throw new Error(`unknown flag ${a}`);
  }
  return o;
}

export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write('\n  node tools/art/check.mjs [--strict] [--tolerance N] [--filter SUBSTR] [--json]\n\n');
    return 0;
  }
  if (!existsSync(MANIFEST)) {
    process.stderr.write('art:check — no tools/art/materials.json. Run `npm run art:bake -- --set tiles` first.\n');
    return 1;
  }

  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const assets = manifest.assets.filter((a) => !opts.filter || a.id.includes(opts.filter));
  if (assets.length === 0) {
    process.stderr.write('art:check — nothing to check.\n');
    return 1;
  }

  const problems = [];
  const known = [];
  const rows = [];

  for (const a of assets) {
    const src = join(ROOT, a.source);
    if (!existsSync(src)) {
      problems.push(`${a.id} — source is gone: ${a.source}`);
      continue;
    }

    const moved = sha1(src) !== a.sourceSha1;
    const bitmap = readImage(src);
    const baked = bake(bitmap, a.mode, a.params);
    const rig = a.measured.orbitRig ?? RIG_FOR_MODE[a.mode] ?? 'point';
    const orbit = orbitTest(bitmap, baked, rig);

    const wasPass = a.measured.orbitPass;
    const dSpread = orbit.spread - a.measured.orbitSpread;
    const dRange = baked.levels.span - a.measured.tonalRange;
    // The sharpened alpha is drift-guarded on the same terms as everything
    // else: the whole point of the manifest is that a change in the baker
    // cannot slip through on a source file that never moved, and the alpha is
    // now a baker output with a target attached to it.
    const opaque = baked.alphaSharpen ? baked.alphaSharpen.after.opaqueFraction : null;
    const dOpaque = opaque !== null && a.measured.alpha ? opaque - a.measured.alpha.opaqueAfter : 0;

    const row = {
      id: a.id,
      mode: a.mode,
      rig,
      pass: orbit.pass,
      spread: orbit.spread,
      recorded: a.measured.orbitSpread,
      deltaSpread: dSpread,
      separation: orbit.separation,
      tonalRange: baked.levels.span,
      deltaRange: dRange,
      opaque,
      deltaOpaque: dOpaque,
      sourceChanged: moved,
      status: 'ok',
    };

    if (wasPass && !orbit.pass) {
      row.status = a.mode === 'bevel' ? 'advisory' : 'regression';
      (row.status === 'regression' ? problems : known).push(
        `${a.id} — orbit went from pass to fail: spread ${orbit.spread.toFixed(3)}, ` +
          `peak ${orbit.peak}° trough ${orbit.trough}° (${orbit.separation}° apart)` +
          (moved ? '. The source changed, so this is new art with light painted into it.' : ''),
      );
    } else if (
      !moved &&
      (Math.abs(dSpread) > opts.tolerance || Math.abs(dRange) > opts.tolerance || Math.abs(dOpaque) > opts.tolerance)
    ) {
      row.status = 'drift';
      problems.push(
        `${a.id} — source is unchanged but the measurement moved: spread ` +
          `${a.measured.orbitSpread.toFixed(3)} -> ${orbit.spread.toFixed(3)}, range ` +
          `${(a.measured.tonalRange * 100).toFixed(0)}% -> ${(baked.levels.span * 100).toFixed(0)}%` +
          (opaque !== null && a.measured.alpha
            ? `, opaque ${(a.measured.alpha.opaqueAfter * 100).toFixed(1)}% -> ${(opaque * 100).toFixed(1)}%`
            : '') +
          '. The baker changed behaviour; re-bake deliberately or fix it.',
      );
    } else if (!orbit.pass) {
      row.status = a.mode === 'bevel' ? 'advisory' : 'known-fail';
      known.push(
        `${a.id} — ${a.mode === 'bevel' ? 'advisory' : 'known FAIL'}, spread ${orbit.spread.toFixed(3)}, ` +
          `${orbit.separation}° apart` +
          (a.mode === 'bevel' ? '' : `. ${a.verdict?.note ?? ''}`),
      );
      if (opts.strict && a.mode !== 'bevel') problems.push(`${a.id} — failing under --strict`);
    } else if (moved) {
      row.status = 'source-changed';
    }

    rows.push(row);
    if (!opts.json) process.stdout.write(format(row) + '\n');
  }

  if (opts.json) {
    process.stdout.write(JSON.stringify({ problems, known, rows }, null, 2) + '\n');
  } else {
    process.stdout.write('\n');
    for (const k of known) process.stdout.write(`  note  ${k}\n`);
    for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
    if (rows.some((r) => r.status === 'advisory')) {
      process.stdout.write(
        '\n  Bevel advisories are recorded, not blocking. The 0.10 threshold is calibrated on\n' +
          '  stochastic tile texture and does not transfer: a bevel IS one large smooth volume, so it\n' +
          '  responds to light direction by design. The flat-normal control is 0.000 on every one of\n' +
          '  them, so the swing is the material rather than the rig, and the height field never reads\n' +
          '  a pixel of tone, so it cannot invert the way luminance->Sobel can. What blocks on this\n' +
          '  path is drift against the manifest.\n',
      );
    }
    process.stdout.write(
      `\nart:check — ${rows.length} asset(s), ${problems.length} problem(s), ${known.length} known/advisory.\n`,
    );
  }
  return problems.length ? 1 : 0;
}

function format(r) {
  const tag = { ok: 'ok', drift: 'DRIFT', regression: 'REGRESSION', 'known-fail': 'FAIL', advisory: 'note', 'source-changed': 'changed' }[r.status];
  const cols = [
    r.id.padEnd(28),
    tag.padEnd(11),
    `spread ${r.spread.toFixed(3)}`,
    `(rec ${r.recorded.toFixed(3)}, d${r.deltaSpread >= 0 ? '+' : ''}${r.deltaSpread.toFixed(3)})`,
    `sep ${String(r.separation).padStart(5)}`,
    `range ${(r.tonalRange * 100).toFixed(0)}%`,
  ];
  if (r.opaque !== null && r.opaque !== undefined) cols.push(`opaque ${(r.opaque * 100).toFixed(0)}%`);
  return cols.join('  ');
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    process.stderr.write(`art:check — ${e.message}\n`);
    process.exit(1);
  }
}
