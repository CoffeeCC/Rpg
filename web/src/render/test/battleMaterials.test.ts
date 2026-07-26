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
import { BAKED_BOARD_ROOT, IMPACT_CELL_MARGIN, impactAtlasPixels } from '../battleMaterials';
import { COMBAT_FX_KINDS } from '../battleScene';

const ROOT = join(__dirname, '..', '..', '..', '..');
const PUBLISH_DIR = join(ROOT, 'web', 'public', BAKED_BOARD_ROOT);
const STAGE_DIR = join(ROOT, 'web', 'art-staging', 'materials', 'board');
const battleMaterialsSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'battleMaterials.ts'), 'utf8');
const publishSource = readFileSync(join(ROOT, 'tools', 'art', 'blender', 'publish.mjs'), 'utf8');
const battleSceneSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'battleScene.ts'), 'utf8');

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
    for (const name of WIRED_SHAPES) {
      expect(battleMaterialsSource, `nothing ever asks for ${name}`).toContain(`'${name}'`);
    }
  });

  it('wraps BOTH halves of the rail split, not just the timber', () => {
    // `repeat` belongs to the shared FRAME's registered height axis, so the
    // brass row tiles exactly as the timber does. Requesting it without the
    // flag would CLAMP_TO_EDGE it and smear the last texel of brass down the
    // whole run, over a strip that is drawn at the identical rect as a
    // correctly tiled one — i.e. wrong in a way that reads as a bad bake.
    expect(battleMaterialsSource).toMatch(
      /'candle_rail_strip_brass',\s*\{\s*repeat:\s*true\s*\}/,
    );
  });

  it('follows the upload rules for the furniture path specifically', () => {
    // Colour: SRGB8_ALPHA8. Normal AND material: RGBA8, never sRGB. All three
    // go through the same `loadTexture` helper with the flag as a parameter,
    // so this checks the CALL SITES rather than the shared function once.
    expect(battleMaterialsSource).toMatch(/loadTexture\(`\$\{BAKED_BOARD_ROOT\}\/\$\{name\}\.png`, true,/);
    expect(battleMaterialsSource).toMatch(/loadTexture\(`\$\{BAKED_BOARD_ROOT\}\/\$\{name\}_normal\.png`, false,/);
    // THE MATERIAL MAP, which had no test of its own. Every channel is data:
    // an sRGB decode turns 0.12 roughness into 0.014 and brass becomes a
    // mirror, and 0.5 iridescence into 0.21. Same class of silent error as the
    // normal map, one texture later.
    expect(battleMaterialsSource).toMatch(
      /loadTexture\(`\$\{BAKED_BOARD_ROOT\}\/\$\{name\}_material\.png`, false,/,
    );
    expect(battleMaterialsSource).toMatch(/srgb \? gl\.SRGB8_ALPHA8 : gl\.RGBA8/);
  });
});

// Everything `requestBoardFurniture` and `requestHudFurniture` actually name.
// Kept apart from BOARD_SHAPES above on purpose: that list is "what §19.1 asks
// for and the bake produces", this one is "what the renderer will fetch at
// runtime", and the gap between them is exactly ENGINE_PLAN §21.7's open list.
const WIRED_SHAPES = [
  'candle_socket',
  'candle_rail_strip',
  'candle_rail_strip_brass',
  'board_corner_brass',
  'portrait_bezel',
  'portrait_bezel_small',
];

describe.skipIf(!existsSync(PUBLISH_DIR))('every shape the renderer fetches is on disk', () => {
  it('has all THREE maps published for each, colour, normal and material', () => {
    // `requestFurniture` issues three fetches per shape, and the material map
    // is the newest of them — the one a stale published tree would be missing.
    // Checked for the WIRED list rather than every §19.1 shape because a
    // missing map only matters where something asks for it.
    for (const name of WIRED_SHAPES) {
      for (const suffix of ['', '_normal', '_material']) {
        const file = join(PUBLISH_DIR, `${name}${suffix}.png`);
        expect(existsSync(file), `missing ${name}${suffix}.png in the published tree`).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(500);
      }
    }
  });
});

describe('the fight draws the same cut of a sprite the floor does', () => {
  // Paul, repeatedly: the pieces look transparent. The floor was fixed by
  // preferring `<name>_albedo.png` — the source art wearing a REPAIRED matte,
  // because the originals were cut with a luminance key and their alpha is
  // legibly a drawing of the character rather than a silhouette. Mean
  // fully-opaque across the set is 59.6% before and 91.6% after; `hero` alone
  // goes 41.14% -> 95.26%. The battle path never got that preference, so the
  // same piece was a ghost in a fight and solid on the floor — a bug that
  // survives precisely because each screen looks self-consistent on its own.
  const materialsSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'materials.ts'), 'utf8');

  it('routes figures through requestFigure, NOT the raw-url request()', () => {
    // This is the line that was wrong: `for (const a of art) lib.request(a.textureId, a.url)`.
    expect(battleMaterialsSource).toMatch(/for \(const a of art\) lib\.requestFigure\(a\.textureId, a\.url\)/);
    expect(battleMaterialsSource).not.toMatch(/for \(const a of art\) lib\.request\(a\.textureId, a\.url\)/);
  });

  it('asks for the repaired cut BEFORE falling back to the original', () => {
    const fig = battleMaterialsSource.slice(battleMaterialsSource.indexOf('function requestFigure('));
    const baked = fig.indexOf('_albedo.png');
    const fallback = fig.indexOf('loadTexture(url, true, false, takeAlbedo)');
    expect(baked).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(-1);
    // Order is the whole feature: the original must be the SECOND choice.
    expect(baked).toBeLessThan(fallback);
  });

  it('uses the same bake resolver the floor does, rather than a second guess', () => {
    // Two independent implementations of "where is this sprite's bake" is how
    // the two screens disagreed in the first place.
    expect(battleMaterialsSource).toMatch(/import \{[^}]*bakedRef[^}]*\} from '\.\/materials'/s);
    expect(materialsSource).toMatch(/export function bakedRef/);
  });

  it('loads the figure normal as RGBA8, never sRGB', () => {
    // An sRGB decode turns 0.5 ("no tilt") into 0.21 and every surface lights
    // as though tilted hard. Paid for once already on the map path.
    const fig = battleMaterialsSource.slice(battleMaterialsSource.indexOf('function requestFigure('));
    expect(fig).toMatch(/_normal\.png`, false,/);
    expect(fig).not.toMatch(/_normal\.png`, true,/);
  });

  it('gives a combatant full relief, not the tile-tamed strength', () => {
    // PIECE_RELIEF, not TILE_RELIEF: a billboard never sees the grazing angle
    // that forced derived tile normals down to 0.35.
    const fig = battleMaterialsSource.slice(battleMaterialsSource.indexOf('function requestFigure('));
    expect(fig).toMatch(/normalStrength: PIECE_RELIEF/);
  });
});

