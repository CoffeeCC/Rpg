// =========================================================================
// THE TABLETOP CAMERA, and the lattice that has to agree with it.
//
// The lattice transform is the load-bearing claim of this whole milestone:
// ENGINE_PLAN §1.2 says the DOM keeps the HIT TARGETS while the GPU draws the
// surfaces, and that only works if a square DOM grid, carried by ONE CSS
// transform, lands exactly on the projected tiles. If it does not, clicking a
// chest walks you somewhere else — silently, and worse the further from the
// centre you click. So it is checked against `camera.project` itself rather
// than against a re-derivation of the same algebra.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { makeCamera, project, DEFAULT_TILT, type Camera } from '../../lantern/scene/camera';
import {
  EDGE_SLACK,
  FRAMING_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  MIN_SPAN_PX,
  PLAY_FACTOR,
  DEADZONE,
  clampAxis,
  clampCentre,
  clampZoom,
  easeInOut,
  extentBounds,
  fitZoom,
  followHero,
  latticeTransform,
  latticeCss,
  pinchFactor,
  scaleCamera,
  touchSpan,
  tweenDone,
  tweenZoom,
  zoomAbout,
  zoomFor,
  type BoardExtent,
  type ZoomTween,
} from '../boardCamera';
import { unproject } from '../../lantern/scene/camera';

const EXTENT: BoardExtent = { width: 22, height: 14, border: 1.35 };
const VIEW = { x: 1280, y: 800 };

/** Where the lattice puts the top-left corner of cell (x, y), in CSS px. */
function latticeCorner(cam: Camera, pitch: number, x: number, y: number) {
  const t = latticeTransform(cam, pitch);
  return {
    x: t.translateX + x * pitch * t.scaleX,
    y: t.translateY + y * pitch * t.scaleY,
  };
}

describe('the lattice lands on the projected board', () => {
  const cam = makeCamera({ centre: { x: 11, y: 7 }, zoom: 44, viewport: VIEW, tilt: DEFAULT_TILT });

  it('puts every cell corner exactly where the projection puts its tile', () => {
    for (const [x, y] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [21, 13],
      [7, 9],
      [22, 14],
    ] as const) {
      const projected = project({ x, y, z: 0 }, cam);
      const corner = latticeCorner(cam, 48, x, y);
      expect(corner.x).toBeCloseTo(projected.x, 6);
      expect(corner.y).toBeCloseTo(projected.y, 6);
    }
  });

  it('holds at every pitch, so --cell can be anything the CSS says', () => {
    for (const pitch of [24, 48, 84, 92]) {
      const corner = latticeCorner(cam, pitch, 13, 5);
      const projected = project({ x: 13, y: 5, z: 0 }, cam);
      expect(corner.x).toBeCloseTo(projected.x, 6);
      expect(corner.y).toBeCloseTo(projected.y, 6);
    }
  });

  it('holds as the camera pans and zooms', () => {
    for (const zoom of [18, 40, 96]) {
      for (const centre of [{ x: 0, y: 0 }, { x: 11, y: 7 }, { x: 30, y: 2 }]) {
        const c = makeCamera({ centre, zoom, viewport: VIEW, tilt: DEFAULT_TILT });
        const corner = latticeCorner(c, 48, 9, 11);
        const projected = project({ x: 9, y: 11, z: 0 }, c);
        expect(corner.x).toBeCloseTo(projected.x, 6);
        expect(corner.y).toBeCloseTo(projected.y, 6);
      }
    }
  });

  it('squashes vertically — a lattice that did not would be top-down', () => {
    // The tilt is the entire reason a wall has a front face. A transform with
    // scaleY === scaleX is a satellite view wearing the renderer's clothes.
    const t = latticeTransform(cam, 48);
    expect(t.scaleY).toBeLessThan(t.scaleX);
    expect(t.scaleY / t.scaleX).toBeCloseTo(Math.cos(cam.tilt), 6);
  });

  it('emits a CSS transform in the order the browser applies it', () => {
    const css = latticeCss({ translateX: 3, translateY: -4, scaleX: 2, scaleY: 1.5 });
    // translate FIRST, then scale — the other order scales the translation and
    // the board slides further off the further you are zoomed in.
    expect(css).toBe('translate(3px, -4px) scale(2, 1.5)');
  });
});

