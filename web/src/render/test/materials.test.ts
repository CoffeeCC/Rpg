// =========================================================================
// HOW THE BAKED MAPS REACH THE GAME.
//
// `createMaterialLibrary` needs a WebGL2 context and cannot be tested here.
// What CAN be tested is the part that actually broke — the CONVENTION joining
// two programs that never call each other:
//
//   `tools/art/bake.mjs`  writes  <set>/<source basename>_<map>.png
//   `render/materials.ts` reads   art/materials/<set>/<name>_<map>.png
//
// Nothing enforces that at runtime. A missing bake is silent by design (a
// piece lights flat and the board still draws), so a renamed set or a changed
// suffix produces no error anywhere — just a game that quietly stops having
// relief again, which is the exact state ENGINE_PLAN §20 recorded. These tests
// are the only thing standing between the two halves of that path.
//
// The other two claims here are the ones that have cost hours before:
// NORMALS ARE NEVER sRGB, and a tile's derived relief is applied at 0.35.
// Both are asserted against the source, the way `lighting.test.ts` does, since
// neither is reachable without a GPU.
// =========================================================================
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAKED_BOARD_ROOT, BAKED_ROOT, FURNITURE_RELIEF, PIECE_RELIEF, TILE_RELIEF, bakedRef } from '../materials';
// The arena's name for the same directory. Imported rather than restated so
// the two screens cannot quietly start reading different trees.
import { BAKED_BOARD_ROOT as BATTLE_BOARD_ROOT } from '../battleMaterials';
import { ICON_ART, SPRITE_ART, TILE_TEXTURES } from '../../art/iconArt';
import { PAINTED_MONSTERS } from '../../art/paintedCharacters';

const ROOT = join(__dirname, '..', '..', '..', '..');
const materialsSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'materials.ts'), 'utf8');
const bakerSource = readFileSync(join(ROOT, 'tools', 'art', 'bake.mjs'), 'utf8');
const publishSource = readFileSync(join(ROOT, 'tools', 'art', 'blender', 'publish.mjs'), 'utf8');
const BOARD_DIR = join(ROOT, 'web', 'public', BAKED_BOARD_ROOT);

describe('the baker and the renderer agree on where the maps live', () => {
  it('publishes into exactly the directory the renderer reads', () => {
    // `PUBLISH_ROOT` is built out of path segments, so the assertion is on the
    // segments rather than on a joined string — a `join` in the baker and a URL
    // in the renderer can never be compared literally.
    for (const segment of BAKED_ROOT.split('/')) {
      expect(bakerSource, `bake.mjs does not publish into .../${segment}`).toContain(`'${segment}'`);
    }
    expect(bakerSource).toContain('PUBLISH_ROOT');
  });

  it('publishes the two maps the shader samples, and only those', () => {
    expect(bakerSource).toContain("PUBLISHED_MAPS = ['normal', 'albedo']");
    // Height and AO are inputs to the normal. Publishing them would double the
    // payload for something nothing at runtime reads.
    expect(materialsSource).not.toMatch(/_height\.png|_ao\.png/);
  });

  it('names its outputs the way the renderer asks for them', () => {
    for (const map of ['normal', 'albedo']) {
      expect(bakerSource, `bake.mjs does not write _${map}.png`).toContain(`_${map}.png`);
      expect(materialsSource, `materials.ts does not request _${map}.png`).toContain(`_${map}.png`);
    }
  });
});

