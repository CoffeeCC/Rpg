// =========================================================================
// PROGRAMS.
//
// The GL calls need a real driver, so what is tested here is the part that
// does not: the fullscreen triangle's geometry, the define injection (which
// has one specific way of being wrong that produces a baffling error), and
// the error excerpt that exists so a shader failure is readable at all.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { FULLSCREEN_VERT, withDefines } from '../gl/program';

describe('the fullscreen triangle', () => {
  /** The vertex shader's arithmetic, evaluated on the CPU. */
  function vertex(id: number) {
    const p = { x: (id << 1) & 2, y: id & 2 };
    return { uv: p, clip: { x: p.x * 2 - 1, y: p.y * 2 - 1 } };
  }

  it('covers the whole viewport with one triangle', () => {
    const v = [0, 1, 2].map(vertex);
    // Clip space is [-1,1] on both axes. The triangle must contain all four
    // corners of it, or the pass leaves part of the screen unwritten — which
    // on a darkness layer is a bright wedge, not a missing effect.
    const inside = (px: number, py: number) => {
      const [a, b, c] = v.map((x) => x.clip);
      const sign = (p2: typeof a, p3: typeof a) => (px - p3.x) * (p2.y - p3.y) - (p2.x - p3.x) * (py - p3.y);
      const d1 = sign(b, c);
      const d2 = (px - a.x) * (c.y - a.y) - (c.x - a.x) * (py - a.y);
      const d3 = (px - b.x) * (a.y - b.y) - (a.x - b.x) * (py - b.y);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      return !(neg && pos);
    };
    for (const [x, y] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
      [0, 0],
      [0.999, 0.999],
    ]) {
      expect(inside(x, y), `clip (${x}, ${y}) must be covered`).toBe(true);
    }
  });

  it('maps uv 0..1 across that viewport', () => {
    const v = [0, 1, 2].map(vertex);
    // uv and clip must stay in lockstep: uv = clip * 0.5 + 0.5.
    for (const { uv, clip } of v) {
      expect(uv.x).toBeCloseTo(clip.x * 0.5 + 0.5, 9);
      expect(uv.y).toBeCloseTo(clip.y * 0.5 + 0.5, 9);
    }
  });

  it('has no interior edge to seam along', () => {
    // The reason this is a triangle and not a quad. Two triangles sharing a
    // diagonal interpolate separately along it, which shows as a faint hairline
    // through the middle of any pass doing something non-linear per pixel —
    // and a tonemap and a bloom threshold both qualify.
    expect(FULLSCREEN_VERT).toContain('gl_VertexID');
    expect(FULLSCREEN_VERT).not.toContain('in vec2');
  });

  it('declares GLSL ES 3.00 on the very first line', () => {
    expect(FULLSCREEN_VERT.startsWith('#version 300 es')).toBe(true);
  });
});

describe('shader defines', () => {
  const SRC = '#version 300 es\nprecision highp float;\nvoid main() {}';

  it('keeps #version first — the trap', () => {
    // GLSL ES requires #version to precede everything but comments. A define
    // block pushed above it fails with an error blaming the version directive,
    // which sends you looking in entirely the wrong place.
    const out = withDefines(SRC, { QUALITY: 2 });
    expect(out.startsWith('#version 300 es\n')).toBe(true);
    expect(out.split('\n')[1]).toBe('#define QUALITY 2');
  });

  it('emits bare defines for true and omits them for false', () => {
    const out = withDefines(SRC, { USE_KARIS: true, BILINEAR_FIX: false });
    expect(out).toContain('#define USE_KARIS\n');
    expect(out).not.toContain('BILINEAR_FIX');
  });

  it('returns the source untouched when there is nothing to define', () => {
    expect(withDefines(SRC, {})).toBe(SRC);
  });

  it('produces different text for different variants, so the cache splits them', () => {
    // ProgramCache keys on source text, so two variants must not collide.
    expect(withDefines(SRC, { N: 4 })).not.toBe(withDefines(SRC, { N: 16 }));
  });

  it('still works on a source with no version directive', () => {
    const out = withDefines('void main() {}', { A: 1 });
    expect(out.startsWith('#define A 1\n')).toBe(true);
  });
});
