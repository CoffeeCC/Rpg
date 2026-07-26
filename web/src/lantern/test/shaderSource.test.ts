// =========================================================================
// SHADER SOURCE HYGIENE.
//
// Every shader in this engine is a TypeScript template literal, which means
// a backtick anywhere inside one — including inside a comment — silently ends
// the string. It has happened three times: twice in `renderer.ts` and once in
// `lighting.ts`, always while writing a comment that referred to a uniform by
// name in `backticks`, which is the natural way to write prose about code.
//
// The compiler does catch it, eventually, as a cascade of baffling errors
// ("Module declaration names may only use quoted strings") pointing at a line
// several statements away from the real one. This catches it immediately and
// says what it actually is.
//
// The other failure this guards is GLSL redefinition: shared snippets declare
// their own uniforms, so a shader that includes one and also declares the
// same uniform fails to compile at RUNTIME, on the first frame that needs the
// program — GLSL is not typechecked by the build.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { LIT_SPRITE_FRAG, LIT_SPRITE_VERT, SHADOW_GLSL } from '../passes/lighting';
import { BLOOM_DOWNSAMPLE_GLSL, BLOOM_UPSAMPLE_GLSL } from '../passes/bloom';
import { AGX_GLSL } from '../passes/tonemap';
import { FULLSCREEN_VERT } from '../gl/program';
import { SPRITE_FRAG, SPRITE_VERT } from '../gl/spriteBatcher';
import { lutGlsl } from '../gl/lut';

const SOURCES: Record<string, string> = {
  LIT_SPRITE_FRAG,
  LIT_SPRITE_VERT,
  SHADOW_GLSL,
  BLOOM_DOWNSAMPLE_GLSL,
  BLOOM_UPSAMPLE_GLSL,
  AGX_GLSL,
  FULLSCREEN_VERT,
  SPRITE_FRAG,
  SPRITE_VERT,
  LUT_GLSL: lutGlsl(),
};

describe('every shader source survived being a template literal', () => {
  it('contains no backticks', () => {
    // If this fails, the source was truncated at the backtick and everything
    // after it became TypeScript. Rewrite the comment without backticks.
    for (const [name, src] of Object.entries(SOURCES)) {
      expect(src.includes('`'), `${name} contains a backtick`).toBe(false);
    }
  });

  it('is non-empty and looks like GLSL', () => {
    // A truncated template can still be a valid, useless string.
    for (const [name, src] of Object.entries(SOURCES)) {
      expect(src.length, `${name} is suspiciously short`).toBeGreaterThan(40);
      expect(/\bvec[234]\b|\bfloat\b|\bvoid main\b/.test(src), `${name} has no GLSL in it`).toBe(true);
    }
  });

  it('declares #version on the first line where it is a whole program', () => {
    // Snippets are includes and must NOT carry one; whole programs must, and
    // it must be first — GLSL ES requires it before anything but comments.
    for (const name of ['LIT_SPRITE_FRAG', 'LIT_SPRITE_VERT', 'FULLSCREEN_VERT', 'SPRITE_FRAG', 'SPRITE_VERT']) {
      expect(SOURCES[name].startsWith('#version 300 es'), `${name} must open with #version`).toBe(true);
    }
    for (const name of ['SHADOW_GLSL', 'BLOOM_DOWNSAMPLE_GLSL', 'BLOOM_UPSAMPLE_GLSL', 'AGX_GLSL', 'LUT_GLSL']) {
      expect(SOURCES[name].includes('#version'), `${name} is an include and must not carry #version`).toBe(false);
    }
  });
});

describe('composed shaders declare each uniform exactly once', () => {
  /** Uniform names declared at the top level of a source. */
  function uniformsOf(src: string): string[] {
    const names: string[] = [];
    for (const m of src.matchAll(/^\s*uniform\s+\w+\s+([^;]+);/gm)) {
      for (const part of m[1].split(',')) {
        const name = part.trim().split(/[[\s]/)[0];
        if (name) names.push(name);
      }
    }
    return names;
  }

  it('does not redeclare a uniform the included snippet already provides', () => {
    // THE REPRO, as it actually happened: the lit fragment shader includes
    // SHADOW_GLSL, which declares uOccupancy and uGridSize. Declaring either
    // again in the outer shader is a GLSL redefinition error that the build
    // cannot see, and it fails on the first frame that needs the program.
    const outer = uniformsOf(LIT_SPRITE_FRAG.replace(SHADOW_GLSL, ''));
    const included = uniformsOf(SHADOW_GLSL);
    const clash = outer.filter((u) => included.includes(u));
    expect(clash, `redeclared: ${clash.join(', ')}`).toEqual([]);
  });

  it('the lit shader really does include the shadow snippet', () => {
    // Guards the test above from passing vacuously if the include is dropped.
    expect(LIT_SPRITE_FRAG).toContain(SHADOW_GLSL);
    expect(uniformsOf(SHADOW_GLSL).length).toBeGreaterThan(0);
  });
});

describe('the lit shader and the vertex format agree', () => {
  it('reads every attribute the batcher supplies', () => {
    // A mismatch here is silent: the attribute is simply never read and the
    // lighting is computed against zeroed board coordinates, which looks like
    // "the light is stuck at the origin".
    for (const loc of [0, 1, 2, 3]) {
      expect(LIT_SPRITE_VERT, `missing attribute location ${loc}`).toContain(`layout(location = ${loc})`);
    }
  });

  it('passes board position and the upright flag through to the fragment stage', () => {
    expect(LIT_SPRITE_VERT).toContain('out vec2 vWorld');
    expect(LIT_SPRITE_VERT).toContain('flat out float vUpright');
    expect(LIT_SPRITE_FRAG).toContain('in vec2 vWorld');
    expect(LIT_SPRITE_FRAG).toContain('flat in float vUpright');
  });
});
