// =========================================================================
// PROCEDURAL TEXTURES — pixels made by arithmetic, uploaded to the GPU.
//
// The board-game furniture (ENGINE_PLAN §1.2) needs surfaces there is no art
// file for: the wood of the table, the shadow under a piece, the bevel on a
// plinth. Generating them costs nothing, keeps the harness self-contained,
// and — the part that actually matters — keeps them DETERMINISTIC, so a
// change to a falloff shows up as a changed test rather than as a changed
// screenshot somebody has to remember.
//
// The split follows the rule the rest of `lantern/` keeps: the GENERATORS are
// pure functions over `Uint8Array` living beside the data model they serve
// (`scene/piece.ts`, `scene/board.ts`), and this file is the only place that
// knows about `gl`. That is what makes the falloff law testable in vitest
// with no graphics context anywhere near it.
// =========================================================================

export interface UploadOptions {
  /**
   * Treat RGB as sRGB and let the hardware decode to linear.
   *
   * ON for anything authored as a COLOUR, because the whole pipeline past the
   * sampler is linear-light and feeding it gamma-encoded values makes every
   * midtone too bright. OFF for normal maps and masks, which are numbers that
   * merely happen to be stored in a colour texture — sRGB-decoding a normal
   * map bends every vector toward +z and quietly flattens the surface.
   */
  srgb?: boolean;
  /** Bilinear. Off (NEAREST) for anything that must not be interpolated. */
  smooth?: boolean;
  /** CLAMP_TO_EDGE by default; REPEAT for a surface that tiles. */
  repeat?: boolean;
  mipmap?: boolean;
}

/**
 * Upload an RGBA8 buffer as a square texture.
 *
 * `pixels.length` must be `size * size * 4`. Checked rather than trusted: a
 * mismatched buffer does not fail at upload, it fails as a garbled or
 * offset-by-one-row texture, which is a memorable afternoon.
 */
export function createRGBATexture(
  gl: WebGL2RenderingContext,
  size: number,
  pixels: Uint8Array,
  options: UploadOptions = {},
): WebGLTexture {
  const expected = size * size * 4;
  if (pixels.length !== expected) {
    throw new Error(`[lantern] procedural texture is ${pixels.length} bytes, expected ${expected} for ${size}x${size}`);
  }
  const tex = gl.createTexture();
  if (!tex) throw new Error('[lantern] could not create procedural texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // UNPACK_FLIP_Y stays OFF. Screen y and board y both run downward here
  // (see camera.project), so row 0 of the buffer is the far edge of the quad
  // — which is what `baseDiscNormalPixels` assumes when it maps texture +v to
  // board +y. Flipping would invert every generated normal's green channel.
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    options.srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8,
    size,
    size,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    pixels,
  );
  const wrap = options.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  const mag = options.smooth === false ? gl.NEAREST : gl.LINEAR;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, mag);
  if (options.mipmap) {
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  } else {
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mag);
  }
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}
