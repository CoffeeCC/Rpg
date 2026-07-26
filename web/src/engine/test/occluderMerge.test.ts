// =========================================================================
// THE FAN OF DIAGONALS — Phase 1 of docs/LIGHTING_PLAN.md.
//
// Paul, on the lit map, more than once: lines radiating out from the corners
// of a wall. The disc-sampled flame killed one cause of that. This file is
// about the other one, which is not in the shadow maths at all — it is in
// what the engine gets handed.
//
// A wall on the map is ten `.map-cell.wall` elements. Ten rectangles, ten
// shadow quads, and a seam at every cell boundary: doubled darkness where the
// cells overlap, leaked light where they do not.
//
// These tests hold to the standard in §10 of the plan: PREFER TESTS THAT
// WOULD REJECT THE OLD BEHAVIOUR over tests that merely describe the new one,
// and assert that the repro actually fired. Every comparison below runs the
// engine BOTH ways — `mergeRuns: false` is the old geometry — and asserts
// that the old one is broken before asserting that the new one is not. A
// green test that never triggered the bug proves nothing.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { flameSample, flameSpin, renderLight, type Occluder, type Vec2 } from '../../art/lightEngine';
import { MERGE_TOLERANCE, mergeOccluders } from '../../art/occluderMerge';

// -------------------------------------------------------------------------
// Fixtures: a grid the way the DOM sweep actually hands one over
// -------------------------------------------------------------------------

/** Cell size and gap in CANVAS px — the map's 40px cell and 2px gap at SCALE 0.5. */
const CELL = 20;
const GAP = 1;
const PITCH = CELL + GAP;
/** What `occluderPad={1.5}` in FloorScreen becomes at half resolution. */
const PAD = 0.75;

/** One row of wall cells, padded the way FloorScreen pads them (so they overlap). */
function paddedRun(n: number, y = 100): Occluder[] {
  return Array.from({ length: n }, (_, i) => ({
    x: i * PITCH - PAD,
    y: y - PAD,
    w: CELL + PAD * 2,
    h: CELL + PAD * 2,
  }));
}

/** The same row unpadded, so the grid's gap is a real hole between the cells. */
function gappedRun(n: number, y = 100): Occluder[] {
  return Array.from({ length: n }, (_, i) => ({ x: i * PITCH, y, w: CELL, h: CELL }));
}

const centreOf = (o: Occluder) => ({ x: o.x + o.w / 2, y: o.y + o.h / 2 });
const covers = (o: Occluder, p: Vec2) => p.x >= o.x && p.x <= o.x + o.w && p.y >= o.y && p.y <= o.y + o.h;
const bbox = (list: Occluder[]) => ({
  x: Math.min(...list.map((o) => o.x)),
  y: Math.min(...list.map((o) => o.y)),
  r: Math.max(...list.map((o) => o.x + o.w)),
  b: Math.max(...list.map((o) => o.y + o.h)),
});

describe('a run of cells becomes one wall', () => {
  it('collapses ten padded cells into a single rectangle', () => {
    const cells = paddedRun(10);
    const merged = mergeOccluders(cells);
    expect(merged.length).toBe(1);
    // And it is the SAME wall: same span, same thickness.
    const before = bbox(cells);
    const after = bbox(merged);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
    expect(after.r).toBeCloseTo(before.r, 6);
    expect(after.b).toBeCloseTo(before.b, 6);
  });

  it('collapses them whether they overlap or are separated by the grid gap', () => {
    // The pad exists to close the gap. Merging closes it exactly instead of
    // closing it by making every neighbour pair overlap, which is the trade
    // that produced the dark seams in the first place.
    expect(mergeOccluders(gappedRun(10)).length).toBe(1);
    expect(mergeOccluders(paddedRun(10)).length).toBe(1);
  });

  it('collapses a column as readily as a row', () => {
    const column = Array.from({ length: 8 }, (_, i) => ({ x: 60, y: i * PITCH, w: CELL, h: CELL }));
    expect(mergeOccluders(column).length).toBe(1);
  });

  it('collapses a solid block, not just a line of cells', () => {
    const block: Occluder[] = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) block.push({ x: c * PITCH, y: r * PITCH, w: CELL, h: CELL });
    expect(mergeOccluders(block).length).toBe(1);
  });
});

