// =========================================================================
// OCCLUDER MERGING — one wall, not ten wall cells.
//
// Paul, on the lit map: "there are partially lit tiles with a diagonal line
// through them", and later, on a whole fan of them radiating from a corner.
//
// The disc-sampled flame fixed one cause of that (see `flameSample`). This
// file fixes the other, and it is not a lighting bug at all — it is a bug in
// what the engine is handed.
//
// The map is a GRID. A wall is not a wall, it is ten `.map-cell.wall`
// elements in a row, and the measure sweep in LightLayer hands all ten to the
// engine as ten separate rectangles. Every one of them casts its own shadow
// quad, filled with its own gradient, and the quads OVERLAP where the cells
// do. So along a plain straight wall the engine draws:
//
//   cell 1's quad | cell 1 + cell 2 | cell 2 | cell 2 + cell 3 | ...
//
// — alternating single-darkness and double-darkness stripes, one seam per
// cell boundary, each one radiating away from the flame. That is the fan.
// Where the cells have a `gap` between them instead of an overlap, the same
// seams run the other way: thin BRIGHT wedges of leaked light, which is the
// artifact `occluderPad` was added to seal. The pad closed the light leak by
// forcing every neighbour pair to overlap — which is to say it traded the
// bright seams for dark ones, and made this half of the artifact worse.
//
// Neither seam exists if the ten cells are one rectangle before anything is
// cast. A straight run has no interior edges to disagree about, so there is
// nothing to alternate. The fix is upstream of the shadow maths entirely.
//
// It is also most of a performance argument. Ten cells present up to two
// faces each to the flame, times seven flame samples: ~133 gradient-filled
// polygons for one wall. Merged, that wall is one rectangle showing one face:
// seven. The frame budget that buys is what Phase 2's radiance lattice is
// meant to spend — see docs/LIGHTING_PLAN.md §4.
// =========================================================================

import type { Occluder } from './lightEngine';

/**
 * How far apart two rectangles may be and still count as one, in CANVAS px.
 *
 * This has to sit above the grid's `gap` (2 CSS px, so 1 canvas px at half
 * resolution) and well below the smallest hole light is genuinely supposed to
 * come through — a doorway, which is a whole cell, tens of px. There is a lot
 * of room between those two numbers and this sits in it.
 *
 * Being generous by up to this much is the same lie `occluderPad` already
 * tells, and a smaller one than pretending a painted wall is a rectangle.
 */
export const MERGE_TOLERANCE = 2;

/**
 * Passes of (horizontal, then vertical). Two is enough for every shape the
 * map actually produces — a run collapses in one, a solid block in one pair,
 * and the loop exits early the moment a pass changes nothing.
 */
const MAX_PASSES = 4;

/**
 * A rectangle rewritten so the axis being merged along is always `p`/`s`.
 *
 * The horizontal and vertical passes are the same walk with x and y swapped,
 * and writing it twice is how the two drift apart later.
 */
interface Span {
  /** Position along the merge axis. */
  p: number;
  /** Size along the merge axis. */
  s: number;
  /** Position across it. */
  q: number;
  /** Size across it. */
  r: number;
}

function toSpan(o: Occluder, horizontal: boolean): Span {
  return horizontal ? { p: o.x, s: o.w, q: o.y, r: o.h } : { p: o.y, s: o.h, q: o.x, r: o.w };
}

function fromSpan(sp: Span, horizontal: boolean): Occluder {
  return horizontal ? { x: sp.p, y: sp.q, w: sp.s, h: sp.r } : { x: sp.q, y: sp.p, w: sp.r, h: sp.s };
}

/**
 * Merge every run of rectangles that lie on the same line and touch.
 *
 * Two rectangles join only if they agree on the CROSS axis — same offset,
 * same thickness, both within `tol` — and are contiguous along the merge
 * axis. That is deliberately strict: it means a run of grid cells collapses
 * completely while a barrel's art box, which shares no edge with anything,
 * passes through untouched. Nothing here has to know what a wall is.
 *
 * The merged rectangle is the UNION, so it covers every input it swallowed
 * (and at most `tol` of gap between them). Merging can therefore only ever
 * make the scene darker by a hair, never leak light that was previously
 * blocked — the safe direction for an approximation in a fog-of-war grid.
 */
function mergeAlong(rects: Occluder[], horizontal: boolean, tol: number): Occluder[] {
  const spans = rects.map((o) => toSpan(o, horizontal));
  // Cross axis first, so everything on one line is adjacent in the array and
  // a run can be found by walking once rather than by searching.
  spans.sort((a, b) => a.q - b.q || a.r - b.r || a.p - b.p);

  const out: Occluder[] = [];
  let run: Span | null = null;
  for (const sp of spans) {
    const joins =
      run !== null &&
      Math.abs(sp.q - run.q) <= tol &&
      Math.abs(sp.r - run.r) <= tol &&
      // Touching, overlapping, or separated by no more than the grid's gap.
      sp.p <= run.p + run.s + tol;
    if (run && joins) {
      const end = Math.max(run.p + run.s, sp.p + sp.s);
      const near = Math.min(run.q, sp.q);
      const far = Math.max(run.q + run.r, sp.q + sp.r);
      run.p = Math.min(run.p, sp.p);
      run.s = end - run.p;
      // `run.q` takes the MINIMUM rather than trailing the latest rectangle,
      // so a long run cannot creep sideways one tolerance at a time.
      run.q = near;
      run.r = far - near;
      continue;
    }
    if (run) out.push(fromSpan(run, horizontal));
    run = { ...sp };
  }
  if (run) out.push(fromSpan(run, horizontal));
  return out;
}

/**
 * Collapse a set of occluders into maximal rectangles.
 *
 * Horizontal then vertical, repeated until a pass changes nothing: a row of
 * cells falls to one rectangle in the first pass, a solid block of them falls
 * to one in the first pair, and an L keeps its two arms as two rectangles
 * that meet rather than overlap.
 *
 * Cheap enough to run per frame on the culled set — a sort and two linear
 * walks over the couple of dozen rectangles the lantern can actually reach,
 * against the hundred-odd gradient-filled polygons it removes.
 */
export function mergeOccluders(occluders: Occluder[], tolerance: number = MERGE_TOLERANCE): Occluder[] {
  if (occluders.length < 2) return occluders;
  let cur = occluders;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    const next = mergeAlong(mergeAlong(cur, true, tolerance), false, tolerance);
    // A pass that merged nothing is the fixpoint; a second identical pass
    // would too, so stop rather than paying for it.
    if (next.length === cur.length) return next;
    cur = next;
  }
  return cur;
}