describe('device pixels', () => {
  it('scales projected coordinates by exactly k', () => {
    const cam = makeCamera({ centre: { x: 5, y: 3 }, zoom: 50, viewport: VIEW });
    const scaled = scaleCamera(cam, 2);
    const a = project({ x: 9, y: 11, z: 0.4 }, cam);
    const b = project({ x: 9, y: 11, z: 0.4 }, scaled);
    expect(b.x).toBeCloseTo(a.x * 2, 6);
    expect(b.y).toBeCloseTo(a.y * 2, 6);
  });

  it('leaves the visible board unchanged, which is why culling is safe', () => {
    const cam = makeCamera({ centre: { x: 5, y: 3 }, zoom: 50, viewport: VIEW });
    const scaled = scaleCamera(cam, 1.75);
    expect(scaled.centre).toEqual(cam.centre);
    expect(scaled.tilt).toBe(cam.tilt);
    expect(scaled.viewport.x / scaled.zoom).toBeCloseTo(cam.viewport.x / cam.zoom, 9);
  });
});

describe('the two framings', () => {
  it('overview fits the whole slab, both axes', () => {
    const zoom = fitZoom(EXTENT, VIEW, DEFAULT_TILT, 0);
    const b = extentBounds(EXTENT);
    expect((b.maxX - b.minX) * zoom).toBeLessThanOrEqual(VIEW.x + 1e-6);
    expect((b.maxY - b.minY) * zoom * Math.cos(DEFAULT_TILT)).toBeLessThanOrEqual(VIEW.y + 1e-6);
  });

  it('fits a TALL board by its height, not its width', () => {
    // Fitting only the wider axis is how a board loses its far row on a tall
    // floor, which is the exact failure the whole-board framing exists to stop.
    const tall: BoardExtent = { width: 10, height: 40, border: 1 };
    const zoom = fitZoom(tall, VIEW, DEFAULT_TILT, 0);
    const b = extentBounds(tall);
    expect((b.maxY - b.minY) * zoom * Math.cos(DEFAULT_TILT)).toBeCloseTo(VIEW.y, 6);
  });

  it('play is closer than overview and both stay inside the range', () => {
    const over = zoomFor('overview', EXTENT, VIEW, DEFAULT_TILT);
    const play = zoomFor('play', EXTENT, VIEW, DEFAULT_TILT);
    expect(play).toBeGreaterThan(over);
    expect(play / over).toBeCloseTo(PLAY_FACTOR, 6);
    for (const z of [over, play]) {
      expect(z).toBeGreaterThanOrEqual(MIN_ZOOM);
      expect(z).toBeLessThanOrEqual(MAX_ZOOM);
    }
  });

  it('clamps a runaway wheel', () => {
    expect(clampZoom(1e6)).toBe(MAX_ZOOM);
    expect(clampZoom(0)).toBe(MIN_ZOOM);
    expect(clampZoom(-5)).toBe(MIN_ZOOM);
  });
});