describe('merging changes what is drawn, never what is blocked', () => {
  it('leaves a doorway open', () => {
    // The one thing that must not merge. A gap of a whole cell is light's way
    // through, and an engine that quietly walled it up would be lying to the
    // player about a route.
    const left = gappedRun(4);
    const right = gappedRun(4).map((o) => ({ ...o, x: o.x + 6 * PITCH }));
    expect(mergeOccluders([...left, ...right]).length).toBe(2);
  });

  it('keeps every original cell covered', () => {
    const shapes: Occluder[][] = [
      paddedRun(10),
      gappedRun(10),
      // An L: a row and a column meeting at a corner.
      [...gappedRun(5), ...Array.from({ length: 4 }, (_, i) => ({ x: 0, y: 100 + (i + 1) * PITCH, w: CELL, h: CELL }))],
      // A doorway with walls either side, plus a barrel standing alone.
      [...gappedRun(3), ...gappedRun(3).map((o) => ({ ...o, x: o.x + 5 * PITCH })), { x: 140, y: 300, w: 12, h: 14 }],
    ];
    for (const shape of shapes) {
      const merged = mergeOccluders(shape);
      for (const cell of shape) {
        expect(merged.some((m) => covers(m, centreOf(cell)))).toBe(true);
      }
    }
  });

  it('never spreads beyond where the originals reached', () => {
    // Merging is a union, so it can only ever darken by a hair — but it must
    // not grow the wall. On a fog-of-war grid an occluder that reaches further
    // than the thing it stands for is a lie about what you can see.
    const shape = [...paddedRun(6), { x: 300, y: 40, w: 18, h: 18 }];
    const before = bbox(shape);
    const after = bbox(mergeOccluders(shape));
    expect(after.x).toBeGreaterThanOrEqual(before.x - MERGE_TOLERANCE);
    expect(after.y).toBeGreaterThanOrEqual(before.y - MERGE_TOLERANCE);
    expect(after.r).toBeLessThanOrEqual(before.r + MERGE_TOLERANCE);
    expect(after.b).toBeLessThanOrEqual(before.b + MERGE_TOLERANCE);
  });

  it('leaves a lone object alone', () => {
    // A barrel is not a cell — its occluder is the art box, sharing an edge
    // with nothing. It has to come out the far side untouched.
    const barrel: Occluder = { x: 140, y: 300, w: 12, h: 14 };
    expect(mergeOccluders([barrel])).toEqual([barrel]);
    const withWall = mergeOccluders([...gappedRun(4), barrel]);
    expect(withWall).toContainEqual(barrel);
  });
});

// -------------------------------------------------------------------------
// The rejecting test the plan names: probe behind a wall, count the quads
// -------------------------------------------------------------------------

interface DrawCall {
  op: string;
  poly: Vec2[];
}

interface RecordingCtx {
  globalCompositeOperation: string;
  globalAlpha: number;
  fillStyle: unknown;
  clearRect(): void;
  createRadialGradient(): { addColorStop(): void };
  createLinearGradient(): { addColorStop(): void };
  fillRect(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  fill(): void;
}

function fakeCtx(): { ctx: RecordingCtx; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const path: Vec2[] = [];
  const ctx: RecordingCtx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    clearRect: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => {},
    beginPath: () => path.splice(0, path.length),
    moveTo: (x, y) => path.push({ x, y }),
    lineTo: (x, y) => path.push({ x, y }),
    closePath: () => {},
    fill: () => calls.push({ op: ctx.globalCompositeOperation, poly: [...path] }),
  };
  return { ctx, calls };
}

/**
 * The flame is a POINT here (`size: 0`) and the motion is frozen.
 *
 * Not because either is how the game runs, but because both are noise for
 * this measurement. A disc-sampled flame smears every seam across its own
 * penumbra, so counting overlapping quads would be measuring the softness
 * rather than the seam. Collapse the samples onto one point and the seam is
 * exactly as wide as the geometry says it is — which is the thing on trial.
 */
const PROBE_LIGHT = { pos: { x: 105, y: 20 }, reach: 400, intensity: 0.7, size: 0 };
const PROBE_Y = 170;

function cast(occluders: Occluder[], mergeRuns: boolean) {
  const { ctx, calls } = fakeCtx();
  const out = renderLight(
    ctx as unknown as CanvasRenderingContext2D,
    260,
    260,
    PROBE_LIGHT,
    occluders,
    1.5,
    false,
    undefined,
    undefined,
    undefined,
    undefined,
    mergeRuns,
  );
  return { out, quads: calls.filter((c) => c.op === 'source-over').map((c) => c.poly) };
}

