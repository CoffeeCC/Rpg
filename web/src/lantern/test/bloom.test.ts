// =========================================================================
// BLOOM.
//
// Both techniques in this pass exist to fix a specific artifact, so both are
// tested by REPRODUCING the artifact with the naive version and then showing
// it gone — the standard from LIGHTING_PLAN §10. `boxAverage` and
// `hardThreshold` are shipped in the module for no other purpose.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  BLOOM_DOWNSAMPLE_GLSL,
  BLOOM_UPSAMPLE_GLSL,
  MIN_MIP,
  boxAverage,
  hardThreshold,
  karisAverage,
  karisWeight,
  luma,
  mipChain,
  softKnee,
  type RGB,
} from '../passes/bloom';

describe('the mip chain', () => {
  it('halves each step and respects the step count', () => {
    const chain = mipChain(1280, 800, 6);
    expect(chain.length).toBe(6);
    expect(chain[0]).toEqual({ width: 640, height: 400 });
    expect(chain[1]).toEqual({ width: 320, height: 200 });
    expect(chain[5]).toEqual({ width: 20, height: 12 });
  });

  it('stops before it makes a degenerate level', () => {
    // The floor is what stops an ultrawide from producing a 1-texel-tall
    // target, whose bilinear upsample smears into a visible horizontal band.
    for (const [w, h] of [
      [3440, 1440],
      [1280, 800],
      [640, 360],
      [400, 60],
    ]) {
      for (const level of mipChain(w, h, 12)) {
        expect(level.width).toBeGreaterThanOrEqual(MIN_MIP);
        expect(level.height).toBeGreaterThanOrEqual(MIN_MIP);
      }
    }
  });

  it('gives a small viewport fewer levels rather than broken ones', () => {
    expect(mipChain(64, 64, 8).length).toBeLessThan(8);
    expect(mipChain(8, 8, 6)).toEqual([]);
  });

  it('gives the cheap tier a shorter chain, which is a tighter glow', () => {
    expect(mipChain(1280, 800, 5).length).toBeLessThan(mipChain(1280, 800, 7).length);
  });
});

describe('FIREFLIES — one bright texel must not own the average', () => {
  /**
   * The artifact, staged: a lantern spark against near-black. A plain mean is
   * dominated by its largest input, so this single texel survives every
   * downsample and scintillates as the light moves — the thing that makes
   * cheap bloom look like sensor noise.
   */
  const spark: RGB = [400, 300, 120];
  const dark: RGB = [0.02, 0.02, 0.03];
  const taps: RGB[] = [spark, dark, dark, dark];

  it('the repro fires: a box average is 25x brighter than its neighbours', () => {
    const box = boxAverage(taps);
    expect(luma(...box)).toBeGreaterThan(50);
    // Almost all of that came from one of four taps.
    expect(luma(...box) / luma(...spark)).toBeCloseTo(0.25, 2);
  });

  it('the Karis average drops it by more than two orders of magnitude', () => {
    const box = luma(...boxAverage(taps));
    const karis = luma(...karisAverage(taps));
    expect(karis).toBeLessThan(box / 100);
  });

  it('but leaves an ordinary bright region essentially alone', () => {
    // The failure mode of over-correcting: bloom that stops working. An evenly
    // lit patch must come through at close to its real value.
    const even: RGB[] = [
      [2, 1.8, 1.2],
      [2.1, 1.9, 1.3],
      [1.9, 1.7, 1.1],
      [2, 1.8, 1.2],
    ];
    const box = luma(...boxAverage(even));
    const karis = luma(...karisAverage(even));
    expect(karis / box).toBeGreaterThan(0.9);
  });

  it('weights strictly less as a tap gets brighter', () => {
    let prev = Infinity;
    for (const v of [0, 0.5, 1, 10, 100, 1000]) {
      const w = karisWeight(v, v, v);
      expect(w).toBeLessThan(prev);
      expect(w).toBeGreaterThan(0);
      prev = w;
    }
  });

  it('is a no-op on a flat input, whatever its brightness', () => {
    // Equal taps must average to themselves — a weighting scheme that dims a
    // uniform patch is silently darkening the whole bloom.
    for (const v of [0.1, 1, 50]) {
      const flat: RGB[] = [
        [v, v, v],
        [v, v, v],
        [v, v, v],
        [v, v, v],
      ];
      expect(karisAverage(flat)[0]).toBeCloseTo(v, 6);
    }
  });
});

