// =========================================================================
// THE LIGHT ENGINE.
//
// The claim this file has to defend is "real lighting, not cheap tricks", so
// the tests are about the properties that make it real rather than about
// pixels: noise that is temporally coherent (a flame, not a strobe), shadows
// cast only by faces that can actually see the light, a finite shadow with a
// bounce floor, and a light that keeps burning when motion is turned off.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { fractalNoise, renderLight, type Occluder } from '../../art/lightEngine';

interface DrawCall {
  op: string;
  args: unknown[];
}

/** What the engine is allowed to reach for on a 2D context. */
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

/**
 * Records what was drawn, so geometry can be asserted without a real canvas.
 *
 * `RecordingCtx` is spelled out rather than inferred because `fill` reads
 * `this`, and letting TS infer the object from an initializer that refers to
 * itself is a circular reference it refuses (TS7022) — which vitest happily
 * ran anyway, so only `tsc` caught it.
 */
function fakeCtx(): { ctx: RecordingCtx; calls: DrawCall[] } {
  const calls: DrawCall[] = [];
  const path: { x: number; y: number }[] = [];
  const ctx: RecordingCtx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    clearRect: () => calls.push({ op: 'clearRect', args: [] }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    fillRect: () => calls.push({ op: 'fillRect', args: [] }),
    beginPath: () => path.splice(0, path.length),
    moveTo: (x: number, y: number) => path.push({ x, y }),
    lineTo: (x: number, y: number) => path.push({ x, y }),
    closePath: () => {},
    fill: () => {
      calls.push({ op: 'fill', args: [ctx.globalCompositeOperation, ctx.globalAlpha, [...path]] });
    },
  };
  return { ctx, calls };
}

const LIGHT = {
  pos: { x: 100, y: 20 },
  reach: 300,
  intensity: 0.6,
  size: 20,
};

/**
 * The layer is NIGHT, and the light cuts holes in it — so a shadow is drawn
 * with plain `source-over` (it puts night back), not `destination-out` (which
 * is now what the light itself does). Polygon `fill` is only ever a shadow;
 * the night fill and the lit gradient are both `fillRect`.
 */
function render(occluders: Occluder[], t = 1.5, animate = true) {
  const { ctx, calls } = fakeCtx();
  const out = renderLight(ctx as unknown as CanvasRenderingContext2D, 200, 200, LIGHT, occluders, t, animate);
  return { calls, out, shadows: calls.filter((c) => c.op === 'fill' && c.args[0] === 'source-over') };
}

describe('flicker is noise, not a waveform', () => {
  it('stays in range and is deterministic for a given time', () => {
    for (let i = 0; i < 200; i++) {
      const t = i * 0.37;
      const a = fractalNoise(t);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      expect(fractalNoise(t)).toBe(a);
    }
  });

  it('is temporally coherent — adjacent samples are related, not independent', () => {
    // This is the property that separates a guttering flame from a strobe, and
    // it is exactly what `Math.random()` per frame would fail.
    let maxStep = 0;
    for (let i = 0; i < 400; i++) {
      const t = i * 0.016; // one frame at 60fps
      maxStep = Math.max(maxStep, Math.abs(fractalNoise(t + 0.016) - fractalNoise(t)));
    }
    expect(maxStep).toBeLessThan(0.25);
  });

  it('does not repeat on a short period the eye could find', () => {
    // A sine (or two stacked sines) would match itself again quickly. Sample a
    // long window and confirm no short lag reproduces the signal.
    const N = 600;
    const sig = Array.from({ length: N }, (_, i) => fractalNoise(i * 0.05));
    for (let lag = 8; lag < 120; lag++) {
      let err = 0;
      for (let i = 0; i + lag < N; i++) err += Math.abs(sig[i] - sig[i + lag]);
      expect(err / (N - lag)).toBeGreaterThan(0.02);
    }
  });
});

describe('shadows are cast by real geometry', () => {
  const box: Occluder = { x: 80, y: 100, w: 40, h: 30 };

  it('casts nothing when there is nothing to block the light', () => {
    expect(render([]).shadows.length).toBe(0);
  });

  it('casts from a box below the light, and every shadow is a quad', () => {
    const { shadows } = render([box]);
    expect(shadows.length).toBeGreaterThan(0);
    for (const s of shadows) expect((s.args[2] as unknown[]).length).toBe(4);
  });

  it('only the faces that can see the light cast', () => {
    // Light is above the box, so its TOP edge casts and its bottom must not:
    // including back faces makes a box shadow itself, which reads as the
    // shadow starting one box-width too late.
    const { shadows } = render([box]);
    const pts = shadows.flatMap((s) => s.args[2] as { x: number; y: number }[]);
    // No shadow polygon may originate on the far (bottom) edge.
    const originsOnBottom = pts.filter((p) => Math.abs(p.y - (box.y + box.h)) < 0.01 && p.x >= box.x && p.x <= box.x + box.w);
    expect(originsOnBottom.length).toBe(0);
  });

  it('samples the flame across its width — that is what makes the edge soft', () => {
    // One shadow per facing edge per flame sample. A point light would emit
    // exactly one, and its shadow would have a knife edge.
    const { shadows } = render([box]);
    expect(shadows.length).toBeGreaterThanOrEqual(7);
  });

  it('leaves a bounce floor instead of cutting to black', () => {
    // Each cut is partial; N of them must not sum to full occlusion, or the
    // scene goes pitch black behind anything (which is what the first cut of
    // this engine actually did to the town).
    const { shadows } = render([box]);
    for (const s of shadows) expect(s.args[1] as number).toBeLessThan(1);
    const remaining = shadows
      .filter((s) => s.args[1])
      .slice(0, 7)
      .reduce((acc, s) => acc * (1 - (s.args[1] as number)), 1);
    expect(remaining).toBeGreaterThan(0.2);
    expect(remaining).toBeLessThan(0.5);
  });

  it('draws exactly samples x facing-edges, and a rectangle never shows more than two', () => {
    // The per-frame budget has to be predictable, and this is the shape of it.
    // A box directly under the light shows only its top edge; one off to the
    // side shows a top AND a flank, which is why the count is not a simple
    // multiple of the occluder count.
    const SAMPLES = 7;
    const under = render([box]).shadows.length;
    expect(under).toBe(SAMPLES * 1);

    const offToTheSide = render([{ x: 10, y: 120, w: 30, h: 20 }]).shadows.length;
    expect(offToTheSide).toBe(SAMPLES * 2);

    const three = render([box, { x: 10, y: 120, w: 30, h: 20 }, { x: 150, y: 90, w: 25, h: 40 }]).shadows.length;
    expect(three).toBe(under + offToTheSide * 2);
    // The ceiling that matters: no rectangle can ever present more than two
    // faces to a point, so the frame cost is bounded at 2 x samples x boxes.
    expect(three).toBeLessThanOrEqual(SAMPLES * 2 * 3);
  });
});

describe('reduced motion', () => {
  it('keeps the light burning but freezes it', () => {
    const a = render([], 1.0, false).out;
    const b = render([], 99.0, false).out;
    expect(a.flicker).toBe(b.flicker);
    expect(a.lean).toBe(0);
    expect(a.bob).toBe(0);
    // Still lit — the bargain is "the light stays, the movement goes".
    expect(a.flicker).toBeGreaterThan(0.5);
  });

  it('actually moves when motion is allowed', () => {
    const a = render([], 1.0, true).out;
    const b = render([], 4.7, true).out;
    expect(a.flicker).not.toBe(b.flicker);
    expect(a.lean).not.toBe(b.lean);
  });
});