describe('the clamp is what makes it furniture (§17.1)', () => {
  it('stops at the rim plus a sliver of table', () => {
    const half = 3;
    expect(clampAxis(-999, 0, 20, half)).toBeCloseTo(0 - EDGE_SLACK + half, 6);
    expect(clampAxis(999, 0, 20, half)).toBeCloseTo(20 + EDGE_SLACK - half, 6);
    expect(clampAxis(10, 0, 20, half)).toBe(10);
  });

  it('centres rather than clamping to nonsense when the board fits', () => {
    // The whole of overview mode is this case: half the viewport is wider than
    // the board, so the allowed range inverts. Clamping to an inverted range
    // pins the board against one edge, which reads as a bug in the pan.
    expect(clampAxis(0, 0, 20, 40)).toBe(10);
    expect(clampAxis(999, 0, 20, 40)).toBe(10);
  });

  it('holds still while the hero is well inside the frame', () => {
    // A camera glued to the piece turns the board back into a scrolling level,
    // which is the read §17.1 is explicitly trying not to have. Following only
    // at the edge is what makes the board the thing that stays put.
    const big: BoardExtent = { width: 60, height: 40, border: 1.35 };
    const cam = makeCamera({ centre: { x: 30, y: 20 }, zoom: 60, viewport: VIEW, tilt: DEFAULT_TILT });
    followHero(cam, { x: 31, y: 21 }, big);
    expect(cam.centre.x).toBeCloseTo(30, 6);
    expect(cam.centre.y).toBeCloseTo(20, 6);
  });

  it('moves the minimum that brings the hero back inside the deadzone', () => {
    const big: BoardExtent = { width: 60, height: 40, border: 1.35 };
    const cam = makeCamera({ centre: { x: 30, y: 20 }, zoom: 60, viewport: VIEW, tilt: DEFAULT_TILT });
    const halfW = VIEW.x / 2 / cam.zoom;
    const dzX = halfW * (1 - DEADZONE * 2);
    followHero(cam, { x: 30 + dzX + 3, y: 20 }, big);
    // Exactly on the boundary, not centred on the hero.
    expect(cam.centre.x).toBeCloseTo(30 + 3, 6);
    expect(cam.centre.y).toBeCloseTo(20, 6);
  });

  it('never lets the board scroll off leaving dead space', () => {
    const cam = makeCamera({ centre: { x: 0, y: 0 }, zoom: 90, viewport: VIEW, tilt: DEFAULT_TILT });
    const clamped = clampCentre({ x: -500, y: 500 }, EXTENT, cam.viewport, cam.zoom, cam.tilt);
    const b = extentBounds(EXTENT);
    const halfW = cam.viewport.x / 2 / cam.zoom;
    // The left edge of the view is never further left than the slab's own
    // edge plus the slack.
    expect(clamped.x - halfW).toBeGreaterThanOrEqual(b.minX - EDGE_SLACK - 1e-6);
    expect(clamped.y).toBeLessThanOrEqual(b.maxY + EDGE_SLACK);
  });
});

// ===========================================================================
// The three camera defects, each tested by what the OLD behaviour would do.
// ===========================================================================

describe('zoom is anchored to the cursor, not the frame centre', () => {
  /** A camera whose centre the clamp leaves alone, so the anchor is exact. */
  const fresh = () => makeCamera({ centre: { x: 11, y: 7 }, zoom: 90, viewport: VIEW, tilt: DEFAULT_TILT });
  const CURSOR = { x: 1000, y: 250 };

  it('keeps the board point under the cursor under the cursor', () => {
    const cam = fresh();
    const before = unproject(CURSOR, cam, 0);
    zoomAbout(cam, CURSOR, 1.087, EXTENT);
    const after = unproject(CURSOR, cam, 0);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it('REJECTS the centre-anchored version this replaced', () => {
    // The old code was `cam.zoom = clampZoom(cam.zoom * factor)` and nothing
    // else. Staging it here is what gives the test above its teeth: without
    // this, "the point stayed put" could pass on a camera that never moved.
    const naive = fresh();
    const before = unproject(CURSOR, naive, 0);
    naive.zoom = clampZoom(naive.zoom * 1.087);
    const after = unproject(CURSOR, naive, 0);
    // Nearly half a tile of drift on ONE notch, toward the frame centre.
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeGreaterThan(0.3);
  });

  it('does not creep sideways once the zoom has hit its stop', () => {
    // The bug this guards: correcting against the REQUESTED zoom rather than
    // the clamped one. The scale refuses to change, the anchor correction does
    // not, and the board slides a little on every further scroll.
    const cam = makeCamera({ centre: { x: 11, y: 7 }, zoom: MAX_ZOOM, viewport: VIEW, tilt: DEFAULT_TILT });
    const centre0 = { ...cam.centre };
    for (let i = 0; i < 20; i++) zoomAbout(cam, CURSOR, 1.087, EXTENT);
    expect(cam.zoom).toBe(MAX_ZOOM);
    expect(cam.centre.x).toBeCloseTo(centre0.x, 10);
    expect(cam.centre.y).toBeCloseTo(centre0.y, 10);
  });

  it('still refuses to scroll off the board, anchor or no anchor', () => {
    // §17.1 outranks the anchor: at an edge the point under the cursor moves,
    // because the alternative is dead space beside the slab.
    const cam = makeCamera({ centre: { x: 11, y: 7 }, zoom: 40, viewport: VIEW, tilt: DEFAULT_TILT });
    for (let i = 0; i < 30; i++) zoomAbout(cam, { x: 1279, y: 799 }, 1.087, EXTENT);
    const b = extentBounds(EXTENT);
    const halfW = cam.viewport.x / 2 / cam.zoom;
    expect(cam.centre.x + halfW).toBeLessThanOrEqual(b.maxX + EDGE_SLACK + 1e-6);
  });
});

describe('the framing change is a lean, not a cut', () => {
  const tw: ZoomTween = { from: 32, to: 64, startMs: 1000, durMs: FRAMING_MS };

  it('starts at the old framing and ends at the new one', () => {
    expect(tweenZoom(tw, 1000)).toBeCloseTo(32, 6);
    expect(tweenZoom(tw, 1000 + FRAMING_MS)).toBeCloseTo(64, 6);
    expect(tweenDone(tw, 1000 + FRAMING_MS)).toBe(true);
    expect(tweenDone(tw, 1000 + FRAMING_MS - 1)).toBe(false);
  });

  it('interpolates the LOG, which is what makes the rate feel constant', () => {
    const mid = tweenZoom(tw, 1000 + FRAMING_MS / 2);
    // Geometric midpoint, not arithmetic. This is the assertion that rejects a
    // plain lerp: sqrt(32*64) = 45.25, whereas (32+64)/2 = 48.
    expect(mid).toBeCloseTo(Math.sqrt(32 * 64), 4);
    expect(mid).not.toBeCloseTo((32 + 64) / 2, 1);
  });

  it('holds the endpoints flat so the move has no kick at either end', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 10);
    // Slower than linear at the start, or it is a cut with extra steps.
    expect(easeInOut(0.1)).toBeLessThan(0.1);
    expect(easeInOut(0.9)).toBeGreaterThan(0.9);
    // Clamped, because a tween polled one frame late must not overshoot.
    expect(easeInOut(-0.5)).toBe(0);
    expect(easeInOut(1.5)).toBe(1);
  });
});

