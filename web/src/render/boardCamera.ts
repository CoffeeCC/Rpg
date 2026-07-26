// =========================================================================
// THE TABLETOP CAMERA — clamped pan, a zoom range, two framings.
//
// ENGINE_PLAN §13 said the camera always shows the whole board. §17 amended
// that to "the camera CAN always show the whole board" once the measurement
// came in: the authored floors are 17-23 by 13-15, which is too small to plan
// a fight on when it is also the entire frame. §17.1 then added the pan:
//
//   "The camera PANS, clamped to the board's own edges... MOVE THE CAMERA,
//    NOT THE BOARD. A table that stays fixed while the board slides across it
//    looks wrong. Clamping to the board edges is what makes it feel like
//    furniture."
//
// So there are exactly two states and one lerp between them:
//
//   OVERVIEW  the whole slab fits the frame. Planning. The clamp has nothing
//             left to do, because the board is smaller than the view.
//   PLAY      zoomed in, pieces readable, the board runs past the frame and
//             the clamp is what stops you scrolling off into dead space.
//
// EVERYTHING HERE IS PURE. Tiles and pixels in, tiles and pixels out — no GL,
// no DOM, no React. `lantern/scene/camera.ts` owns the projection; this owns
// where the projection is pointed, which is a game-facing question and
// therefore lives on this side of the §2 boundary.
// =========================================================================

import type { Camera, Vec2 } from '../lantern/scene/camera';

/** The rectangle the camera is allowed to look at, in tiles. */
export interface BoardExtent {
  /** Play area size, in tiles. The tile grid occupies [0,width) x [0,height). */
  width: number;
  height: number;
  /** Frame width around the play area. The slab is this much bigger on each side. */
  border: number;
}

export type CameraMode = 'overview' | 'play';

/**
 * How much table the camera may show past the slab's own edge, in tiles.
 *
 * §17.1: "At a boundary the player should see the rim and a sliver of table:
 * the signal that this is the end. What must not happen is scrolling until the
 * board is half off-screen with dead space beside it." So this is small and
 * deliberate — enough that the rim is never flush against the frame edge, not
 * enough to be scrolling over wood.
 */
export const EDGE_SLACK = 1.1;

/**
 * Pixels per tile, at the two ends of the range.
 *
 * The floor is ENGINE_PLAN §17's legibility number: at 1280x800 a 40x26 board
 * lands near 32px a tile in overview, which is enough to read shape and
 * placement, which is all planning needs. The ceiling is where a hero piece
 * fills a good part of the frame and further zoom is just cropping.
 */
export const MIN_ZOOM = 18;
export const MAX_ZOOM = 150;

/** How much closer PLAY sits than OVERVIEW. §17's table is built on 2x. */
export const PLAY_FACTOR = 2;

/** The slab rectangle in tiles, frame included. Mirrors `board.slabBounds`. */
export function extentBounds(e: BoardExtent): { minX: number; minY: number; maxX: number; maxY: number } {
  return {
    minX: -e.border,
    minY: -e.border,
    maxX: e.width + e.border,
    maxY: e.height + e.border,
  };
}

export function extentCentre(e: BoardExtent): Vec2 {
  return { x: e.width / 2, y: e.height / 2 };
}

/**
 * The zoom at which the whole slab fits the viewport, with `pad` tiles spare.
 *
 * Both axes, then the smaller — fitting only the wider one is how a board ends
 * up with its far row cropped on a tall floor, which is the exact failure this
 * framing exists to prevent. The vertical term carries `cos(tilt)` because
 * that is what the projection does to board depth.
 */
export function fitZoom(e: BoardExtent, viewport: Vec2, tilt: number, pad = 0.5): number {
  const b = extentBounds(e);
  const w = Math.max(1e-3, b.maxX - b.minX + pad * 2);
  const h = Math.max(1e-3, b.maxY - b.minY + pad * 2);
  const cos = Math.max(1e-3, Math.cos(tilt));
  const byWidth = viewport.x / w;
  const byHeight = viewport.y / (h * cos);
  return Math.min(byWidth, byHeight);
}

/** The zoom for a framing. PLAY is OVERVIEW twice over, inside the range. */
export function zoomFor(mode: CameraMode, e: BoardExtent, viewport: Vec2, tilt: number): number {
  const fit = fitZoom(e, viewport, tilt);
  const raw = mode === 'overview' ? fit : fit * PLAY_FACTOR;
  return clampZoom(raw);
}

export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * One axis of the clamp.
 *
 * The centre may travel until the half-viewport touches the slab edge plus the
 * slack. When the board is SMALLER than the view — which is the whole of
 * overview mode — that range inverts, and the honest answer is not to clamp to
 * a nonsensical bound but to centre the board: `lo > hi` means "it all fits,
 * there is nothing to pan".
 */
export function clampAxis(centre: number, min: number, max: number, halfView: number, slack = EDGE_SLACK): number {
  const lo = min - slack + halfView;
  const hi = max + slack - halfView;
  if (lo > hi) return (min + max) / 2;
  return Math.min(hi, Math.max(lo, centre));
}

