// =========================================================================
// THE BOARD CAMERA.
//
// Two decisions are on trial here and both are recorded in the docs rather
// than in anyone's head: the view is TILTED rather than top-down
// (ENGINE_PLAN §1.2), and it is squashed rather than ROTATED to a diamond
// (LIGHTING_PLAN §12). Both were argued in prose. Prose does not fail a test
// run, so each one gets a check that the rejected alternative cannot pass.
//
// Per LIGHTING_PLAN §10: prefer tests that would REJECT the old behaviour over
// tests that merely describe the new one. Top-down and isometric are both
// computed here explicitly and both are shown to fail the property that made
// us pick against them.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TILT,
  MAX_TILT,
  MIN_TILT,
  clampTilt,
  heightScale,
  makeCamera,
  project,
  sortKey,
  tileScreenHeight,
  unproject,
  visibleBounds,
  type Camera,
  type Vec3,
} from '../scene/camera';

const CAM: Camera = makeCamera({ centre: { x: 10, y: 6 }, zoom: 48, viewport: { x: 1280, y: 800 } });

/** Straight down — what the game renders today, as an equation. */
const TOP_DOWN: Camera = makeCamera({ ...CAM, tilt: MIN_TILT });

describe('the tilt is what makes a piece stand up', () => {
  it('lifts a piece off the board — top-down cannot', () => {
    const foot: Vec3 = { x: 10, y: 6, z: 0 };
    const head: Vec3 = { x: 10, y: 6, z: 1 };

    // THE REPRO, stated as a number. A satellite view projects every height to
    // the same pixel, so a piece one tile tall is drawn exactly on top of its
    // own footprint — a painted decal. This is what "top-down has nothing for
    // the lantern to rake across" means concretely.
    const flat = project(foot, { ...TOP_DOWN, tilt: 0 }).y - project(head, { ...TOP_DOWN, tilt: 0 }).y;
    expect(flat).toBe(0);

    // Tilted, the same piece climbs the screen by zoom * sin(tilt).
    const lift = project(foot, CAM).y - project(head, CAM).y;
    expect(lift).toBeCloseTo(CAM.zoom * Math.sin(DEFAULT_TILT), 6);
    expect(lift).toBeGreaterThan(30);
  });

  it('gives a wall a front face tall enough to light', () => {
    // Below roughly 8px of face there is not enough surface for a normal map
    // to say anything, and the tilt is costing board area for nothing. Check
    // the whole breakpoint ladder the map uses today (24 / 48 / 84 / 92 px).
    for (const zoom of [24, 48, 84, 92]) {
      expect(heightScale({ ...CAM, zoom })).toBeGreaterThan(8);
    }
  });

  it('keeps enough board on screen to be a board', () => {
    // The other side of the same trade. Squash too hard and the map is a
    // letterbox. A 20x12 floor has to fit a 1280x800 viewport at zoom 48.
    const b = visibleBounds(CAM, 0, 0);
    expect(b.maxX - b.minX).toBeGreaterThanOrEqual(20);
    expect(b.maxY - b.minY).toBeGreaterThanOrEqual(12);
  });

  it('draws a tile a little over half as tall as it is wide', () => {
    expect(tileScreenHeight(CAM) / CAM.zoom).toBeCloseTo(Math.cos(DEFAULT_TILT), 6);
    expect(tileScreenHeight(CAM) / CAM.zoom).toBeGreaterThan(0.5);
    expect(tileScreenHeight(CAM) / CAM.zoom).toBeLessThan(0.65);
  });
});

describe('squashed, not rotated — the reason it is not isometric', () => {
  /** 2:1 dimetric, the FFT/Tactics Ogre projection we argued against. */
  function isometric(p: Vec3, cam: Camera) {
    const dx = p.x - cam.centre.x;
    const dy = p.y - cam.centre.y;
    return {
      x: (dx - dy) * cam.zoom * 0.5 + cam.viewport.x / 2,
      y: (dx + dy) * cam.zoom * 0.25 - p.z * cam.zoom * 0.5 + cam.viewport.y / 2,
    };
  }

  const row: Vec3[] = Array.from({ length: 8 }, (_, i) => ({ x: i, y: 4, z: 0 }));

  it('keeps a row of tiles on one screen line; isometric does not', () => {
    // THIS IS THE WHOLE ARGUMENT, as a measurement. `nav/geometry.ts` picks
    // controller focus by spatial scoring over bounding boxes, and the shadow
    // pipeline assumes axis-aligned rectangles. Both need a board row to stay
    // a screen row.
    const iso = row.map((p) => isometric(p, CAM).y);
    const spreadIso = Math.max(...iso) - Math.min(...iso);
    // The repro: eight tiles of one row land on eight different screen lines,
    // a staircase most of a viewport tall.
    expect(spreadIso).toBeGreaterThan(80);

    const tilted = row.map((p) => project(p, CAM).y);
    expect(Math.max(...tilted) - Math.min(...tilted)).toBeCloseTo(0, 9);
  });

  it('keeps a column of tiles on one screen column; isometric does not', () => {
    const col: Vec3[] = Array.from({ length: 8 }, (_, i) => ({ x: 3, y: i, z: 0 }));
    const iso = col.map((p) => isometric(p, CAM).x);
    expect(Math.max(...iso) - Math.min(...iso)).toBeGreaterThan(80);

    const tilted = col.map((p) => project(p, CAM).x);
    expect(Math.max(...tilted) - Math.min(...tilted)).toBeCloseTo(0, 9);
  });

  it('so a tile stays an axis-aligned rectangle on screen', () => {
    // The corners of one tile, projected. Under the tilt this is a rectangle,
    // which is what every occluder in the lighting engine is allowed to be.
    const c = [
      { x: 5, y: 5, z: 0 },
      { x: 6, y: 5, z: 0 },
      { x: 6, y: 6, z: 0 },
      { x: 5, y: 6, z: 0 },
    ].map((p) => project(p, CAM));
    expect(c[0].y).toBeCloseTo(c[1].y, 9); // top edge level
    expect(c[2].y).toBeCloseTo(c[3].y, 9); // bottom edge level
    expect(c[0].x).toBeCloseTo(c[3].x, 9); // left edge plumb
    expect(c[1].x).toBeCloseTo(c[2].x, 9); // right edge plumb
  });
});

