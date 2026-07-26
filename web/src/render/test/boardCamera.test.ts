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
  MAX_ZOOM,
  MIN_ZOOM,
  PLAY_FACTOR,
  DEADZONE,
  clampAxis,
  clampCentre,
  clampZoom,
  extentBounds,
  fitZoom,
  followHero,
  latticeTransform,
  latticeCss,
  scaleCamera,
  zoomFor,
  type BoardExtent,
} from '../boardCamera';

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