describe('ONSET — a threshold must not draw a line across a gradient', () => {
  const T = 1.0;
  const KNEE = 0.5;

  it('the repro fires: a hard threshold steps from 0 to 1 instantly', () => {
    // Swept across a gradient by a moving light, this step IS a visible
    // contour crawling over the image.
    const below = hardThreshold(T - 1e-6, T);
    const above = hardThreshold(T + 1e-6, T);
    expect(above - below).toBe(1);
  });

  it('the soft knee has no step anywhere', () => {
    let prev = softKnee(0, T, KNEE);
    let maxStep = 0;
    for (let v = 0; v <= 3; v += 0.001) {
      const c = softKnee(v, T, KNEE);
      maxStep = Math.max(maxStep, Math.abs(c - prev));
      prev = c;
    }
    expect(maxStep).toBeLessThan(0.01);
  });

  it('has no kink either — the slope is continuous through the knee', () => {
    // Matching value but not slope still leaves a visible crease. Second
    // difference stays bounded across the whole ramp.
    const f = (v: number) => softKnee(v, T, KNEE);
    const h = 0.002;
    let worst = 0;
    for (let v = T - KNEE * 2; v <= T + KNEE * 2; v += h) {
      worst = Math.max(worst, Math.abs(f(v + h) - 2 * f(v) + f(v - h)) / (h * h));
    }
    expect(Number.isFinite(worst)).toBe(true);
    expect(worst).toBeLessThan(30);
  });

  it('still keeps the dark out and lets the bright through', () => {
    // A soft knee that leaks the whole scene into the bloom is just a blur.
    expect(softKnee(0.05, T, KNEE)).toBeLessThan(0.02);
    expect(softKnee(0.4, T, KNEE)).toBeLessThan(0.05);
    expect(softKnee(6, T, KNEE)).toBeGreaterThan(0.75);
  });

  it('rises monotonically, and never returns more than all of the light', () => {
    let prev = -1;
    for (let v = 0; v <= 20; v += 0.01) {
      const c = softKnee(v, T, KNEE);
      expect(c).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(c).toBeLessThanOrEqual(1);
      expect(c).toBeGreaterThanOrEqual(0);
      prev = c;
    }
  });

  it('degenerates to the hard cut at zero knee, so the dial is honest', () => {
    expect(softKnee(T + 0.1, T, 0)).toBe(1);
    expect(softKnee(T - 0.1, T, 0)).toBe(0);
  });
});

describe('the shaders carry the same technique the TypeScript was tested with', () => {
  it('downsamples with 13 taps and applies Karis conditionally', () => {
    const taps = (BLOOM_DOWNSAMPLE_GLSL.match(/texture\(uSrc/g) ?? []).length;
    expect(taps).toBe(13);
    // Karis is a flag, because it must run on the FIRST downsample only —
    // applying it all the way down progressively dims the bloom.
    expect(BLOOM_DOWNSAMPLE_GLSL).toContain('uKaris');
    expect(BLOOM_DOWNSAMPLE_GLSL).toContain('1.0 / (1.0 + lumaOf(');
  });

  it('keeps the Jimenez group weights', () => {
    expect(BLOOM_DOWNSAMPLE_GLSL).toContain('0.5');
    expect((BLOOM_DOWNSAMPLE_GLSL.match(/\* 0\.125/g) ?? []).length).toBe(4);
  });

  it('upsamples with a 9-tap tent summing to one', () => {
    const weights = [...BLOOM_UPSAMPLE_GLSL.matchAll(/\.rgb \* ([\d.]+)/g)].map((m) => parseFloat(m[1]));
    // The centre tap has no explicit multiply in the source, it is `* 4.0`.
    expect(weights.length).toBeGreaterThanOrEqual(8);
    const total = weights.reduce((a, b) => a + b, 0) + (weights.length === 8 ? 4 : 0);
    expect(total).toBeCloseTo(16, 6);
    expect(BLOOM_UPSAMPLE_GLSL).toContain('1.0 / 16.0');
  });
});
