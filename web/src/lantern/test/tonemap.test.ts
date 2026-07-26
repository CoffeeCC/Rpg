// =========================================================================
// TONEMAPPING.
//
// Two things are on trial. First, that AgX was the right call over ACES for
// THIS game — a claim made from research and therefore owing a measurement
// (LIGHTING_PLAN §10). ACES is imported and run here for exactly that reason.
//
// Second, and less obviously, that the matrices are the right way round. The
// published AgX constants are GLSL `mat3` literals, which are COLUMN-major,
// and this file stores them row-major. Getting that wrong transposes the
// matrix, and a transposed AgX still looks like a plausible tonemap — it just
// stops mapping neutral to neutral, so every grey in the game picks up a
// colour cast. It shipped in the first draft of tonemap.ts and was caught by
// printing `agx(1,1,1)`, not by reading the code. Hence `neutral stays
// neutral` below, which is the cheapest possible guard against it returning.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  AGX_GLSL,
  AGX_INSET,
  AGX_MAX_EV,
  AGX_MIN_EV,
  AGX_OUTSET,
  acesNarkowicz,
  agx,
  hue,
  saturation,
  type RGB,
} from '../passes/tonemap';

/** A lantern flame, linear scene-referred. This is the game's signature colour. */
const LANTERN: RGB = [1.0, 0.45, 0.12];
const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

describe('the matrices are the right way round', () => {
  /**
   * A colour transform that preserves neutrals has rows summing to exactly 1 —
   * that IS the statement "grey in, grey out". Transposed, these sum to
   * 0.927 / 1.035 / 1.037, which is a pink cast on every grey surface.
   */
  it('has row sums of 1, which is what makes grey stay grey', () => {
    for (const m of [AGX_INSET, AGX_OUTSET]) {
      for (let r = 0; r < 3; r++) {
        const sum = m[r * 3] + m[r * 3 + 1] + m[r * 3 + 2];
        expect(sum).toBeCloseTo(1, 3);
      }
    }
  });

  it('inset and outset are inverses', () => {
    // Whatever the inset does before the curve, the outset must undo after it.
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        let v = 0;
        for (let k = 0; k < 3; k++) v += AGX_INSET[r * 3 + k] * AGX_OUTSET[k * 3 + c];
        expect(v).toBeCloseTo(r === c ? 1 : 0, 3);
      }
    }
  });

  it('neutral stays neutral — the transpose bug, as a test', () => {
    // THE REPRO. Transposed, this returned (0.845, 0.758, 0.757): white
    // rendered pink. Nothing crashed and the image still looked like a
    // tonemap, which is exactly why it needed measuring rather than reading.
    for (const grey of [0.05, 0.18, 0.5, 1, 4, 100]) {
      const out = agx([grey, grey, grey]);
      expect(Math.abs(out[0] - out[1]), `grey ${grey} -> ${out}`).toBeLessThan(0.002);
      expect(Math.abs(out[1] - out[2]), `grey ${grey} -> ${out}`).toBeLessThan(0.002);
      expect(saturation(out)).toBeLessThan(0.005);
    }
  });
});

