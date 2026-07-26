// =========================================================================
// THE BOARD FURNITURE ACTUALLY REACHING THE ARENA.
//
// `createBattleMaterialLibrary`/`requestFurniture` need a WebGL2 context and
// cannot be exercised here — same limitation `materials.test.ts` states for
// the map's loader. What CAN be checked without a GPU, and what actually
// broke this session (ENGINE_PLAN §21): the Blender board bakes existed in
// `web/art-staging/materials/board/` and nothing ever copied them anywhere a
// build could reach, and nothing in the renderer ever asked for them.
//
// SOURCE CONVENTIONS ONLY — same discipline `materials.test.ts` already
// applies to the bevel/tile baker, and for the same reason: `web/public/` is
// gitignored and rebuilt by `npm run art:board`, which shells out to Blender.
// A test that asserts real files exist there passes on a machine that just
// ran the bake and fails on a fresh clone, in CI, or after `git clean` — a
// false red for anyone else who opens this repo, for a reason that has
// nothing to do with whether the code is right. So these check that the
// PUBLISHER'S OWN LOGIC agrees with the renderer's expectations (paths,
// filters, naming), not that today's `web/public/` happens to hold the
// output of a Cycles render.
//
// The one thing genuinely irreproducible without Blender — that the real
// published tree actually has these files — is a separate, opt-in check
// gated on the directory existing, so it adds value locally (as it did in
// catching the corner-brass orientation) without being able to fail a
// checkout that has never baked.
// =========================================================================
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAKED_BOARD_ROOT } from '../battleMaterials';

const ROOT = join(__dirname, '..', '..', '..', '..');
const PUBLISH_DIR = join(ROOT, 'web', 'public', BAKED_BOARD_ROOT);
const STAGE_DIR = join(ROOT, 'web', 'art-staging', 'materials', 'board');
const battleMaterialsSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'battleMaterials.ts'), 'utf8');
const publishSource = readFileSync(join(ROOT, 'tools', 'art', 'blender', 'publish.mjs'), 'utf8');

/** The ten shapes ENGINE_PLAN §19.1 lists, plus the three pre-existing wall
 *  fittings the same commit's header names alongside them. */
const BOARD_SHAPES = [
  'candle_socket',
  'candle_rail_strip',
  'portrait_bezel',
  'portrait_bezel_small',
  'lantern_cradle',
  'log_well',
  'pile_tray',
  'exhaust_grate',
  'brass_strap',
  'board_corner_brass',
  'sconce_bracket',
  'torch_bracket',
];

describe('the publisher agrees with the renderer on where board bakes live', () => {
  it("names the renderer's BAKED_BOARD_ROOT path, in segments", () => {
    // Segments, not a joined string — a `join()` in the publisher and a URL
    // literal in the renderer can never be compared as one path.
    for (const segment of BAKED_BOARD_ROOT.split('/')) {
      expect(publishSource, `publish.mjs does not mention .../${segment}`).toContain(`'${segment}'`);
    }
  });

  it('filters to colour + normal only, never the AO intermediate', () => {
    expect(publishSource).toMatch(/!f\.endsWith\('_ao\.png'\)/);
  });

  it('reads out of the staging directory bake.py actually writes to', () => {
    expect(publishSource).toContain("'art-staging'");
    expect(publishSource).toContain("'materials'");
    expect(publishSource).toContain("'board'");
  });
});

// Gated on the directory existing: real signal when a bake has been run on
// this machine (this is what actually caught the corner-brass orientation
// bug — see ENGINE_PLAN §21.7), inert everywhere else. `describe.skipIf`
// rather than a `console.warn` no-op: a skipped suite is visible in the
// vitest summary as "skipped", not silently absent.
describe.skipIf(!existsSync(PUBLISH_DIR))('the published tree, where one exists locally', () => {
  it('has a colour and a normal map for every §19.1 shape, and no AO', () => {
    for (const name of BOARD_SHAPES) {
      const albedo = join(PUBLISH_DIR, `${name}.png`);
      const normal = join(PUBLISH_DIR, `${name}_normal.png`);
      expect(existsSync(albedo), `missing ${name}.png in the published tree`).toBe(true);
      expect(existsSync(normal), `missing ${name}_normal.png in the published tree`).toBe(true);
      expect(statSync(albedo).size).toBeGreaterThan(500);
      expect(statSync(normal).size).toBeGreaterThan(500);
      expect(existsSync(join(PUBLISH_DIR, `${name}_ao.png`))).toBe(false);
    }
  });
});

// Same reasoning, for staging itself: real when this machine has baked,
// skipped otherwise. Confirms the shape list above isn't drifting from what
// bake.py actually produces.
describe.skipIf(!existsSync(STAGE_DIR))('staging, where a bake has actually run', () => {
  it('produced every shape this test file claims to check', () => {
    const files = new Set(readdirSync(STAGE_DIR));
    for (const name of BOARD_SHAPES) {
      expect(files.has(`${name}.png`), `staging has no ${name}.png`).toBe(true);
    }
  });
});

describe('battleMaterials.ts actually requests the published furniture', () => {
  it('has a requestFurniture entry point, not just request()', () => {
    // The gap this session closed: `MAT_SOCKET` existed in battleScene.ts and
    // was drawn conditionally on `has(MAT_SOCKET)`, but nothing ever supplied
    // it — there was no dual colour+normal loader for a baked board shape.
    expect(battleMaterialsSource).toContain('requestFurniture');
    expect(battleMaterialsSource).toContain('BAKED_BOARD_ROOT');
  });

  it('requests every wired shape by its real bake name', () => {
    for (const name of ['candle_socket', 'candle_rail_strip', 'board_corner_brass']) {
      expect(battleMaterialsSource, `requestBoardFurniture never asks for ${name}`).toContain(`'${name}'`);
    }
  });

  it('follows the two upload rules for the furniture path specifically', () => {
    // Colour: SRGB8_ALPHA8. Normal: RGBA8, never sRGB. Both textures go
    // through the same `loadTexture` helper with the flag as a parameter, so
    // this checks the CALL SITES rather than the shared function once.
    expect(battleMaterialsSource).toMatch(/loadTexture\(`\$\{BAKED_BOARD_ROOT\}\/\$\{name\}\.png`, true,/);
    expect(battleMaterialsSource).toMatch(/loadTexture\(`\$\{BAKED_BOARD_ROOT\}\/\$\{name\}_normal\.png`, false,/);
    expect(battleMaterialsSource).toMatch(/srgb \? gl\.SRGB8_ALPHA8 : gl\.RGBA8/);
  });
});
