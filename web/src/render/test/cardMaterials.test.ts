// =========================================================================
// THE CARD SET ACTUALLY REACHING THE HAND.
//
// Same split, same reasons, as `battleMaterials.test.ts`:
// `createCardMaterialLibrary` needs a WebGL2 context and cannot run here, and
// `web/public/` is gitignored and rebuilt by a Blender bake, so a test that
// asserts real PNGs exist there is a false red on a fresh clone. What CAN be
// tested without a GPU is the two things that were actually wrong:
//
//   THE REPACK. A foil bake is a MASK — white where the card is foil, black
//   elsewhere, on a fully opaque card-shaped alpha. Published as-is it draws a
//   black card with white lines on it. Cutting the gilt to the mask is the
//   whole of what makes it a sprite, and it is pure arithmetic.
//
//   THE NORMAL COMBINE. The foil quad covers the gilt at full alpha, so
//   without the moulding's relief in its normal a rare card's frame comes back
//   FLATTER than a common's — the rarity signal pointed backwards.
// =========================================================================
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// `cardPack.mjs`, not `publish.mjs`: the publisher imports `pngjs` out of the
// ROOT install and this test runs from `web/`, which has its own. The pure
// arithmetic was split out so this import needs nothing at all.
import {
  CARD_FOIL_MATERIAL,
  CARD_FOIL_TIERS,
  CARD_MATERIAL,
  combineNormals,
  cutFoilAlbedo,
} from '../../../../tools/art/blender/cardPack.mjs';
import { BAKED_CARD_ROOT } from '../cardMaterials';
import { CARD_RARITIES, cardFoilBakeName } from '../cardScene';

const ROOT = join(__dirname, '..', '..', '..', '..');
const PUBLISH_DIR = join(ROOT, 'web', 'public', BAKED_CARD_ROOT);
const publishSource = readFileSync(join(ROOT, 'tools', 'art', 'blender', 'publish.mjs'), 'utf8');
const cardMaterialsSource = readFileSync(join(ROOT, 'web', 'src', 'render', 'cardMaterials.ts'), 'utf8');

/** A one-pixel-wide strip of fake image data, in the shape `readImage` returns. */
function strip(pixels: readonly (readonly [number, number, number, number])[]) {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach((p, i) => {
    data[i * 4] = p[0];
    data[i * 4 + 1] = p[1];
    data[i * 4 + 2] = p[2];
    data[i * 4 + 3] = p[3];
  });
  return { width: pixels.length, height: 1, data };
}

/** Encode a tangent-space normal the way a bake does. */
function n(x: number, y: number, z: number, a = 255) {
  const len = Math.hypot(x, y, z) || 1;
  return [
    Math.round((x / len) * 127.5 + 127.5),
    Math.round((y / len) * 127.5 + 127.5),
    Math.round((z / len) * 127.5 + 127.5),
    a,
  ] as const;
}

/** Decode one pixel of a combined normal back to a vector. */
function decode(out: Uint8ClampedArray, i: number) {
  return {
    x: out[i * 4] / 127.5 - 1,
    y: out[i * 4 + 1] / 127.5 - 1,
    z: out[i * 4 + 2] / 127.5 - 1,
  };
}

