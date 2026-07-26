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

/**
 * PAINTER LAYERS — what a board is made of, in the order you would build it.
 *
 * Sorting purely by board `y` is right for things that all live at the same
 * elevation, and wrong the moment something is *printed on* the board rather
 * than *made of* it. The case that forces this is a contact shadow: a disc
 * lying under a piece at y = 7.8 spills forward into tile row 8, and tile row
 * 8 sorts AFTER it — so the front third of every shadow got sliced off by a
 * hard horizontal line wherever a piece stood in the far half of its tile.
 * (Which is 45% of the time, so it was not a corner case.)
 *
 * Layers fix it by saying what the y-sort cannot: the whole board surface is
 * laid down first, then everything resting on it, then everything standing up
 * off it. Within a layer, `y` still decides.
 *
 * This is safe against the old behaviour rather than merely different from it.
 * A lying quad at row r and a standing quad at row u can only overlap on
 * screen when `u - r < 1 + sin(tilt)/cos(tilt)` — about 2.4 rows at the
 * shipping tilt — and only when the lying one is BEHIND. Which is exactly the
 * case the layer order already gets right.
 */
export const LAYER_TABLE = -1;
/** The board's own top surface: tiles, the inlaid border, the frame. */
export const LAYER_BOARD = 0;
/** Printed on or resting on the board: contact shadows, piece bases, decals. */
export const LAYER_DECAL = 1;
/** Standing up off the board: pieces, wall front faces. */
export const LAYER_PIECE = 2;

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
  /**
   * STANDING UP, rather than lying on the board.
   *
   * This is the difference between a game piece and a painted decal, and it
   * is one trigonometric function. A quad lying on the board is squashed by
   * `cos(tilt)` — it is part of the floor and shrinks with it. A quad standing
   * up is scaled by `sin(tilt)`, because its height is measured along the axis
   * the camera is tilted TOWARD, not the one it is tilted away from.
   *
   * At the default 55 degrees those differ by about 1.4x, so getting it wrong
   * is not subtle — but the tell is at the extremes. Tilt to nearly straight
   * down and an upright sprite collapses to nothing (correct: you are looking
   * at the top of a standing card edge-on) while a flat one is full size. That
   * is exactly why a top-down camera cannot show pieces, stated as geometry.
   *
   * Used by hero and monster pieces, and by the FRONT FACE of a wall — the
   * surface that gives the lantern something to rake across, and the entire
   * reason the camera is tilted at all.
   */
  upright?: boolean;
  /**
   * Which coat of paint this belongs to. See the LAYER_ constants.
   *
   * Defaults to `LAYER_PIECE` for upright quads and `LAYER_BOARD` for flat
   * ones, which is exactly the old y-only behaviour for every sprite that
   * existed before layers — so nothing has to be migrated. Set it explicitly
   * only for the cases the default cannot know about: a shadow lying on the
   * board (LAYER_DECAL) and the table underneath it (LAYER_TABLE).
   */
  layer?: number;
}

/** The layer a sprite sorts in, with the default applied. */
export function spriteLayer(s: Sprite): number {
  return s.layer ?? (s.upright ? LAYER_PIECE : LAYER_BOARD);
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
  return [...sprites].sort(
    (a, b) => spriteLayer(a) - spriteLayer(b) || sortKey(a.position) - sortKey(b.position),
  );
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
/**
 * x, y (screen px), u, v, r, g, b, a, worldX, worldY, upright.
 *
 * The last three exist for the lighting pass. Every light calculation happens
 * in BOARD space, so the fragment shader needs to know which tile it is
 * standing on — and it cannot recover that by inverting the projection,
 * because an upright quad's screen position maps to a whole column of board
 * positions rather than to one. Carrying it costs 12 bytes a vertex and
 * removes an entire class of "the lighting is subtly offset from the geometry"
 * bug.
 */
export const FLOATS_PER_VERTEX = 11;
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
  const sin = Math.sin(camera.tilt);
  let o = 0;
  for (const sp of sprites) {
    const anchor = project(sp.position, camera);
    const w = sp.size.x * camera.zoom;
    // The one line that decides whether this is a piece or a decal. See the
    // `upright` note on Sprite: lying down squashes by cos, standing up
    // scales by sin, and they are the same number only at 45 degrees.
    const h = sp.size.y * camera.zoom * (sp.upright ? sin : cos);
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
    // Board position PER CORNER, so the lighting interpolates across the quad
    // instead of being constant over it.
    //
    // Carrying the sprite's anchor on every vertex was the first attempt and
    // it lit each tile as a single flat unit — the pool around the lantern
    // came out as a staircase of whole tiles rather than a circle. A tile is
    // a whole board unit across, so a light a few tiles away varies
    // noticeably from one edge of it to the other.
    //
    // The Y axis is the exception, and it is why this is not simply "use the
    // corner". A quad standing UP spans height, not depth: every part of a
    // wall's front face stands on the SAME floor tile, and that tile is what
    // decides how far the lantern is and what shadows it. Interpolating Y
    // there would light the top of the face as though it were a tile further
    // back, which bends every wall away from the light.
    const upright = sp.upright ? 1 : 0;
    const wx0 = sp.position.x - sp.size.x * pivot.x;
    const wx1 = wx0 + sp.size.x;
    const wy0 = sp.upright ? sp.position.y : sp.position.y - sp.size.y * pivot.y;
    const wy1 = sp.upright ? sp.position.y : wy0 + sp.size.y;
    // Same winding as `corners`: left/top, right/top, right/bottom, left/top,
    // right/bottom, left/bottom.
    const world: [number, number][] = [
      [wx0, wy0],
      [wx1, wy0],
      [wx1, wy1],
      [wx0, wy0],
      [wx1, wy1],
      [wx0, wy1],
    ];
    for (let c = 0; c < corners.length; c++) {
      const [x, y, u, v] = corners[c];
      out[o++] = x;
      out[o++] = y;
      out[o++] = u;
      out[o++] = v;
      out[o++] = r;
      out[o++] = g;
      out[o++] = b;
      out[o++] = a;
      out[o++] = world[c][0];
      out[o++] = world[c][1];
      out[o++] = upright;
    }
  }
  return out;
}
