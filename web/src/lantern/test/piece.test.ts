// =========================================================================
// PIECES, BASES AND CONTACT SHADOWS.
//
// Per LIGHTING_PLAN §10 the tests here are written against the WRONG
// behaviour rather than merely describing the right one. Two wrong
// behaviours are on trial:
//
//   1. "a lifted object gets a bigger shadow" — true, and half the law. A
//      shadow that widens without fading reads as the object growing, not
//      lifting. Asserted as a strict inequality on opacity, not a range.
//   2. "sort everything by board y" — which slices the front off every
//      contact shadow the moment a piece stands in the far half of its tile,
//      because the tile row in front sorts after it. The repro is computed
//      explicitly and shown to invert.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  baseDiscNormalPixels,
  baseDiscPixels,
  contactShadowPixels,
  contactShadowShape,
  contactShadowSprite,
  pieceBaseSprites,
} from '../scene/piece';
import { LAYER_BOARD, LAYER_DECAL, LAYER_PIECE, sortForPainting, spriteLayer, type Sprite } from '../scene/sprite';
import { sortKey } from '../scene/camera';

describe('the contact shadow falloff law', () => {
  it('is tightest and darkest at contact', () => {
    const flush = contactShadowShape({ radius: 0.4, height: 0, strength: 0.8 });
    expect(flush.radius).toBeCloseTo(0.4, 6);
    expect(flush.opacity).toBeCloseTo(0.8, 6);
  });

  it('THE REPRO: lifting an object must fade the shadow, not merely widen it', () => {
    const flush = contactShadowShape({ radius: 0.4, height: 0 });
    const lifted = contactShadowShape({ radius: 0.4, height: 0.9 });
    // The half everyone implements.
    expect(lifted.radius).toBeGreaterThan(flush.radius);
    // The half that makes it read as a lift rather than as a growth. A
    // widen-only implementation passes the line above and fails this one.
    expect(lifted.opacity).toBeLessThan(flush.opacity);
    // And it fades as the INVERSE SQUARE of the growth, because the same
    // blocked light is spread over that much more board.
    const grow = lifted.radius / flush.radius;
    expect(lifted.opacity).toBeCloseTo(flush.opacity / (grow * grow), 6);
  });

  it('is monotonic in height, both ways', () => {
    let lastR = 0;
    let lastO = Infinity;
    for (const height of [0, 0.25, 0.5, 1, 2, 4]) {
      const s = contactShadowShape({ radius: 0.4, height });
      expect(s.radius).toBeGreaterThan(lastR);
      expect(s.opacity).toBeLessThan(lastO);
      lastR = s.radius;
      lastO = s.opacity;
    }
  });

  it('never goes fully opaque or negative, however it is driven', () => {
    for (const strength of [-1, 0, 0.5, 1, 4]) {
      for (const height of [0, 3]) {
        const s = contactShadowShape({ radius: 0.4, height, strength });
        expect(s.opacity).toBeGreaterThanOrEqual(0);
        expect(s.opacity).toBeLessThanOrEqual(1);
      }
    }
  });

  it('spread controls how fast a lift softens the shadow', () => {
    const tight = contactShadowShape({ radius: 0.4, height: 0.5, spread: 3 });
    const loose = contactShadowShape({ radius: 0.4, height: 0.5, spread: 0.3 });
    expect(loose.radius).toBeGreaterThan(tight.radius);
    expect(loose.opacity).toBeLessThan(tight.opacity);
  });
});

