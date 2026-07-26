// =========================================================================
// SPRITES — the board's art, as data the batcher can sort and pack.
//
// A Sprite is a flat quad lying on the board plane, at a board position and a
// size in TILES — not pixels — so it scales with zoom exactly like the tile
// grid underneath it (camera.ts `tileScreenHeight`). That is deliberate for
// M1: today's art is flat 2D icons, and this draws them exactly where the DOM
// grid draws them now. Characters standing up as billboards is M3's job
// (ENGINE_PLAN §3) and will need a second quad construction that does not
// squash height by `cos(tilt)` the way this one does — a standing piece faces
// the camera, a floor decal lies on the board. Do not generalise this one
// early; the two cases have different math, not a shared parameter.
//
// Batching has one rule that matters more than the batch count: NEVER reorder
// across a paint-order boundary to get a bigger batch. Two overlapping
// sprites of different textures must draw in painter order or one draws
// through the other, and on a board where the hero can stand in front of or
// behind a wall every frame, that is not a hypothetical. So batching is
// "merge adjacent same-texture runs", not "sort by texture" — see
// `test/sprite.test.ts` for the run that a texture-first sort would get wrong.
// =========================================================================
import { project, sortKey, type Camera, type Vec2, type Vec3 } from './camera';

export interface UVRect {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

export type Tint = [r: number, g: number, b: number, a: number];

export interface Sprite {
  /** Board position of the anchor point (see `pivot`). */
  position: Vec3;
  /** Quad size in TILES, so it scales with zoom like everything else on the board. */
  size: Vec2;
  /**
   * Where `position` sits within the quad, 0..1 on each axis. Default
   * `{x:0.5, y:1}` — bottom-centre, which is where a floor tile's own
   * footprint sits under it.
   */
  pivot?: Vec2;
  uv: UVRect;
  /** Atlas identity. Batching groups adjacent sprites that share this. */
  textureId: string;
  /** Straight [0,1] multiplier, default opaque white. */
  tint?: Tint;
}

const DEFAULT_PIVOT: Vec2 = { x: 0.5, y: 1 };
const DEFAULT_TINT: Tint = [1, 1, 1, 1];

/**
 * Back-to-front, stable.
 *
 * Reuses `camera.sortKey` rather than reimplementing it, so the sprite order
 * and the occluder order can never disagree about which row is "in front".
 * Relies on `Array.prototype.sort` being stable (guaranteed since ES2019 /
 * every engine this project targets) so two sprites on the same tile keep
 * whatever order the scene builder gave them.
 */
export function sortForPainting(sprites: readonly Sprite[]): Sprite[] {
  return [...sprites].sort((a, b) => sortKey(a.position) - sortKey(b.position));
}

export interface SpriteBatch {
  textureId: string;
  sprites: Sprite[];
}

/**
 * Group ADJACENT same-texture sprites, in the order given.
 *
 * Must be called on already-painter-sorted input. Deliberately does not
 * sort by texture first — that would produce fewer, bigger batches at the
 * cost of drawing every sprite of one texture before any sprite of the next,
 * which is wrong the instant two textures interleave in depth. See the test
 * for the concrete repro: [A, A, B, A] must stay three batches, not collapse
 * to two.
 */
export function batchGroups(sorted: readonly Sprite[]): SpriteBatch[] {
  const out: SpriteBatch[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last && last.textureId === s.textureId) last.sprites.push(s);
    else out.push({ textureId: s.textureId, sprites: [s] });
  }
  return out;
}

/** x, y (screen px), u, v, r, g, b, a. */
export const FLOATS_PER_VERTEX = 8;
/** Two triangles, no index buffer — simplest thing that works at M1 sprite counts. */
export const VERTICES_PER_SPRITE = 6;

/**
 * Pack a run of sprites into one interleaved vertex buffer, screen space.
 *
 * Width scales by `zoom` alone; height also carries `cos(tilt)`, the same
 * squash `camera.tileScreenHeight` applies to the grid — a floor decal has to
 * shrink vertically exactly as much as the tile it sits on, or art and grid
 * drift apart the moment the tilt is not the default.
 */
export function buildVertexData(sprites: readonly Sprite[], camera: Camera): Float32Array {
  const out = new Float32Array(sprites.length * VERTICES_PER_SPRITE * FLOATS_PER_VERTEX);
  const cos = Math.cos(camera.tilt);
  let o = 0;
  for (const sp of sprites) {
    const anchor = project(sp.position, camera);
    const w = sp.size.x * camera.zoom;
    const h = sp.size.y * camera.zoom * cos;
    const pivot = sp.pivot ?? DEFAULT_PIVOT;
    const left = anchor.x - w * pivot.x;
    const top = anchor.y - h * pivot.y;
    const right = left + w;
    const bottom = top + h;
    const { u0, v0, u1, v1 } = sp.uv;
    const [r, g, b, a] = sp.tint ?? DEFAULT_TINT;

    const corners: [number, number, number, number][] = [
      [left, top, u0, v0],
      [right, top, u1, v0],
      [right, bottom, u1, v1],
      [left, top, u0, v0],
      [right, bottom, u1, v1],
      [left, bottom, u0, v1],
    ];
    for (const [x, y, u, v] of corners) {
      out[o++] = x;
      out[o++] = y;
      out[o++] = u;
      out[o++] = v;
      out[o++] = r;
      out[o++] = g;
      out[o++] = b;
      out[o++] = a;
    }
  }
  return out;
}
