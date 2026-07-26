// =========================================================================
// THE BOARD CAMERA — how a table becomes a screen.
//
// Paul: "the Player and the map should be like Game pieces on a Board game
// and the UI should be Part of the Board game map itself."
//
// So the camera is a person leaning over a table. Not a satellite looking
// straight down, and not a diamond-grid isometric view — those are the two
// things a board is not. You look at a board from above at an ANGLE, close
// enough that the pieces have height and far enough that you can read the
// whole thing.
//
// The projection is ORTHOGRAPHIC WITH A TILT, and the choice earns its keep
// three separate ways (docs/ENGINE_PLAN.md §1.2, LIGHTING_PLAN.md §12):
//
//   - Rows stay rows and columns stay columns, so every occluder is still an
//     axis-aligned rectangle and the whole shadow pipeline survives.
//   - `nav/geometry.ts` picks controller focus by spatial scoring over
//     bounding boxes. A rotated grid breaks that; a squashed one does not.
//   - Walls get a visible FRONT FACE, which is the entire reason to tilt.
//     Straight down, a lantern has nothing to rake across but floor.
//
// Orthographic rather than perspective, deliberately. A perspective camera
// projects a square tile to a TRAPEZOID that changes shape depending on where
// on screen it sits, which would make the tile grid non-uniform, break the
// rectangle-occluder guarantee above, and make hit-testing a per-tile inverse
// rather than one division. Every visual benefit here comes from the tilt; the
// vanishing point buys nothing on a table you are looking straight at.
// =========================================================================

/** A point on the board. `z` is height ABOVE the board, not depth into it. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * How the board is being looked at.
 *
 * World units are TILES, not pixels. That is the whole point of solving in
 * world space (LIGHTING_PLAN §12): the light, the occluders and the lattice all
 * live in tiles, and `zoom` is the only thing that knows about pixels. Change
 * the breakpoint and one number moves.
 */
export interface Camera {
  /** Which board position sits at the centre of the viewport, in tiles. */
  centre: Vec2;
  /** Screen pixels per board tile, before the tilt squash. */
  zoom: number;
  /**
   * How far the view is tilted from straight-down, in radians.
   *
   * 0 is a satellite: `cos = 1`, no vertical squash, and height contributes
   * nothing — pieces would be invisible discs. PI/2 is edge-on: the board
   * collapses to a line. The usable band is roughly 0.6–1.1 rad (35°–63°),
   * and `DEFAULT_TILT` sits in it for the reasons given there.
   */
  tilt: number;
  /** Viewport size in CSS px. */
  viewport: Vec2;
}

/**
 * 55°, and it is a considered number rather than a nice-looking one.
 *
 * The tilt trades two things against each other. `cos(tilt)` is how much board
 * you still see — squash it too hard and the map becomes a letterbox with no
 * room for the grid. `sin(tilt)` is how much a piece's height moves it up the
 * screen — too little and pieces are stickers lying flat on the board.
 *
 * At 55°: `cos ≈ 0.574`, so a tile is a little over half as tall as it is
 * wide — the proportion a board actually presents when you sit at it, and
 * still wide enough that a 20x12 floor fits a 16:9 viewport. `sin ≈ 0.819`, so
 * a piece one tile tall lifts most of a tile up the screen and reads as
 * standing rather than lying.
 *
 * It is also comfortably inside the band where a wall's front face is taller
 * than a couple of pixels at every breakpoint, which is the thing the lantern
 * needs to have something to land on.
 */
export const DEFAULT_TILT = (55 * Math.PI) / 180;

/** Hard limits. Outside these the projection stops meaning anything. */
export const MIN_TILT = 0.15;
export const MAX_TILT = Math.PI / 2 - 0.05;

export function makeCamera(partial: Partial<Camera> = {}): Camera {
  return {
    centre: partial.centre ?? { x: 0, y: 0 },
    zoom: partial.zoom ?? 48,
    tilt: clampTilt(partial.tilt ?? DEFAULT_TILT),
    viewport: partial.viewport ?? { x: 1280, y: 800 },
  };
}

export function clampTilt(t: number): number {
  return Math.min(MAX_TILT, Math.max(MIN_TILT, t));
}

