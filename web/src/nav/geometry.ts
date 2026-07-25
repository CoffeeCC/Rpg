// ===========================================================================
// nav/geometry.ts — DIRECTIONAL FOCUS RESOLUTION. Pure, DOM-free.
//
// "Which control is to the right of this one?" is the question a controller
// asks a thousand times an hour, and it is entirely a question about
// rectangles. Keeping it here — taking plain `NavRect` records rather than
// `HTMLElement`s — means the answer is unit-testable in the node environment
// this project's vitest already runs in.
//
// navBus.ts is responsible for turning elements into rects and back again.
// ===========================================================================

import type { NavDir } from './input';

export interface NavRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

export function rectCenter(r: NavRect): Point {
  return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 };
}

/** Overlap of two 1-D spans; negative means a gap of that size. */
function spanOverlap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  return Math.min(aMax, bMax) - Math.max(aMin, bMin);
}

/**
 * How badly a candidate is offset on the axis PERPENDICULAR to travel.
 * Zero while the two rects still share any of that axis — which is what makes
 * a wide button below a narrow one still count as "down" — and grows with the
 * gap once they stop overlapping.
 */
export function crossAxisMiss(from: NavRect, to: NavRect, dir: NavDir): number {
  const horizontal = dir === 'left' || dir === 'right';
  const overlap = horizontal
    ? spanOverlap(from.top, from.bottom, to.top, to.bottom)
    : spanOverlap(from.left, from.right, to.left, to.right);
  return overlap > 0 ? 0 : -overlap;
}

/** Signed travel along the axis of movement, from `from`'s centre to `to`'s. */
export function axialAdvance(from: NavRect, to: NavRect, dir: NavDir): number {
  const a = rectCenter(from);
  const b = rectCenter(to);
  switch (dir) {
    case 'left':
      return a.x - b.x;
    case 'right':
      return b.x - a.x;
    case 'up':
      return a.y - b.y;
    case 'down':
      return b.y - a.y;
  }
}

/**
 * A candidate counts as "in the direction" if its centre has moved that way at
 * all AND its leading edge is not still behind us. Centre-only tests pick
 * nested/overlapping elements; edge-only tests refuse to move between two
 * controls of very different heights. Requiring both is what makes a hand of
 * fanned, overlapping cards navigate correctly.
 */
const MIN_ADVANCE = 1;

/** True when `a` completely swallows `b`. */
export function encloses(a: NavRect, b: NavRect): boolean {
  return a.left <= b.left && a.right >= b.right && a.top <= b.top && a.bottom >= b.bottom;
}

export function isInDirection(from: NavRect, to: NavRect, dir: NavDir): boolean {
  // A focusable ANCESTOR (a scrollable panel with a tabindex, a nav widget
  // wrapping a control) sits on all four sides of its child at once, so a
  // naive edge test says it lies in every direction. Nesting is not a
  // direction: jumping from a button to the box drawn around it is never what
  // the player meant, in either order.
  if (encloses(to, from) || encloses(from, to)) return false;
  if (axialAdvance(from, to, dir) <= MIN_ADVANCE) return false;
  switch (dir) {
    case 'left':
      return to.left < from.left - MIN_ADVANCE;
    case 'right':
      return to.right > from.right + MIN_ADVANCE;
    case 'up':
      return to.top < from.top - MIN_ADVANCE;
    case 'down':
      return to.bottom > from.bottom + MIN_ADVANCE;
  }
}

/**
 * Weight on cross-axis drift. High enough that a neighbour dead ahead beats a
 * closer one off to the side — the difference between "Down goes down the
 * column I'm reading" and "Down goes wherever, diagonally".
 */
export const CROSS_PENALTY = 3.2;

export function directionScore(from: NavRect, to: NavRect, dir: NavDir): number {
  return axialAdvance(from, to, dir) + crossAxisMiss(from, to, dir) * CROSS_PENALTY;
}

export interface PickOptions {
  /**
   * When nothing lies in the direction of travel, jump to the far end of the
   * same row/column instead of stopping dead. Lists want this; a grid you are
   * reading spatially often does not.
   */
  wrap?: boolean;
}

/**
 * The core query: index of the best candidate in `dir` from `from`, or null.
 *
 * `candidates` may include `from` itself (it can never win — it has zero
 * advance), so callers can pass the whole scope's list unfiltered.
 */
export function pickInDirection(
  from: NavRect,
  candidates: readonly NavRect[],
  dir: NavDir,
  opts: PickOptions = {},
): number | null {
  let best: number | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!isInDirection(from, c, dir)) continue;
    const score = directionScore(from, c, dir);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best !== null) return best;
  return opts.wrap ? pickWrapAround(from, candidates, dir) : null;
}

const OPPOSITE: Record<NavDir, NavDir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

/**
 * Wrap: walk as far as possible the OTHER way, but only among candidates that
 * still line up on the cross axis. Pressing Down at the bottom of a column
 * returns to the top of THAT column, never to some unrelated control that
 * merely happens to sit high on the screen.
 */
export function pickWrapAround(from: NavRect, candidates: readonly NavRect[], dir: NavDir): number | null {
  const back = OPPOSITE[dir];
  let best: number | null = null;
  let bestScore = -Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    if (!isInDirection(from, c, back)) continue;
    if (crossAxisMiss(from, c, dir) > 0) continue; // must share the lane
    const score = axialAdvance(from, c, back);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

export interface ScrollNeed {
  dx: number;
  dy: number;
}

/**
 * The minimum scroll that brings `target` inside `viewport`, with a margin of
 * breathing room so a focused control never sits flush against a clipped edge.
 *
 * Minimum is the operative word. `Element.scrollIntoView` recentres and walks
 * every scrollable ancestor — FloorScreen's camera-follow comment records that
 * exact bug (it "walked every scrollable ancestor, dragging the whole page
 * side to side"). Focus movement must feel like the list nudged, not like the
 * page jumped.
 */
export function scrollNeededFor(target: NavRect, viewport: NavRect, margin = 24): ScrollNeed {
  let dx = 0;
  let dy = 0;
  if (target.left < viewport.left + margin) dx = target.left - viewport.left - margin;
  else if (target.right > viewport.right - margin) dx = target.right - viewport.right + margin;
  if (target.top < viewport.top + margin) dy = target.top - viewport.top - margin;
  else if (target.bottom > viewport.bottom - margin) dy = target.bottom - viewport.bottom + margin;

  // An element taller/wider than its viewport: align its leading edge rather
  // than chasing the trailing one, which would scroll its head off-screen.
  if (target.bottom - target.top > viewport.bottom - viewport.top) dy = target.top - viewport.top - margin;
  if (target.right - target.left > viewport.right - viewport.left) dx = target.left - viewport.left - margin;
  return { dx, dy };
}

export function isFullyVisible(target: NavRect, viewport: NavRect): boolean {
  return (
    target.left >= viewport.left &&
    target.right <= viewport.right &&
    target.top >= viewport.top &&
    target.bottom <= viewport.bottom
  );
}