// =========================================================================
// THE IMPACT ATLAS (ENGINE_PLAN §21.7)
//
// `impactAtlasPixels` is the only part of the combat-FX port that is PIXELS,
// and pixels are exactly where this project's silent failures live: a shape
// generator that returns zero everywhere, a cell that bleeds into its
// neighbour, an atlas uploaded through the wrong colour rule. None of those
// throws, none of them fails `tsc`, and all of them look like art direction.
// So the coverage is asserted as arithmetic here rather than looked at once.
// =========================================================================
describe('the impact atlas is eight distinct, self-contained shapes', () => {
  const CELL = 64;
  const SIZE = CELL * 3;
  const atlas = impactAtlasPixels(CELL);

  /** Alpha at a pixel of one kind's cell, 0..255. */
  function alphaAt(index: number, x: number, y: number): number {
    const cx = (index % 3) * CELL;
    const cy = Math.floor(index / 3) * CELL;
    return atlas[((cy + y) * SIZE + (cx + x)) * 4 + 3];
  }

  function coverage(index: number): number {
    let n = 0;
    for (let y = 0; y < CELL; y++) for (let x = 0; x < CELL; x++) if (alphaAt(index, x, y) > 8) n++;
    return n / (CELL * CELL);
  }

  it('is a square RGBA8 buffer of exactly the size createRGBATexture demands', () => {
    // `createRGBATexture` throws on a mismatch rather than uploading a
    // garbled, offset-by-one-row texture — but only if the number agrees, and
    // the number is `cell * IMPACT_ATLAS_COLS` squared.
    expect(atlas.length).toBe(SIZE * SIZE * 4);
    expect(impactAtlasPixels(128).length).toBe((128 * 3) ** 2 * 4);
  });

  it('draws SOMETHING in every one of the eight cells', () => {
    // The failure this rejects is a shape function that falls through and
    // returns 0: the flare then draws a fully transparent quad, the light
    // still fires, and the fight looks like it has an invisible element.
    for (let i = 0; i < COMBAT_FX_KINDS.length; i++) {
      const c = coverage(i);
      expect(c, `${COMBAT_FX_KINDS[i]} has no coverage`).toBeGreaterThan(0.02);
      expect(c, `${COMBAT_FX_KINDS[i]} fills its whole cell`).toBeLessThan(0.75);
    }
  });

  it('draws a DIFFERENT something in each — no two kinds share a shape', () => {
    // A copy-paste in the switch passes the coverage test above perfectly
    // well. `hit` and `holy` are the two that are legitimately the same
    // family (the SVG draws one star for both), and they are deliberately
    // baked at different radii so even they are not byte-identical.
    const fingerprints = new Set<string>();
    for (let i = 0; i < COMBAT_FX_KINDS.length; i++) {
      let f = '';
      for (let y = 2; y < CELL; y += 3) for (let x = 2; x < CELL; x += 3) f += alphaAt(i, x, y) > 8 ? '1' : '0';
      expect(fingerprints.has(f), `${COMBAT_FX_KINDS[i]} is a duplicate shape`).toBe(false);
      fingerprints.add(f);
    }
  });

  it('keeps a transparent margin, so a cell cannot bleed into its neighbour', () => {
    // The atlas is uploaded WITHOUT mipmaps for this reason, and the margin
    // is the second belt: even at LINEAR magnification a sample that strays
    // past a cell edge has to land on nothing.
    const band = Math.max(1, Math.floor(CELL * IMPACT_CELL_MARGIN) - 1);
    for (let i = 0; i < COMBAT_FX_KINDS.length; i++) {
      for (let k = 0; k < CELL; k++) {
        for (let b = 0; b < band; b++) {
          expect(alphaAt(i, b, k), `${COMBAT_FX_KINDS[i]} touches its left edge`).toBe(0);
          expect(alphaAt(i, CELL - 1 - b, k), `${COMBAT_FX_KINDS[i]} touches its right edge`).toBe(0);
          expect(alphaAt(i, k, b), `${COMBAT_FX_KINDS[i]} touches its top edge`).toBe(0);
          expect(alphaAt(i, k, CELL - 1 - b), `${COMBAT_FX_KINDS[i]} touches its bottom edge`).toBe(0);
        }
      }
    }
  });

  it('leaves the ninth cell empty, because nothing ever addresses it', () => {
    expect(coverage(8)).toBe(0);
  });

  it('is a MASK: white wherever it is anything at all', () => {
    // The element's colour arrives as the sprite's tint (`IMPACT_LOOK`, which
    // is `art/impactFx.tsx`'s own palette in linear light). Baking colour into
    // the atlas as well would multiply the two and desaturate every flare.
    for (let p = 0; p < SIZE * SIZE; p++) {
      if (atlas[p * 4 + 3] === 0) continue;
      expect(atlas[p * 4]).toBe(255);
      expect(atlas[p * 4 + 1]).toBe(255);
      expect(atlas[p * 4 + 2]).toBe(255);
    }
  });

  it('is deterministic — the same bytes every time', () => {
    // No `Math.random` in a generator, for the same reason there is none in a
    // scene builder: two uploads of the same atlas must be byte-identical or
    // a pixel diff of a fight means nothing.
    const again = impactAtlasPixels(CELL);
    expect(again.length).toBe(atlas.length);
    for (let i = 0; i < atlas.length; i++) {
      if (atlas[i] !== again[i]) throw new Error(`byte ${i} differs between two generations`);
    }
  });

  it('has no Math.random anywhere on the fx path', () => {
    // Comments stripped: both files ARGUE about `Math.random` at length, and a
    // raw scan would fail on the argument rather than on a call.
    const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    expect(code(battleMaterialsSource)).not.toMatch(/Math\.random/);
    expect(code(battleSceneSource)).not.toMatch(/Math\.random/);
    // And the check is not vacuous — the stripper leaves real code alone.
    expect(code(battleSceneSource)).toMatch(/export function buildBattleScene/);
  });

  it('uploads the atlas as a mask, not a colour, and never mipmaps it', () => {
    // Both are call-site rules, and both are silent when broken: an sRGB
    // decode would bend the mask's midtones, and a mipmapped atlas bleeds
    // adjacent cells into each other at the coarse levels — a fire flare with
    // a ghost of a frost star in it.
    const call = /createRGBATexture\(gl, 128 \* IMPACT_ATLAS_COLS, impactAtlasPixels\(128\)([^)]*)\)/.exec(
      battleMaterialsSource,
    );
    expect(call, 'the impact atlas is not uploaded at all').not.toBeNull();
    expect(call![1]).not.toContain('srgb');
    expect(call![1]).not.toContain('mipmap');
  });

  it('is emissive, or a flare is only as bright as the light hitting it', () => {
    // `lighting.ts`: `albedo * (ambient + lit + uEmissive)`. Without the
    // emissive term a burst in a dark corner of the board is invisible — the
    // exact failure mode a lit renderer introduces that a DOM overlay never
    // had, and the reason the flame already carries one.
    const block = battleMaterialsSource.slice(
      battleMaterialsSource.indexOf('materials.set(MAT_IMPACT'),
    );
    expect(block.slice(0, 400)).toMatch(/emissiveStrength:\s*[\d.]+/);
  });
});