describe('two fingers pan and pinch, one finger is left alone', () => {
  it('measures the span between two contacts', () => {
    const s = touchSpan({ x: 100, y: 100 }, { x: 400, y: 500 });
    expect(s.distance).toBeCloseTo(500, 6);
    expect(s.centre).toEqual({ x: 250, y: 300 });
  });

  it('turns a spreading pinch into the factor it asks for', () => {
    const a = touchSpan({ x: 300, y: 400 }, { x: 500, y: 400 });
    const b = touchSpan({ x: 200, y: 400 }, { x: 600, y: 400 });
    expect(pinchFactor(a, b)).toBeCloseTo(2, 6);
    expect(pinchFactor(b, a)).toBeCloseTo(0.5, 6);
  });

  it('never answers NaN on a degenerate span', () => {
    // Two contacts landing on the same pixel is a real frame, not a
    // hypothetical: fingers touch down together. NaN here would reach
    // `cam.zoom` and blank the canvas for the rest of the session, because
    // every later projection inherits it.
    const zero = touchSpan({ x: 200, y: 200 }, { x: 200, y: 200 });
    const wide = touchSpan({ x: 0, y: 0 }, { x: 300, y: 0 });
    expect(pinchFactor(zero, wide)).toBe(1);
    expect(pinchFactor(wide, zero)).toBe(1);
    expect(Number.isNaN(pinchFactor(zero, zero))).toBe(false);
    // And the guard is a floor, not just a zero check.
    const hair = touchSpan({ x: 0, y: 0 }, { x: MIN_SPAN_PX - 1, y: 0 });
    expect(pinchFactor(hair, wide)).toBe(1);
  });

  it('drives the same anchored zoom the wheel does, about the pinch centre', () => {
    const cam = makeCamera({ centre: { x: 11, y: 7 }, zoom: 90, viewport: VIEW, tilt: DEFAULT_TILT });
    const a = touchSpan({ x: 900, y: 300 }, { x: 1100, y: 300 });
    const b = touchSpan({ x: 850, y: 300 }, { x: 1150, y: 300 });
    const before = unproject(b.centre, cam, 0);
    zoomAbout(cam, b.centre, pinchFactor(a, b), EXTENT);
    const after = unproject(b.centre, cam, 0);
    expect(cam.zoom).toBeCloseTo(90 * 1.5, 6);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });
});