/**
 * Board position to screen pixel.
 *
 *   sx = (x - cx) * zoom
 *   sy = (y - cy) * zoom * cos(tilt)  -  z * zoom * sin(tilt)
 *
 * The two terms of `sy` are the whole projection. The first squashes the board
 * by the viewing angle. The second is HEIGHT, and its minus sign is the reason
 * anything looks like it is standing up: a piece with `z > 0` draws further up
 * the screen than the tile it stands on, which is what your eye reads as "off
 * the table". Set `z = 0` and a piece lies flat on the board like a painted
 * decal — which is exactly what a top-down renderer is, stated as an equation.
 *
 * Screen origin is the top-left of the viewport, matching the DOM, because
 * every measurement this has to agree with (nav rects, tooltips, the card hand)
 * is already in that space.
 */
export function project(p: Vec3, cam: Camera): Vec2 {
  const cos = Math.cos(cam.tilt);
  const sin = Math.sin(cam.tilt);
  return {
    x: (p.x - cam.centre.x) * cam.zoom + cam.viewport.x / 2,
    y: (p.y - cam.centre.y) * cam.zoom * cos - p.z * cam.zoom * sin + cam.viewport.y / 2,
  };
}

/**
 * Screen pixel back to the board, for a given height.
 *
 * Needed for every click, hover and tooltip, and it is exactly invertible
 * BECAUSE the projection is orthographic and axis-aligned — one division per
 * axis, no per-tile search, no ray cast. A perspective camera would make this a
 * ray/plane intersection per query and an isometric one would make it a change
 * of basis; this is the payoff for the boring choice.
 *
 * `z` must be supplied because a screen point does not determine one: every
 * point on the vertical line above a tile projects into the same column. Pass
 * the height of the plane being tested — 0 for the board itself.
 */
export function unproject(s: Vec2, cam: Camera, z = 0): Vec2 {
  const cos = Math.cos(cam.tilt);
  const sin = Math.sin(cam.tilt);
  return {
    x: (s.x - cam.viewport.x / 2) / cam.zoom + cam.centre.x,
    y: (s.y - cam.viewport.y / 2 + z * cam.zoom * sin) / (cam.zoom * cos) + cam.centre.y,
  };
}

/**
 * How tall one unit of height draws, in px. `zoom * sin(tilt)`.
 *
 * The number a wall's front face is drawn with, and the one that decides
 * whether the tilt is buying anything at this breakpoint. Below ~8px there is
 * not enough face for a normal map to say anything and the tilt is costing
 * board area for nothing.
 */
export function heightScale(cam: Camera): number {
  return cam.zoom * Math.sin(cam.tilt);
}

/** How tall one board tile draws, in px. `zoom * cos(tilt)`. */
export function tileScreenHeight(cam: Camera): number {
  return cam.zoom * Math.cos(cam.tilt);
}

/**
 * Painter's order for one object.
 *
 * A tilted board is drawn back to front, and "back" means smaller `y` — a
 * piece further up the board is further away and is covered by everything in
 * front of it. Height breaks ties within a row: a piece standing ON a tile
 * draws after the tile.
 *
 * The `y` term dominates by construction. `z` is scaled down hard so that no
 * reachable height can lift an object past its own row — a lantern held two
 * tiles up must still be occluded by the wall in front of it, and a sort key
 * that let height win would draw it through the wall.
 */
export function sortKey(p: Vec3): number {
  return p.y * 1024 + Math.min(1023, Math.max(0, p.z * 8));
}

/**
 * The board rectangle currently visible, in tiles, padded by `pad`.
 *
 * Culling runs against this. `maxHeight` widens the top edge, because a tall
 * piece standing on a tile below the viewport can still poke into view — drop
 * it on its footprint alone and pieces pop in at the bottom edge as you scroll.
 */
export function visibleBounds(
  cam: Camera,
  pad = 1,
  maxHeight = 3,
): { minX: number; minY: number; maxX: number; maxY: number } {
  const halfW = cam.viewport.x / 2 / cam.zoom;
  const cos = Math.cos(cam.tilt);
  const halfH = cam.viewport.y / 2 / (cam.zoom * cos);
  const lift = (maxHeight * Math.sin(cam.tilt)) / cos;
  return {
    minX: cam.centre.x - halfW - pad,
    maxX: cam.centre.x + halfW + pad,
    minY: cam.centre.y - halfH - pad,
    maxY: cam.centre.y + halfH + pad + lift,
  };
}