describe('projection is exactly invertible', () => {
  it('round-trips every point on the board', () => {
    // Every click, hover and tooltip depends on this, and orthographic is why
    // it is one division per axis rather than a ray cast.
    for (let i = 0; i < 60; i++) {
      const p = { x: (i * 7.3) % 40 - 12, y: (i * 3.9) % 26 - 7, z: 0 };
      const back = unproject(project(p, CAM), CAM, 0);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('round-trips at height too, given the plane', () => {
    for (const z of [0, 0.4, 1, 2.5]) {
      const p = { x: 7.25, y: 3.5, z };
      const back = unproject(project(p, CAM), CAM, z);
      expect(back.x).toBeCloseTo(p.x, 9);
      expect(back.y).toBeCloseTo(p.y, 9);
    }
  });

  it('puts the camera centre at the middle of the viewport', () => {
    const s = project({ x: CAM.centre.x, y: CAM.centre.y, z: 0 }, CAM);
    expect(s.x).toBeCloseTo(CAM.viewport.x / 2, 9);
    expect(s.y).toBeCloseTo(CAM.viewport.y / 2, 9);
  });
});

describe('painter order', () => {
  it('draws far rows before near ones', () => {
    expect(sortKey({ x: 0, y: 3, z: 0 })).toBeLessThan(sortKey({ x: 0, y: 4, z: 0 }));
  });

  it('draws a piece after the tile it stands on', () => {
    expect(sortKey({ x: 0, y: 4, z: 0 })).toBeLessThan(sortKey({ x: 0, y: 4, z: 0.5 }));
  });

  it('never lets height lift an object past its own row', () => {
    // The failure this prevents: a lantern held high drawing THROUGH the wall
    // in front of it. Row separation has to beat any reachable height, so the
    // y term must dominate for every height the game can produce.
    for (const z of [0, 1, 4, 20, 1000]) {
      expect(sortKey({ x: 0, y: 4, z })).toBeLessThan(sortKey({ x: 0, y: 5, z: 0 }));
    }
  });
});

describe('culling', () => {
  it('keeps everything that lands inside the viewport', () => {
    const b = visibleBounds(CAM, 0, 0);
    for (let i = 0; i < 400; i++) {
      const p = { x: (i % 20) * 2 - 10, y: Math.floor(i / 20) * 1.5 - 5, z: 0 };
      const s = project(p, CAM);
      const onScreen = s.x >= 0 && s.x <= CAM.viewport.x && s.y >= 0 && s.y <= CAM.viewport.y;
      if (onScreen) {
        expect(p.x).toBeGreaterThanOrEqual(b.minX);
        expect(p.x).toBeLessThanOrEqual(b.maxX);
        expect(p.y).toBeGreaterThanOrEqual(b.minY);
        expect(p.y).toBeLessThanOrEqual(b.maxY);
      }
    }
  });

  it('widens the far edge so tall pieces do not pop in', () => {
    // A tall piece standing below the viewport still pokes into it. Culling on
    // the footprint alone makes pieces appear from nothing at the bottom edge.
    const flat = visibleBounds(CAM, 0, 0);
    const tall = visibleBounds(CAM, 0, 3);
    expect(tall.maxY).toBeGreaterThan(flat.maxY);

    // And the widening is enough: a piece 3 tall, standing at the widened
    // edge, must have its head at or below the bottom of the viewport.
    const head = project({ x: CAM.centre.x, y: tall.maxY, z: 3 }, CAM);
    expect(head.y).toBeGreaterThanOrEqual(CAM.viewport.y - 1e-6);
  });
});

describe('tilt is clamped to angles that mean something', () => {
  it('refuses a degenerate view', () => {
    expect(clampTilt(0)).toBe(MIN_TILT);
    expect(clampTilt(-5)).toBe(MIN_TILT);
    expect(clampTilt(Math.PI)).toBe(MAX_TILT);
    // Edge-on would collapse the board to a line: cos(tilt) must stay positive.
    expect(Math.cos(clampTilt(Math.PI))).toBeGreaterThan(0);
  });

  it('leaves the default alone', () => {
    expect(clampTilt(DEFAULT_TILT)).toBe(DEFAULT_TILT);
    expect(makeCamera().tilt).toBe(DEFAULT_TILT);
  });
});