describe('it behaves like a display transform', () => {
  it('sends 18% middle grey to about 50% display', () => {
    // The one number every tonemap is judged by. Scene-referred middle grey is
    // 0.18; a display transform puts it near the middle of the output range.
    expect(agx([0.18, 0.18, 0.18])[0]).toBeCloseTo(0.5, 1);
  });

  it('maps black to black and never quite reaches white', () => {
    expect(agx([0, 0, 0])).toEqual([0, 0, 0]);
    const bright = agx([100, 100, 100])[0];
    expect(bright).toBeGreaterThan(0.95);
    expect(bright).toBeLessThanOrEqual(1);
  });

  it('is monotonic — more light is never less bright', () => {
    // A non-monotonic curve produces banding that looks like a shading bug and
    // gets debugged for hours in the wrong file.
    let prev = -1;
    for (let ev = -14; ev <= 8; ev += 0.1) {
      const v = agx([2 ** ev, 2 ** ev, 2 ** ev])[0];
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });

  it('survives the values a real HDR frame contains', () => {
    for (const c of [
      [0, 0, 0],
      [1e-8, 0, 1e-9],
      [1e6, 1e6, 1e6],
      [-1, -1, -1], // negatives happen after a filter kernel with a negative lobe
      [1000, 0.001, 0],
    ] as RGB[]) {
      const out = agx(c);
      for (const v of out) {
        expect(Number.isFinite(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('desaturates highlights toward white, the way film does', () => {
    // AgX's signature, and the reason a bright flame gets a white-hot core
    // instead of a flat orange disc.
    let prev = 1;
    for (const ev of [0, 1, 2, 3, 4]) {
      const s = saturation(agx(scale(LANTERN, 2 ** ev)));
      expect(s).toBeLessThan(prev);
      prev = s;
    }
  });
});

/**
 * WHY NOT ACES.
 *
 * ACES is the default in most engines and would have been the lazy pick. On a
 * dark game lit by a warm lantern it is the wrong one, because the pixels it
 * handles worst are the pixels this game is made of.
 *
 * Hue is only meaningful while a colour is still saturated enough to have one,
 * so these compare over 0..+4 EV. Past that both are close to white and the
 * hue angle is numerical noise.
 */
describe('AgX holds the lantern colour where ACES does not', () => {
  const baseHue = hue(LANTERN);

  it('starts from a genuinely orange colour', () => {
    // Guard the fixture: if LANTERN is edited to something yellow the tests
    // below would pass while measuring nothing.
    expect(baseHue).toBeGreaterThan(15);
    expect(baseHue).toBeLessThan(35);
    expect(saturation(LANTERN)).toBeGreaterThan(0.8);
  });

  it('ACES walks the flame all the way to pure yellow — the repro', () => {
    // Measured: 39.2°, 45.5°, 48.4°, 50.3°, 59.9° across 0..+4 EV, from a base
    // of 22.5°. At +5 EV it reaches exactly 60.0°, which is pure yellow, and
    // then goes white. That is a warm lantern rendering as a sodium lamp.
    const drift = (ev: number) => hue(acesNarkowicz(scale(LANTERN, 2 ** ev))) - baseHue;
    expect(drift(0)).toBeGreaterThan(14);
    expect(drift(4)).toBeGreaterThan(35);
    expect(hue(acesNarkowicz(scale(LANTERN, 2 ** 5)))).toBeCloseTo(60, 0);
  });

  it('AgX drifts materially less at every exposure that matters', () => {
    for (const ev of [0, 1, 2, 3, 4]) {
      const lit = scale(LANTERN, 2 ** ev);
      const dAgx = Math.abs(hue(agx(lit)) - baseHue);
      const dAces = Math.abs(hue(acesNarkowicz(lit)) - baseHue);
      expect(dAgx, `at +${ev}EV agx ${dAgx.toFixed(1)} vs aces ${dAces.toFixed(1)}`).toBeLessThan(dAces);
      // And in absolute terms it stays inside a band that still reads orange.
      expect(dAgx).toBeLessThan(25);
    }
  });

  it('and degrades far more slowly on a deep red', () => {
    // Fire damage, an ember, a boss's eyes. ACES is actually the closer of the
    // two at base exposure here — it is the RATE that separates them, so this
    // measures the slope rather than any single point.
    const red: RGB = [1.0, 0.08, 0.03];
    const h0 = hue(red);
    const rise = (f: (c: RGB) => RGB) =>
      Math.abs(hue(f(scale(red, 16))) - h0) - Math.abs(hue(f(red)) - h0);
    expect(rise(agx)).toBeLessThan(rise(acesNarkowicz) / 2);
  });
});

describe('the shader and the TypeScript cannot drift apart', () => {
  it('generates the GLSL from the same constants the tests measured', () => {
    // A hand-copied second set of numbers in a template string stays correct
    // exactly until somebody tunes one of them.
    expect(AGX_GLSL).toContain(String(AGX_MIN_EV));
    expect(AGX_GLSL).toContain(String(AGX_MAX_EV));
    for (const m of [AGX_INSET, AGX_OUTSET]) {
      for (const v of m) expect(AGX_GLSL).toContain(v.toFixed(15));
    }
  });

  it('emits column-major mat3 literals, which is what GLSL reads', () => {
    // The other half of the transpose trap: the constants are row-major in TS
    // and must come out transposed in the shader. Check the first column of
    // the inset is the first ROW of the stored matrix.
    const first = AGX_GLSL.slice(AGX_GLSL.indexOf('AGX_INSET = mat3(') + 17);
    const nums = first.slice(0, first.indexOf(')')).split(',').map((s) => parseFloat(s));
    expect(nums[0]).toBeCloseTo(AGX_INSET[0], 12);
    expect(nums[1]).toBeCloseTo(AGX_INSET[3], 12);
    expect(nums[2]).toBeCloseTo(AGX_INSET[6], 12);
  });

  it('declares agx() so a shader can just include it', () => {
    expect(AGX_GLSL).toContain('vec3 agx(vec3 col)');
    expect(AGX_GLSL).toContain('agxContrast');
  });
});
