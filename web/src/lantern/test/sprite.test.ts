// =========================================================================
// SPRITE BATCHING.
//
// Per LIGHTING_PLAN §10: prefer tests that reject the old/naive behaviour.
// The naive batcher here is "sort by texture, then group" — fewer draw
// calls, wrong picture the moment two textures overlap in depth. It is
// computed explicitly below and shown to violate paint order.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { makeCamera, MIN_TILT } from '../scene/camera';
import {
  batchGroups,
  buildVertexData,
  FLOATS_PER_VERTEX,
  sortForPainting,
  VERTICES_PER_SPRITE,
  type Sprite,
} from '../scene/sprite';

const CAM = makeCamera({ centre: { x: 0, y: 0 }, zoom: 48, viewport: { x: 1280, y: 800 } });

function sprite(textureId: string, y: number, z = 0): Sprite {
  return {
    position: { x: 0, y, z },
    size: { x: 1, y: 1 },
    uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
    textureId,
  };
}

describe('painter order', () => {
  it('sorts back to front, matching camera.sortKey', () => {
    const input = [sprite('a', 5), sprite('b', 1), sprite('c', 3)];
    const sorted = sortForPainting(input);
    expect(sorted.map((s) => s.position.y)).toEqual([1, 3, 5]);
  });

  it('is stable: sprites on the same tile keep their given order', () => {
    const a = sprite('floor', 2);
    const b = sprite('clutter', 2);
    expect(sortForPainting([a, b])).toEqual([a, b]);
    expect(sortForPainting([b, a])).toEqual([b, a]);
  });
});

describe('batching must not reorder across a paint-order boundary', () => {
  it('THE REPRO: a texture-first sort collapses [A,A,B,A] to 2 batches and draws B under the wrong sprite', () => {
    // Three sprites at increasing depth (B is in front of the second A), one
    // texture change in between. This is already painter-sorted input.
    const sorted = [sprite('A', 1), sprite('A', 2), sprite('B', 3), sprite('A', 4)];

    // The naive alternative: group by texture id regardless of position.
    const naive = new Map<string, Sprite[]>();
    for (const s of sorted) {
      const arr = naive.get(s.textureId) ?? [];
      arr.push(s);
      naive.set(s.textureId, arr);
    }
    // Naive batching produces 2 groups (A, B) — losing the fact that one A
    // sprite is behind B and another is in front of it.
    expect(naive.size).toBe(2);

    // The correct batcher keeps the interleaving: 3 batches, not 2.
    expect(batchGroups(sorted).length).toBe(3);
  });

  it('merges only ADJACENT runs of the same texture', () => {
    const sorted = [sprite('A', 1), sprite('A', 2), sprite('B', 3), sprite('A', 4)];
    const batches = batchGroups(sorted);
    expect(batches.length).toBe(3);
    expect(batches[0].textureId).toBe('A');
    expect(batches[0].sprites.length).toBe(2);
    expect(batches[1].textureId).toBe('B');
    expect(batches[1].sprites.length).toBe(1);
    expect(batches[2].textureId).toBe('A');
    expect(batches[2].sprites.length).toBe(1);
  });

  it('never merges a texture with itself across a gap, even with many sprites', () => {
    const sorted = [
      sprite('wall', 1),
      sprite('wall', 1.1),
      sprite('hero', 1.2),
      sprite('wall', 1.3),
      sprite('wall', 1.4),
    ];
    const batches = batchGroups(sorted);
    expect(batches.map((b) => b.textureId)).toEqual(['wall', 'hero', 'wall']);
    expect(batches.reduce((n, b) => n + b.sprites.length, 0)).toBe(sorted.length);
  });

  it('one texture straight through is one batch', () => {
    const sorted = [sprite('floor', 1), sprite('floor', 2), sprite('floor', 3)];
    expect(batchGroups(sorted).length).toBe(1);
  });
});