describe('the shadow sprite is a multiply, expressed as a sprite', () => {
  const s = contactShadowSprite({ x: 3, y: 4 }, 'shadow', { radius: 0.5, strength: 0.6 });

  it('is black, so the standard blend leaves dst * (1 - alpha)', () => {
    // If the RGB were anything else this would ADD light where it should
    // remove it, and the shadow would read as a grey smear.
    expect(s.tint?.[0]).toBe(0);
    expect(s.tint?.[1]).toBe(0);
    expect(s.tint?.[2]).toBe(0);
    expect(s.tint?.[3]).toBeCloseTo(0.6, 6);
  });

  it('lies on the board, centred on the footprint', () => {
    expect(s.upright).toBeFalsy();
    expect(s.position.z).toBe(0);
    expect(s.pivot).toEqual({ x: 0.5, y: 0.5 });
    expect(s.size.x).toBeCloseTo(1, 6);
    expect(s.size.y).toBeCloseTo(1, 6);
  });

  it('sorts as a decal, not as board surface', () => {
    expect(spriteLayer(s)).toBe(LAYER_DECAL);
  });
});

describe('a base has thickness', () => {
  const parts = pieceBaseSprites({ x: 2, y: 5 }, 'base', 'shadow', { radius: 0.4, thickness: 0.12 });

  it('is shadow, then side, then top — in paint order', () => {
    expect(parts).toHaveLength(3);
    expect(parts[0].textureId).toBe('shadow');
    expect(parts[1].textureId).toBe('base');
    expect(parts[2].textureId).toBe('base');
    // The top is lifted; the side is not. That offset IS the thickness.
    expect(parts[1].position.z).toBe(0);
    expect(parts[2].position.z).toBeCloseTo(0.12, 6);
    // And the sort key must agree, or the side draws over the top and the
    // plinth turns inside out.
    expect(sortKey(parts[2].position)).toBeGreaterThan(sortKey(parts[1].position));
  });

  it('shades the side, because it faces down and away', () => {
    const side = parts[1].tint ?? [1, 1, 1, 1];
    const top = parts[2].tint ?? [1, 1, 1, 1];
    expect(side[0]).toBeLessThan(top[0]);
  });

  it('spills its shadow past the plinth, so a ring of contact shows', () => {
    expect(parts[0].size.x).toBeGreaterThan(parts[1].size.x);
  });

  it('puts every part on the decal layer', () => {
    for (const p of parts) expect(spriteLayer(p)).toBe(LAYER_DECAL);
  });
});

describe('painter layers', () => {
  const flat = (y: number, layer?: number): Sprite => ({
    position: { x: 0, y, z: 0 },
    size: { x: 1, y: 1 },
    uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
    textureId: 't',
    layer,
  });
  const standing = (y: number): Sprite => ({ ...flat(y), upright: true });

  it('defaults to the old y-only behaviour: flat is board, upright is piece', () => {
    expect(spriteLayer(flat(1))).toBe(LAYER_BOARD);
    expect(spriteLayer(standing(1))).toBe(LAYER_PIECE);
  });

  it('THE REPRO: a y-only sort draws the tile in front OVER the shadow under a piece', () => {
    // A piece standing at y = 7.8 — the far end of tile row 7. Its shadow
    // reaches forward to y = 8.3, into tile row 8.
    const tile8 = flat(8);
    const shadow = contactShadowSprite({ x: 0, y: 7.8 }, 'shadow', { radius: 0.5 });

    // The old rule, computed explicitly: sort by board y alone.
    const yOnly = [tile8, shadow].sort((a, b) => sortKey(a.position) - sortKey(b.position));
    // The tile lands LAST, so it paints over the front third of the shadow —
    // a hard horizontal cut across every shadow on the board.
    expect(yOnly[yOnly.length - 1]).toBe(tile8);

    // Layers invert it: the whole board surface goes down first.
    const layered = sortForPainting([tile8, shadow]);
    expect(layered[layered.length - 1]).toBe(shadow);
  });

  it('still sorts back to front WITHIN a layer', () => {
    const a = flat(5);
    const b = flat(1);
    const c = flat(3);
    expect(sortForPainting([a, b, c])).toEqual([b, c, a]);
  });

  it('keeps pieces above decals above board above table', () => {
    const order = sortForPainting([
      standing(9),
      flat(9, LAYER_DECAL),
      flat(9),
      flat(9, -1),
    ]);
    expect(order.map(spriteLayer)).toEqual([-1, LAYER_BOARD, LAYER_DECAL, LAYER_PIECE]);
  });

  it('is stable within a layer, so co-located sprites keep their given order', () => {
    const a = flat(2, LAYER_DECAL);
    const b = flat(2, LAYER_DECAL);
    expect(sortForPainting([a, b])).toEqual([a, b]);
    expect(sortForPainting([b, a])).toEqual([b, a]);
  });
});