describe('bakedRef — which art has a bake, from the URL alone', () => {
  it('claims every set the baker actually bakes', () => {
    // Read the baker's own set table rather than restating it, so adding a set
    // to one side and not the other fails here instead of in a screenshot.
    const sets = [...bakerSource.matchAll(/^\s{2}(\w+): \{ dir: 'web\/public\/art\/(\w+)'/gm)].map((m) => m[2]);
    expect(sets.length).toBeGreaterThan(3);
    for (const set of sets) {
      const ref = bakedRef(`art/${set}/thing.png`);
      expect(ref, `bakedRef does not recognise the "${set}" set`).not.toBeNull();
      expect(ref!.set).toBe(set);
      expect(ref!.name).toBe('thing');
    }
  });

  it('asks for a repaired albedo only where the bake produces one', () => {
    // The EDT bevel re-keys a luminance-keyed matte, so it emits an albedo. A
    // tile is luminance->Sobel and has no alpha to repair, so asking would be
    // a 404 on every floor load.
    expect(bakedRef('art/monsters/fangPup.png')!.bevel).toBe(true);
    expect(bakedRef('art/sprites/player.png')!.bevel).toBe(true);
    expect(bakedRef('art/tiles/hollow_ground.jpg')!.bevel).toBe(false);
    expect(bakerSource).toContain('if (baked.albedo)');
  });

  it('recognises the real URLs the game hands it', () => {
    for (const url of Object.values(SPRITE_ART)) expect(bakedRef(url), url).not.toBeNull();
    for (const url of Object.values(PAINTED_MONSTERS)) expect(bakedRef(url), url).not.toBeNull();
    for (const { ground, wall } of Object.values(TILE_TEXTURES)) {
      expect(bakedRef(ground), ground).not.toBeNull();
      expect(bakedRef(wall), wall).not.toBeNull();
    }
  });

  it('leaves everything else alone rather than firing two doomed requests', () => {
    for (const url of Object.values(ICON_ART)) expect(bakedRef(url), url).toBeNull();
    expect(bakedRef('art/cards/strike.png')).toBeNull();
    expect(bakedRef('art/backdrop_hollow.jpg')).toBeNull();
    expect(bakedRef('')).toBeNull();
    expect(bakedRef('art/monsters/fangPup.webp')).toBeNull();
  });

  it('takes the name from the file, so a bake follows a rename', () => {
    expect(bakedRef('/deep/path/art/monsters/two.words.png')!.name).toBe('two.words');
    expect(bakedRef('art/tiles/hollow_ground.jpg')!.name).toBe('hollow_ground');
  });
});

describe('the two upload rules that have each cost hours', () => {
  it('never uploads a normal map as sRGB', () => {
    // 0.5 means "no tilt on this axis". An sRGB decode turns it into 0.21 and
    // every surface in the scene lights as though tilted hard. The load helper
    // takes the flag, and the normal is the one caller that passes false.
    expect(materialsSource).toMatch(/srgb \? gl\.SRGB8_ALPHA8 : gl\.RGBA8/);
    expect(materialsSource).toMatch(/_normal\.png`, false,/);
    // ...and the two colour paths pass true.
    expect(materialsSource).toMatch(/_albedo\.png`, true,/);
    expect(materialsSource).toMatch(/loadImage\(url, true, takeAlbedo\)/);
  });

  it('tames a DERIVED tile normal without touching a piece bevel', () => {
    // ENGINE_PLAN §18.2, last item: at knee height N.L on the floor is ~0.05,
    // so a 15 degree bump multiplies it several times and the floor becomes
    // crumpled foil. The stress lab settled at 0.35. A piece is a billboard
    // facing the camera and never sees that angle, so it keeps its full bevel.
    expect(TILE_RELIEF).toBe(0.35);
    expect(PIECE_RELIEF).toBe(1);
    expect(TILE_RELIEF).toBeLessThan(PIECE_RELIEF);
  });
});

// =========================================================================
// THE BLENDER BOARD BAKES, ON THE MAP.
//
// A second publisher writes into the same tree as `bake.mjs` and by a
// different convention: `tools/art/blender/publish.mjs` emits `<name>.png`,
// `<name>_normal.png` and `<name>_material.png` for modelled geometry that has
// no source art to derive a name from. `materials.ts` had never heard of it —
// nineteen published material maps that nothing loaded, while the map went on
// synthesising its frame, rim and wood.
//
// SOURCE CONVENTIONS ONLY, for `battleMaterials.test.ts`'s stated reason:
// `web/public/` is gitignored and regenerated by `npm run art:board`, so a
// test that requires real Cycles output would be a false red on any checkout
// that has never run Blender. The one genuinely irreproducible claim — that
// the published tree really does carry all three maps — is gated on the
// directory existing.
// =========================================================================
describe('the map asks for the Blender board furniture at all', () => {
  const furniture = materialsSource.slice(materialsSource.indexOf('function requestFurniture('));

  it('reads out of the same directory the arena does', () => {
    // Two constants for one directory is how the two screens would drift.
    // `materials.ts` derives its own from `BAKED_ROOT` rather than restating
    // the path, and this is the assertion that the derivation still agrees.
    expect(BAKED_BOARD_ROOT).toBe(BATTLE_BOARD_ROOT);
    expect(BAKED_BOARD_ROOT.startsWith(`${BAKED_ROOT}/`)).toBe(true);
    for (const segment of BAKED_BOARD_ROOT.split('/')) {
      expect(publishSource, `publish.mjs does not publish into .../${segment}`).toContain(`'${segment}'`);
    }
  });

  it('THE GAP THIS CLOSES: every shape the map draws is actually requested', () => {
    // Before this, `materials.ts` contained none of these strings and the
    // board drew `boardFramePixels` / `boardRimPixels` / `woodField` instead.
    for (const name of [
      'board_frame',
      'board_frame_brass',
      'board_rim',
      'board_rim_brass',
      'wall_top',
      'wall_top_worn',
      'wall_face',
      'wall_face_chipped',
      'plinth',
      'plinth_small',
      'plinth_large',
    ]) {
      expect(materialsSource, `materials.ts never asks for ${name}`).toContain(`'${name}'`);
    }
    // ...and the generators are still built, because a missing bake has to
    // degrade to them rather than to a blank quad.
    expect(materialsSource).toContain('boardFramePixels');
    expect(materialsSource).toContain('boardRimPixels');
    expect(materialsSource).toContain('woodField');
  });

  it('BRASS IS ITS OWN REQUEST, never merged into the timber it sits on', () => {
    // `split()` renders `<name>` and `<name>_brass` from one assembly through
    // one camera frame so the metal can carry its own material map — roughness
    // 0.12 against timber's 0.86. One id for both would make the inlay light
    // like oak, which is precisely what Â§19.1 asks to be undone.
    for (const half of ['board_frame', 'board_rim']) {
      expect(materialsSource).toContain(`'${half}'`);
      expect(materialsSource).toContain(`'${half}_brass'`);
    }
  });

  it('THE THREE UPLOAD RULES, at the furniture call sites specifically', () => {
    // Colour decodes gamma; the other two are DATA and must not. The material
    // map is the newest and the least obvious: all four of its channels are
    // numbers, so an sRGB decode would bend roughness, specular, iridescence
    // and occlusion at once — turning brass's 0.12 roughness into 0.014 and
    // making every fitting a mirror.
    expect(furniture).toMatch(/\$\{name\}\.png`,\s*true,/);
    expect(furniture).toMatch(/\$\{name\}_normal\.png`,\s*false,/);
    expect(furniture).toMatch(/\$\{name\}_material\.png`,\s*false,/);
    expect(furniture).not.toMatch(/_normal\.png`,\s*true,/);
    expect(furniture).not.toMatch(/_material\.png`,\s*true,/);
  });

  it('gives a MODELLED relief its full strength, not the derived tile taming', () => {
    // TILE_RELIEF is 0.35 because a Sobel over painted luminance invents
    // relief the painter never drew. A Cycles normal is rendered from real
    // geometry: the chamfer is genuinely 30 degrees. Taming it to a third
    // would flatten authored shape back to a printed look.
    expect(FURNITURE_RELIEF).toBe(1);
    expect(FURNITURE_RELIEF).toBeGreaterThan(TILE_RELIEF);
    expect(furniture).toMatch(/normalStrength: FURNITURE_RELIEF/);
    expect(furniture).not.toMatch(/TILE_RELIEF/);
  });

  it('wraps only the shape that is authored to tile along a run', () => {
    // `board_rim` repeats every four tiles round the slab's edge; clamping it
    // would smear one copy across the whole edge. Everything else clamps,
    // because a plinth or a corner bracket sampled past its edge repeats the
    // next fitting into itself.
    expect(materialsSource).toMatch(/'board_rim', \{ repeat: true \}/);
    expect(materialsSource).toMatch(/'board_rim_brass', \{ repeat: true \}/);
    expect(materialsSource).toMatch(/'wall_top'\)/);
    expect(materialsSource).toMatch(/'plinth'\)/);
  });
});

// Gated on a real bake existing on this machine — real signal locally, inert
// on a fresh clone or in CI. Same discipline as `battleMaterials.test.ts`.
describe.skipIf(!existsSync(BOARD_DIR))('the published board tree, where one exists locally', () => {
  it('carries all THREE maps for every shape the map draws', () => {
    // The AO pass has been generated since M0 and thrown away; it now ships
    // folded into the material map's alpha. A shape with a colour and a normal
    // but no material map is one that silently loses its occlusion and its
    // roughness — which for brass is the difference between metal and paint.
    for (const name of [
      'board_frame',
      'board_frame_brass',
      'board_rim',
      'board_rim_brass',
      'wall_top',
      'wall_top_worn',
      'wall_face',
      'wall_face_chipped',
      'plinth',
      'plinth_small',
      'plinth_large',
    ]) {
      for (const suffix of ['', '_normal', '_material']) {
        const file = join(BOARD_DIR, `${name}${suffix}.png`);
        expect(existsSync(file), `missing ${name}${suffix}.png in the published tree`).toBe(true);
        expect(statSync(file).size).toBeGreaterThan(500);
      }
      expect(existsSync(join(BOARD_DIR, `${name}_ao.png`))).toBe(false);
    }
  });
});