describe('vertex data', () => {
  it('emits 6 vertices of 8 floats per sprite', () => {
    const sprites = [sprite('a', 1), sprite('a', 2)];
    const verts = buildVertexData(sprites, CAM);
    expect(verts.length).toBe(sprites.length * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX);
  });

  it('the bottom edge of a bottom-pivoted quad sits exactly on the projected anchor', () => {
    const sp = sprite('a', 4);
    const verts = buildVertexData([sp], CAM);
    // Vertices 2 and 5 (0-indexed) are the bottom-right and bottom-left corners.
    const stride = FLOATS_PER_VERTEX;
    const byRow = (i: number) => ({ x: verts[i * stride], y: verts[i * stride + 1] });
    const bl = byRow(5);
    const br = byRow(2);
    expect(bl.y).toBeCloseTo(br.y, 9);
    // Default pivot is bottom-centre: the two bottom corners straddle the
    // anchor x, and their average must equal it.
    // The sprite sits at board x = 0, which is the camera centre, so the
    // anchor lands at the middle of the viewport.
    expect((bl.x + br.x) / 2).toBeCloseTo(CAM.viewport.x / 2, 6);
  });

  it("REPRO: quad height must carry the camera's tilt squash, or art drifts off the grid", () => {
    const tilted = makeCamera({ ...CAM, tilt: 1.0 });
    const sp: Sprite = {
      position: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1 },
      pivot: { x: 0.5, y: 0.5 },
      uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
      textureId: 'a',
    };
    const verts = buildVertexData([sp], tilted);
    const top = verts[1];
    const bottom = verts[5 * FLOATS_PER_VERTEX + 1];
    const measuredHeight = bottom - top;
    // The naive (wrong) height ignores tilt entirely.
    const naiveHeight = 1 * tilted.zoom;
    const correctHeight = 1 * tilted.zoom * Math.cos(tilted.tilt);
    // Float32-precision (the vertex buffer is a Float32Array), not float64.
    expect(measuredHeight).toBeCloseTo(correctHeight, 4);
    expect(Math.abs(measuredHeight - naiveHeight)).toBeGreaterThan(5);
  });

  it('carries UVs through to the correct corners', () => {
    const sp: Sprite = {
      position: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1 },
      pivot: { x: 0.5, y: 0.5 },
      uv: { u0: 0.25, v0: 0.1, u1: 0.75, v1: 0.9 },
      textureId: 'a',
    };
    const verts = buildVertexData([sp], CAM);
    // Float32-precision: the vertex buffer is a Float32Array.
    const uvAt = (i: number) => [verts[i * FLOATS_PER_VERTEX + 2], verts[i * FLOATS_PER_VERTEX + 3]];
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));
    close(uvAt(0), [0.25, 0.1]); // top-left
    close(uvAt(1), [0.75, 0.1]); // top-right
    close(uvAt(2), [0.75, 0.9]); // bottom-right
    close(uvAt(5), [0.25, 0.9]); // bottom-left
  });

  it('defaults to opaque white tint and honours an explicit one', () => {
    const sp: Sprite = {
      position: { x: 0, y: 0, z: 0 },
      size: { x: 1, y: 1 },
      uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
      textureId: 'a',
      tint: [1, 0.5, 0.25, 0.8],
    };
    const verts = buildVertexData([sp], CAM);
    const close = (a: number[], b: number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 5));
    close([verts[4], verts[5], verts[6], verts[7]], [1, 0.5, 0.25, 0.8]);

    const plain = buildVertexData([{ ...sp, tint: undefined }], CAM);
    close([plain[4], plain[5], plain[6], plain[7]], [1, 1, 1, 1]);
  });
});

/**
 * STANDING UP.
 *
 * Paul's organising idea is that the hero and the monsters are game pieces on
 * a board (ENGINE_PLAN §1.2). Before `upright`, every sprite was scaled by
 * `cos(tilt)` — which is to say every sprite was a floor decal, and the engine
 * could not draw a standing piece at all. These tests are written against that
 * old behaviour rather than merely describing the new one, per LIGHTING_PLAN §10.
 */
