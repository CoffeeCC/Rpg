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
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAKED_ROOT, PIECE_RELIEF, TILE_RELIEF, bakedRef } from '../materials';
import { ICON_ART, SPRITE_ART, TILE_TEXTURES } from '../../art/iconArt';
import { PAINTED_MONSTERS } from '../../art/paintedCharacters';

const ROOT = join(__dirname, '..', '..', '..', '..');
const materialsSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'materials.ts'), 'utf8');
const bakerSource = readFileSync(join(ROOT, 'tools', 'art', 'bake.mjs'), 'utf8');

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