describe('a foil mask becomes a sprite', () => {
  it('takes its colour from the gilt, never from an invented gold', () => {
    const border = strip([[201, 163, 41, 255], [201, 163, 41, 255]]);
    const mask = strip([[255, 255, 255, 255], [0, 0, 0, 255]]);
    const out = cutFoilAlbedo(border, mask);
    expect([out[0], out[1], out[2]]).toEqual([201, 163, 41]);
    expect([out[4], out[5], out[6]]).toEqual([201, 163, 41]);
  });

  it('carries the MASK in the alpha, which is what the mask was for', () => {
    // Published straight through, a mask's own alpha is the whole card
    // silhouette — measured at 254 mean over every tier — so the sprite would
    // paint an opaque black rectangle with white lines on it.
    const border = strip([[201, 163, 41, 255], [201, 163, 41, 255], [201, 163, 41, 255]]);
    const mask = strip([[255, 0, 0, 255], [0, 0, 0, 255], [128, 0, 0, 255]]);
    const out = cutFoilAlbedo(border, mask);
    expect(out[3]).toBe(255);
    expect(out[7]).toBe(0);
    expect(out[11]).toBe(128);
  });

  it('multiplies BOTH antialiased edges, so foil cannot spill past its metal', () => {
    // The gilt's edge texel is half-covered and the mask's is fully on. Taking
    // the mask alone would put a bright fringe on bare card stock beside every
    // corner brace.
    const border = strip([[201, 163, 41, 128]]);
    const mask = strip([[255, 255, 255, 255]]);
    expect(cutFoilAlbedo(border, mask)[3]).toBe(128);
  });

  it('publishes NOTHING for a tier whose mask is black', () => {
    // starter and common, and it is deliberate: foil is a rarity signal, so
    // the baseline has none. `bake.py` emits them as black masks rather than
    // omitting them so the lookup stays branchless.
    const border = strip([[201, 163, 41, 255], [201, 163, 41, 255]]);
    const black = strip([[0, 0, 0, 255], [0, 0, 0, 255]]);
    const out = cutFoilAlbedo(border, black);
    expect(out[3]).toBe(0);
    expect(out[7]).toBe(0);
  });
});

describe('the foil keeps the moulding it is stamped onto', () => {
  it('turns the surface the way the BASE does, not just the grating', () => {
    // Publishing the grating alone was the alternative, and it costs a rare
    // card the two beads and the sunken channel `build_card_border` cuts into
    // its frame — so a rare would read flatter than a common.
    const base = strip([n(0.6, 0, 0.8)]);
    const detail = strip([n(0, 0, 1)]);
    const v = decode(combineNormals(base, detail), 0);
    expect(v.x).toBeGreaterThan(0.4);
    expect(v.z).toBeGreaterThan(0);
  });

  it('carries the grating on TOP of the moulding rather than instead of it', () => {
    // Two texels on opposite flanks of one groove, both sitting on the same
    // stretch of bead. The bead's tilt must survive and the flanks must still
    // differ, or the diffraction has nothing to separate.
    const base = strip([n(0.5, 0, 0.87), n(0.5, 0, 0.87)]);
    const detail = strip([n(0.2, 0, 0.98), n(-0.2, 0, 0.98)]);
    const out = combineNormals(base, detail);
    const a = decode(out, 0);
    const b = decode(out, 1);
    // Both still lean the bead's way...
    expect(a.x).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(0);
    // ...and the two flanks are still apart.
    expect(a.x - b.x).toBeGreaterThan(0.2);
  });

  it('falls back to the grating where the gilt has no surface to describe', () => {
    // Outside the border's silhouette the bake leaves the map at zero, which
    // decodes to (-1,-1,-1) and normalises to nonsense. The published alpha is
    // zero there so nothing samples it today; a texture with garbage in it
    // would outlive that.
    const base = strip([[0, 0, 0, 0]]);
    const detail = strip([n(0.3, 0, 0.95)]);
    const v = decode(combineNormals(base, detail), 0);
    expect(v.x).toBeCloseTo(0.3, 1);
    expect(v.z).toBeGreaterThan(0.9);
  });

  it('always emits a unit vector, whatever it is handed', () => {
    // This feeds a normal map. A non-unit or non-finite normal lights as a
    // surface facing nowhere.
    const base = strip([n(0.9, 0.3, 0.3), [0, 0, 0, 255], n(0, 0, 1), [255, 255, 255, 255]]);
    const detail = strip([n(-0.9, -0.3, 0.3), [0, 0, 0, 255], n(0, 0, 1), [255, 255, 255, 255]]);
    const out = combineNormals(base, detail);
    for (let i = 0; i < 4; i++) {
      const v = decode(out, i);
      expect(Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z)).toBe(true);
      expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(1, 1);
      expect(out[i * 4 + 3]).toBe(255);
    }
  });
});