describe('pieces stand up; decals lie down', () => {
  const CAM = makeCamera({ centre: { x: 0, y: 0 }, zoom: 100, viewport: { x: 800, y: 600 } });
  const UVFULL = { u0: 0, v0: 0, u1: 1, v1: 1 };
  const make = (upright: boolean): Sprite => ({
    position: { x: 0, y: 0, z: 0 },
    size: { x: 1, y: 1 },
    pivot: { x: 0.5, y: 1 },
    uv: UVFULL,
    textureId: 't',
    upright,
  });
  /**
   * Screen height of the quad, read back out of the packed vertex buffer.
   *
   * Compared to 3 decimal places, not more: the buffer is a Float32Array, so
   * everything here has already been rounded to single precision. Asserting
   * to 6 places is asserting about float32 rounding rather than about the
   * projection, and it fails by ~7e-6 for reasons that have nothing to do
   * with the code under test.
   */
  const heightOf = (s: Sprite, cam = CAM) => {
    const d = buildVertexData([s], cam);
    const ys: number[] = [];
    for (let i = 0; i < 6; i++) ys.push(d[i * FLOATS_PER_VERTEX + 1]);
    return Math.max(...ys) - Math.min(...ys);
  };

  it('scales an upright sprite by sin(tilt), not cos', () => {
    expect(heightOf(make(true))).toBeCloseTo(CAM.zoom * Math.sin(CAM.tilt), 3);
    expect(heightOf(make(false))).toBeCloseTo(CAM.zoom * Math.cos(CAM.tilt), 3);
  });

  it('makes a real difference at the default tilt', () => {
    // ~1.43x at 55 degrees. If these were within a few percent the flag would
    // not be worth having.
    expect(heightOf(make(true)) / heightOf(make(false))).toBeGreaterThan(1.3);
  });

  it('collapses a standing piece as the camera goes top-down — the old behaviour, inverted', () => {
    // THE REPRO. Nearly straight down, a decal is full size and a standing
    // piece is edge-on and nearly invisible. Before `upright` every sprite
    // took the decal branch, which is why a top-down board has no pieces on
    // it — only pictures of pieces.
    // `makeCamera` clamps to MIN_TILT, so "top-down" is as flat as the engine
    // will allow rather than truly zero — which is the point of the clamp.
    const flatCam = makeCamera({ ...CAM, tilt: 0 });
    expect(flatCam.tilt).toBe(MIN_TILT);
    const decal = heightOf(make(false), flatCam);
    const piece = heightOf(make(true), flatCam);
    expect(decal).toBeGreaterThan(CAM.zoom * 0.95);
    expect(piece).toBeLessThan(CAM.zoom * 0.2);
    // Asserted as a ratio too, which does not move if MIN_TILT is retuned.
    expect(decal / piece).toBeGreaterThan(5);
    // And the relationship inverts at the shipping tilt: a piece is TALLER
    // than a decal there, which is what makes it read as standing.
    expect(heightOf(make(true)) / heightOf(make(false))).toBeGreaterThan(1);
  });

  it('and the two agree at exactly 45 degrees, where sin equals cos', () => {
    const cam45 = makeCamera({ ...CAM, tilt: Math.PI / 4 });
    expect(heightOf(make(true), cam45)).toBeCloseTo(heightOf(make(false), cam45), 3);
  });

  it('defaults to lying down, so existing scenes are unchanged', () => {
    const noFlag: Sprite = { position: { x: 0, y: 0, z: 0 }, size: { x: 1, y: 1 }, uv: UVFULL, textureId: 't' };
    expect(heightOf(noFlag)).toBeCloseTo(CAM.zoom * Math.cos(CAM.tilt), 3);
  });
});
