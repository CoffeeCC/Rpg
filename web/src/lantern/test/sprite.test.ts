// =========================================================================
// SPRITE BATCHING.
//
// Per LIGHTING_PLAN §10: prefer tests that reject the old/naive behaviour.
// The naive batcher here is "sort by texture, then group" — fewer draw
// calls, wrong picture the moment two textures overlap in depth. It is
// computed explicitly below and shown to violate paint order.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { makeCamera } from '../scene/camera';
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
    expect((bl.x + br.x) / 2).toBeCloseTo(0 * CAM.zoom + CAM.viewport.x / 2, 6);
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