describe('what each layer is made of', () => {
  it('puts card stock and gilt at opposite ends of the roughness range', () => {
    // Halfway between reads as neither. Same argument the board's
    // BRASS/TIMBER pair makes, one shape family further on.
    expect(CARD_MATERIAL.card_stock.roughness).toBeGreaterThan(0.7);
    expect(CARD_MATERIAL.card_border.roughness).toBeLessThan(0.2);
    expect(CARD_MATERIAL.card_back.roughness).toBeLessThan(0.2);
    // And the stock keeps most of the specular OFF, so the global multiplier
    // that makes gilt shine does not also make card board shine.
    expect(CARD_MATERIAL.card_stock.specular).toBeLessThan(0.5);
    expect(CARD_MATERIAL.card_border.specular).toBe(1);
  });

  it('gives the FOIL a broader lobe than the gilt it is stamped onto', () => {
    // The whole reason the holo has anywhere to happen. At the gilt's own 0.12
    // the exponent is near 200 and the lobe is above 5% over a span of
    // dot(N, H) about 0.01 wide — one hundredth of a spectral cycle, so both
    // flanks of every groove land on the same colour and the result is gold
    // corduroy.
    expect(CARD_FOIL_MATERIAL.roughness).toBeGreaterThan(CARD_MATERIAL.card_border.roughness * 3);
    expect(CARD_FOIL_MATERIAL.specular).toBe(1);
  });

  it('publishes exactly the tiers a card can be', () => {
    // Both directions: a tier the union gains and the publisher does not is a
    // missing texture at runtime, and a tier published that the union does not
    // have is payload nothing can ever fetch. `card_foil_star` is the second.
    expect([...CARD_FOIL_TIERS].sort()).toEqual([...CARD_RARITIES].sort());
  });
});

describe('the publisher and the loader agree on where the card set lives', () => {
  it("names the loader's BAKED_CARD_ROOT path, in segments", () => {
    // Segments, not a joined string: a `join()` in the publisher and a URL
    // literal in the loader can never be compared as one path.
    for (const segment of BAKED_CARD_ROOT.split('/')) {
      expect(publishSource, `publish.mjs does not mention .../${segment}`).toContain(`'${segment}'`);
    }
    expect(BAKED_CARD_ROOT).not.toBe('art/materials/board');
  });

  it('uploads the normal and the material map as data, never as sRGB', () => {
    // Both have cost hours elsewhere in this project. An sRGB decode turns the
    // gilt's 0.12 roughness into 0.014 and makes every card border a mirror —
    // and it would bend the iridescence channel at the same time, so the one
    // channel this feature exists for would be wrong while still producing a
    // picture.
    expect(cardMaterialsSource).toMatch(/_normal\.png`,\s*false,/);
    expect(cardMaterialsSource).toMatch(/_material\.png`,\s*false,/);
    // ...and the colour pass as sRGB.
    expect(cardMaterialsSource).toMatch(/\$\{name\}\.png`,\s*true,/);
  });

  it('reads out of the staging directory the card bake writes to', () => {
    expect(publishSource).toContain("'art-staging'");
    expect(publishSource).toContain("'cards'");
  });
});

// Gated on the directory existing: real signal on a machine that has run the
// bake, inert everywhere else. `describe.skipIf` rather than a silent no-op —
// a skipped suite shows up in the vitest summary.
describe.skipIf(!existsSync(PUBLISH_DIR))('the published card set, when one has been baked', () => {
  const files = existsSync(PUBLISH_DIR) ? readdirSync(PUBLISH_DIR) : [];

  it('ships all three maps for every layer the renderer asks for', () => {
    const shapes = ['card_stock', 'card_border', 'card_back', ...CARD_RARITIES.map(cardFoilBakeName)];
    for (const shape of shapes) {
      for (const suffix of ['.png', '_normal.png', '_material.png']) {
        expect(files, `missing ${shape}${suffix}`).toContain(`${shape}${suffix}`);
      }
    }
  });

  it('never ships the AO intermediate — it rides in the material map alpha', () => {
    expect(files.filter((f) => f.endsWith('_ao.png'))).toEqual([]);
  });

  it('ships the star tier nowhere, because no card can select it', () => {
    // `bake.py` bakes it; `CardRarity` has no member for it. Publishing it
    // would be payload for a texture nothing can ever request.
    //
    // `star.` and `star_`, not `startsWith('card_foil_star')` — which also
    // matches `card_foil_starter` and made this pass for the wrong reason
    // until the real one was removed and it kept failing.
    expect(files.filter((f) => /^card_foil_star[._]/.test(f))).toEqual([]);
    expect(files, 'guards the check above from a tier rename').toContain('card_foil_starter.png');
  });
});