/** Standard ray-crossing test. The quads are convex but need not be. */
function inside(p: Vec2, poly: Vec2[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * How many shadows of the wall's FRONT FACE cover a point.
 *
 * Front faces only, because the flanks of the end cells throw their own quads
 * across this line and they are not what is being counted. A run's front face
 * is one surface; how many polygons the engine spends covering it, and whether
 * that number is the same everywhere along it, is the whole question.
 */
function frontFaceDepth(quads: Vec2[][], p: Vec2, faceY: number): number {
  return quads.filter((q) => Math.abs(q[0].y - faceY) < 0.01 && Math.abs(q[1].y - faceY) < 0.01 && inside(p, q)).length;
}

/** Where a point on the wall plane lands on the probe line, light being a point. */
function project(xOnWall: number, faceY: number): Vec2 {
  const k = (PROBE_Y - PROBE_LIGHT.pos.y) / (faceY - PROBE_LIGHT.pos.y);
  return { x: PROBE_LIGHT.pos.x + (xOnWall - PROBE_LIGHT.pos.x) * k, y: PROBE_Y };
}

const variance = (xs: number[]) => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length;
};

describe('THE SEAMS — a wall casts one shadow, not one per cell', () => {
  const N = 10;

  /**
   * Probe alternately at a cell's middle and at the seam between two cells,
   * projected onto the line behind the wall. If the wall is really one
   * surface, those points are indistinguishable.
   */
  function probes(faceY: number): Vec2[] {
    const pts: Vec2[] = [];
    for (let i = 1; i < N - 1; i++) {
      pts.push(project(i * PITCH + CELL / 2, faceY)); // middle of cell i
      pts.push(project(i * PITCH + CELL + GAP / 2, faceY)); // the seam after it
    }
    return pts;
  }

  it('padded cells: the old geometry stacked two shadows at every seam, the merged one stacks one', () => {
    const cells = paddedRun(N);
    const faceY = 100 - PAD;
    const pts = probes(faceY);

    const before = cast(cells, false);
    const after = cast(cells, true);
    const oldDepth = pts.map((p) => frontFaceDepth(before.quads, p, faceY));
    const newDepth = pts.map((p) => frontFaceDepth(after.quads, p, faceY));

    // THE REPRO FIRED. Seams are covered twice, cell middles once — the
    // alternating stripe of doubled darkness Paul was seeing radiate from the
    // wall. Without this assertion the one below proves nothing.
    expect(variance(oldDepth)).toBeGreaterThan(0);
    expect(Math.max(...oldDepth)).toBe(2 * Math.min(...oldDepth));

    // And it is gone: the same depth everywhere along the wall.
    expect(variance(newDepth)).toBe(0);
    expect(new Set(newDepth).size).toBe(1);
    expect(after.out.merged).toBe(1);
    expect(before.out.merged).toBe(N);
  });

  it('unpadded cells: the old geometry leaked light through every seam', () => {
    // The other half of the same artifact, and the reason `occluderPad` was
    // added. Merging closes the gap without making anything overlap, so both
    // halves go at once.
    const cells = gappedRun(N);
    const faceY = 100;
    const pts = probes(faceY);

    const before = cast(cells, false);
    const after = cast(cells, true);
    const oldDepth = pts.map((p) => frontFaceDepth(before.quads, p, faceY));
    const newDepth = pts.map((p) => frontFaceDepth(after.quads, p, faceY));

    // The leak, measured: points behind a seam are in NO shadow at all.
    expect(Math.min(...oldDepth)).toBe(0);
    expect(oldDepth.filter((d) => d === 0).length).toBeGreaterThanOrEqual(N - 2);

    expect(Math.min(...newDepth)).toBeGreaterThan(0);
    expect(variance(newDepth)).toBe(0);
  });

  it('cuts the polygon fills on one wall by roughly five to one', () => {
    // The budget half of the argument. Phase 2 spends what this saves.
    const cells = paddedRun(N);
    const before = cast(cells, false).quads.length;
    const after = cast(cells, true).quads.length;
    expect(before).toBeGreaterThan(100);
    expect(after).toBeLessThanOrEqual(14);
    expect(after * 5).toBeLessThan(before);
  });

  it('reports both counts so the saving is visible from outside', () => {
    const out = cast(paddedRun(N), true).out;
    expect(out.casters).toBe(N);
    expect(out.merged).toBe(1);
  });
});

// -------------------------------------------------------------------------
// The other half of Phase 1: the sample disc turns
// -------------------------------------------------------------------------

describe('THE BANDING — the sample disc turns instead of standing still', () => {
  const src = { x: 100, y: 100 };
  const SIZE = 22;
  const N = 7;
  const angleOf = (p: Vec2) => Math.atan2(p.y - src.y, p.x - src.x);
  const bin = (a: number) => Math.floor(((a + Math.PI) / (Math.PI * 2)) * 16);
  const frames = Array.from({ length: 500 }, (_, i) => i * 0.016); // 8 seconds

  it('was frozen in place before, and now sweeps the whole circle', () => {
    // N samples make N steps of penumbra. Frozen, every step lands on the same
    // pixels every frame and the soft edge gets a visible ribbing. Turning the
    // disc is what lets the frames average into a ramp.
    const before = frames.map(() => angleOf(flameSample(src, SIZE, 0, N)));
    const after = frames.map((t) => angleOf(flameSample(src, SIZE, 0, N, flameSpin(t))));

    // THE REPRO: 500 frames, one angle. Nothing to average.
    expect(new Set(before.map((a) => a.toFixed(9))).size).toBe(1);
    // And now it visits every part of the flame.
    expect(new Set(after.map((a) => bin(a))).size).toBeGreaterThanOrEqual(14);
  });

  it('turns smoothly — no step the eye would catch as a jitter', () => {
    // A random orientation per frame would decorrelate the steps too, and buzz.
    // Same argument as the flicker: coherence in time is what separates a flame
    // from a fault in the wiring.
    let maxStep = 0;
    for (const t of frames) {
      const d = flameSpin(t + 0.016) - flameSpin(t);
      maxStep = Math.max(maxStep, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
    }
    expect(maxStep).toBeLessThan(0.08);
  });

  it('keeps every sample inside the flame however far it has turned', () => {
    for (const t of frames) {
      for (let i = 0; i < N; i++) {
        const p = flameSample(src, SIZE, i, N, flameSpin(t));
        expect(Math.hypot(p.x - src.x, p.y - src.y)).toBeLessThanOrEqual(SIZE / 2 + 1e-9);
      }
    }
  });

  it('is deterministic, and holds still when motion is off', () => {
    expect(flameSpin(3.25)).toBe(flameSpin(3.25));
    expect(flameSpin(1, false)).toBe(flameSpin(99, false));
    // Not zero: an unrotated disc puts sample 0 due east of the flame and
    // hands every vertical wall on screen the same phase of the banding.
    expect(flameSpin(1, false)).not.toBe(0);
  });

  it('spends samples instead of movement when motion is off, and the shadow floor does not move', () => {
    // Reduced motion draws ONE frame, so there are no other frames to average
    // the steps into. More samples is the only answer left, and it is free.
    // One box under the light shows exactly one face, so the quad count IS
    // the sample count.
    const box: Occluder[] = [{ x: 80, y: 100, w: 40, h: 30 }];
    const still = cast(box, true).quads.length; // motion off
    const moving = castAnimated(box).quads.length; // motion on
    expect(still).toBeGreaterThan(moving);

    // `ambient^(1/N)` is solved for whatever N is in hand, so N cuts leave
    // exactly the same light behind either way. A still frame is a smoother
    // shadow, not a darker one.
    expect(shadowFloor(still)).toBeCloseTo(shadowFloor(moving), 9);
  });
});

/** The same probe cast with motion ON, for the sample-count comparison. */
function castAnimated(occluders: Occluder[]) {
  const { ctx, calls } = fakeCtx();
  renderLight(ctx as unknown as CanvasRenderingContext2D, 260, 260, PROBE_LIGHT, occluders, 1.5, true);
  return { quads: calls.filter((c) => c.op === 'source-over').map((c) => c.poly) };
}

/** What survives N partial cuts at the engine's default ambient. */
function shadowFloor(samples: number): number {
  const AMBIENT = 0.34;
  return (1 - (1 - Math.pow(AMBIENT, 1 / samples))) ** samples;
}
