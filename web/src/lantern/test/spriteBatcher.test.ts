// =========================================================================
// SPRITE BATCHER SHADERS.
//
// The GL-owning half of the batcher needs a real driver (see `program.test.ts`
// for why that class of test is not attempted here). What is checked is the
// contract the vertex layout in `spriteBatcher.ts` and the packing in
// `scene/sprite.ts` both depend on staying in sync.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { SPRITE_FRAG, SPRITE_VERT } from '../gl/spriteBatcher';

describe('the sprite vertex shader matches the packed buffer layout', () => {
  it('declares three attributes at the locations SpriteBatcher binds', () => {
    expect(SPRITE_VERT).toContain('layout(location = 0) in vec2 aPos');
    expect(SPRITE_VERT).toContain('layout(location = 1) in vec2 aUV');
    expect(SPRITE_VERT).toContain('layout(location = 2) in vec4 aTint');
  });

  it('flips y once, to go from screen-space-down to clip-space-up', () => {
    // camera.project() and buildVertexData() both work in screen px with y
    // DOWN. NDC is y UP. Exactly one sign flip must exist, on y only.
    expect(SPRITE_VERT).toContain('-ndc.y');
    expect(SPRITE_VERT).not.toContain('-ndc.x');
  });

  it('declares the viewport uniform the caller is required to set', () => {
    expect(SPRITE_VERT).toContain('uniform vec2 uViewport');
  });
});

describe('the sprite fragment shader', () => {
  it('multiplies the sampled texel by the tint, not something wired to a constant', () => {
    expect(SPRITE_FRAG).toContain('texture(uAtlas, vUV) * vTint');
  });

  it('declares GLSL ES 3.00 first', () => {
    expect(SPRITE_FRAG.startsWith('#version 300 es')).toBe(true);
    expect(SPRITE_VERT.startsWith('#version 300 es')).toBe(true);
  });
});