describe('procedural pixels', () => {
  const alphaAt = (px: Uint8Array, size: number, x: number, y: number) => px[(y * size + x) * 4 + 3];

  it('the shadow disc is black everywhere and shaped only in alpha', () => {
    const size = 32;
    const px = contactShadowPixels(size);
    for (let i = 0; i < px.length; i += 4) {
      expect(px[i]).toBe(0);
      expect(px[i + 1]).toBe(0);
      expect(px[i + 2]).toBe(0);
    }
    // Solid core, empty rim. The corner is outside the disc entirely.
    expect(alphaAt(px, size, size / 2, size / 2)).toBeGreaterThan(240);
    expect(alphaAt(px, size, 0, 0)).toBe(0);
  });

  it('the shadow profile falls monotonically from the centre outward', () => {
    const size = 64;
    const px = contactShadowPixels(size);
    let last = 256;
    for (let x = size / 2; x < size; x++) {
      const a = alphaAt(px, size, x, size / 2);
      expect(a).toBeLessThanOrEqual(last);
      last = a;
    }
    expect(last).toBe(0);
  });

  it('the base disc is opaque inside and transparent outside', () => {
    const size = 64;
    const px = baseDiscPixels(size);
    expect(alphaAt(px, size, size / 2, size / 2)).toBe(255);
    expect(alphaAt(px, size, 0, 0)).toBe(0);
    // Darkened toward the rim, so the bevel reads even unlit.
    const mid = px[((size / 2) * size + size / 2) * 4];
    const rim = px[((size / 2) * size + (size - 2)) * 4];
    expect(rim).toBeLessThan(mid);
  });

  it('the base normal is flat in the middle and leans OUTWARD at the rim', () => {
    const size = 64;
    const px = baseDiscNormalPixels(size);
    const nx = (x: number, y: number) => px[(y * size + x) * 4] / 255 * 2 - 1;
    const ny = (x: number, y: number) => px[(y * size + x) * 4 + 1] / 255 * 2 - 1;
    const c = size / 2;
    // Middle: flat, pointing straight up out of the board.
    expect(Math.abs(nx(c, c))).toBeLessThan(0.02);
    expect(Math.abs(ny(c, c))).toBeLessThan(0.02);
    // Right rim leans +x; left rim leans -x. If these were the same sign the
    // whole disc would light from one side like a ramp, not a dome.
    expect(nx(size - 2, c)).toBeGreaterThan(0.3);
    expect(nx(1, c)).toBeLessThan(-0.3);
    // Bottom of the image is board +y (toward the camera) — see the
    // convention note in baseDiscNormalPixels. Getting this flipped is
    // invisible until the light passes the piece.
    expect(ny(c, size - 2)).toBeGreaterThan(0.3);
    expect(ny(c, 1)).toBeLessThan(-0.3);
  });

  it('every generated normal is a unit vector once decoded', () => {
    const size = 32;
    const px = baseDiscNormalPixels(size);
    for (let i = 0; i < px.length; i += 4) {
      const x = (px[i] / 255) * 2 - 1;
      const y = (px[i + 1] / 255) * 2 - 1;
      const z = (px[i + 2] / 255) * 2 - 1;
      expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 1);
    }
  });

  it('generates buffers the uploader will accept', () => {
    expect(contactShadowPixels(16).length).toBe(16 * 16 * 4);
    expect(baseDiscPixels(16).length).toBe(16 * 16 * 4);
    expect(baseDiscNormalPixels(16).length).toBe(16 * 16 * 4);
  });
});
