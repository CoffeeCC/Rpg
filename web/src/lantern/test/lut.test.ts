// =========================================================================
// THE 3D-LUT SLOT.
//
// Per LIGHTING_PLAN §10: prefer tests that reject the old/naive behaviour.
// The naive LUT coordinate mapping — sample AT the value, not at the
// texel's centre — is computed explicitly and shown to band an identity
// LUT that should be a lossless round-trip.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  LUT_SIZE,
  identityLutData,
  lutCoord,
  lutCoordNaive,
  lutGlsl,
  sampleLutTrilinear,
  type RGB,
} from '../gl/lut';

describe('identity LUT data', () => {
  it('stores black at the origin texel and white at the far corner', () => {
    const data = identityLutData(LUT_SIZE);
    expect([data[0], data[1], data[2], data[3]]).toEqual([0, 0, 0, 255]);
    const lastTexel = (LUT_SIZE * LUT_SIZE * LUT_SIZE - 1) * 4;
    expect([data[lastTexel], data[lastTexel + 1], data[lastTexel + 2]]).toEqual([255, 255, 255]);
  });

  it('x (red) is the fastest-varying axis, matching texSubImage3D layout', () => {
    const data = identityLutData(LUT_SIZE);
    // Texel (1,0,0) sits 4 bytes after texel (0,0,0).
    expect(data[4]).toBeGreaterThan(0); // red channel of texel x=1
    expect(data[5]).toBe(0); // green still 0
    expect(data[6]).toBe(0); // blue still 0
    // Texel (0,1,0) sits `size` texels (size*4 bytes) after the origin.
    const yOffset = LUT_SIZE * 4;
    expect(data[yOffset]).toBe(0); // red back to 0
    expect(data[yOffset + 1]).toBeGreaterThan(0); // green channel of texel y=1
  });
});

describe('REPRO: sampling without a half-texel offset bands an identity LUT', () => {
  const data = identityLutData(LUT_SIZE);
  const probe: RGB[] = [
    [0.0, 0.0, 0.0],
    [0.12, 0.5, 0.83],
    [0.5, 0.5, 0.5],
    [0.99, 0.02, 0.4],
    [1.0, 1.0, 1.0],
  ];

  it('the correct coordinate mapping round-trips an identity LUT losslessly', () => {
    for (const c of probe) {
      const out = sampleLutTrilinear(data, LUT_SIZE, c, lutCoord);
      for (let ch = 0; ch < 3; ch++) {
        // 8-bit quantisation is the only error source left.
        expect(Math.abs(out[ch] - c[ch])).toBeLessThan(1 / 255 + 1e-6);
      }
    }
  });

  it('the naive mapping (no texel-centre offset) measurably drifts', () => {
    let worst = 0;
    for (const c of probe) {
      const out = sampleLutTrilinear(data, LUT_SIZE, c, lutCoordNaive);
      for (let ch = 0; ch < 3; ch++) worst = Math.max(worst, Math.abs(out[ch] - c[ch]));
    }
    // The repro: a naive 33-wide LUT biases by roughly half a texel width,
    // ~1/66 ≈ 0.015 — an order of magnitude past 8-bit quantisation noise.
    expect(worst).toBeGreaterThan(0.008);
  });
});

describe('lutCoord', () => {
  it('lands exactly on each texel centre', () => {
    for (let i = 0; i < LUT_SIZE; i++) {
      const v = i / (LUT_SIZE - 1);
      const expected = (i + 0.5) / LUT_SIZE;
      expect(lutCoord(v, LUT_SIZE)).toBeCloseTo(expected, 12);
    }
  });

  it('clamps outside [0,1]', () => {
    expect(lutCoord(-0.5, LUT_SIZE)).toBe(lutCoord(0, LUT_SIZE));
    expect(lutCoord(1.5, LUT_SIZE)).toBe(lutCoord(1, LUT_SIZE));
  });
});

describe('the GLSL', () => {
  it('bakes the same scale/offset lutCoord uses, not a second hand-copied pair', () => {
    const glsl = lutGlsl(LUT_SIZE);
    const scale = (LUT_SIZE - 1) / LUT_SIZE;
    const offset = 0.5 / LUT_SIZE;
    expect(glsl).toContain(`${scale}`);
    expect(glsl).toContain(`${offset}`);
  });

  it('mixes toward identity at uLutMix = 0, so the slot is free until a grade loads', () => {
    const glsl = lutGlsl(LUT_SIZE);
    expect(glsl).toContain('mix(c, graded, uLutMix)');
  });

  it('declares a sampler3D, not the old 2D strip-atlas trick', () => {
    expect(lutGlsl(LUT_SIZE)).toContain('uniform sampler3D uLut');
  });
});