/** Both axes, against the viewport this camera is drawing into. */
export function clampCentre(centre: Vec2, e: BoardExtent, viewport: Vec2, zoom: number, tilt: number): Vec2 {
  const b = extentBounds(e);
  const cos = Math.max(1e-3, Math.cos(tilt));
  const halfW = viewport.x / 2 / zoom;
  const halfH = viewport.y / 2 / (zoom * cos);
  return {
    x: clampAxis(centre.x, b.minX, b.maxX, halfW),
    y: clampAxis(centre.y, b.minY, b.maxY, halfH),
  };
}

/**
 * Scale a camera from CSS pixels into device pixels.
 *
 * The vertex shader divides screen-space positions by `uViewport`, which is the
 * render target's size in DEVICE pixels — so the camera handed to the renderer
 * has to be in device pixels too. But every DOM-side consumer (the hit-target
 * lattice, the pointer maths, the pan) wants CSS pixels.
 *
 * Rather than keep two cameras in step, keep ONE in CSS pixels and scale it
 * here. `project` is linear in `zoom` and in `viewport/2`, so scaling both by
 * the same k scales every projected coordinate by exactly k — and
 * `visibleBounds`, which divides one by the other, is left completely
 * unchanged. That is what makes this an exact transformation rather than an
 * approximation that drifts at fractional device pixel ratios.
 */
export function scaleCamera(cam: Camera, k: number): Camera {
  return {
    centre: cam.centre,
    tilt: cam.tilt,
    zoom: cam.zoom * k,
    viewport: { x: cam.viewport.x * k, y: cam.viewport.y * k },
  };
}

/**
 * The CSS transform that lays a square DOM lattice over the projected board.
 *
 * THIS IS THE WHOLE HIT-TARGET STORY, and it is worth stating plainly because
 * it is what keeps ENGINE_PLAN §1.2 affordable: "the GPU draws every SURFACE,
 * the DOM draws TEXT and HIT TARGETS."
 *
 * The DOM keeps rendering the map as rows of square cells at a fixed pitch,
 * exactly as it always has — same elements, same `onClick`, same `title`, same
 * ARIA, same `data-nav-item`. For a point on the board plane (z = 0) the
 * projection is AFFINE and axis-aligned:
 *
 *     screenX = (x - cx) * zoom            + vw/2
 *     screenY = (y - cy) * zoom * cos(tilt) + vh/2
 *
 * and cell (x, y) sits at (x * pitch, y * pitch) in the lattice. So one
 * `translate` and one `scale` carry the entire lattice onto the projected
 * tiles — no per-cell geometry, no layout thrash, and rows stay rows and
 * columns stay columns, which is the property `nav/geometry.ts` scores
 * bounding boxes against.
 *
 * `pitch` must be the lattice's real pixel pitch including any gap, or every
 * cell drifts a little further from its tile as x grows — the classic
 * off-by-a-gap that looks like "the canvas is slightly misaligned".
 */
export interface LatticeTransform {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
}

export function latticeTransform(cam: Camera, pitch: number): LatticeTransform {
  const cos = Math.cos(cam.tilt);
  const sx = cam.zoom / pitch;
  const sy = (cam.zoom * cos) / pitch;
  return {
    translateX: -cam.centre.x * cam.zoom + cam.viewport.x / 2,
    translateY: -cam.centre.y * cam.zoom * cos + cam.viewport.y / 2,
    scaleX: sx,
    scaleY: sy,
  };
}

export function latticeCss(t: LatticeTransform): string {
  return `translate(${t.translateX}px, ${t.translateY}px) scale(${t.scaleX}, ${t.scaleY})`;
}

/**
 * How close to the frame edge the hero may get before the camera moves, as a
 * fraction of the half-viewport taken off each side.
 */
export const DEADZONE = 0.34;

/**
 * Deadzone follow, then the clamp.
 *
 * The camera does not chase the hero across a still board — §17.1's rule is
 * that a fixed board and a moving head is what reads as a person at a table,
 * and a camera glued to the piece turns the board back into a scrolling level.
 * So it holds still until the piece approaches the frame edge, then moves the
 * MINIMUM that brings it back inside, and the clamp has the last word so the
 * board can never scroll off leaving dead space beside it.
 *
 * Mutates `cam.centre`, because it is called once per frame on a camera that
 * is deliberately mutable state rather than React state — sixty `setState`
 * calls a second would re-render the whole floor screen, and the point of the
 * flag is that the DOM path underneath is untouched.
 */
export function followHero(cam: Camera, hero: Vec2, extent: BoardExtent): void {
  const cos = Math.max(1e-3, Math.cos(cam.tilt));
  const halfW = cam.viewport.x / 2 / cam.zoom;
  const halfH = cam.viewport.y / 2 / (cam.zoom * cos);
  const dzX = halfW * (1 - DEADZONE * 2);
  const dzY = halfH * (1 - DEADZONE * 2);
  let cx = cam.centre.x;
  let cy = cam.centre.y;
  if (hero.x < cx - dzX) cx = hero.x + dzX;
  else if (hero.x > cx + dzX) cx = hero.x - dzX;
  if (hero.y < cy - dzY) cy = hero.y + dzY;
  else if (hero.y > cy + dzY) cy = hero.y - dzY;
  cam.centre = clampCentre({ x: cx, y: cy }, extent, cam.viewport, cam.zoom, cam.tilt);
}
