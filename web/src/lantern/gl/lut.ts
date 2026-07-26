// =========================================================================
// THE 3D-LUT SLOT — grading, wired in before there is a grade to load.
//
// ENGINE_PLAN §9.6: "one 33^3 3D texture, applied post-tonemap... Bake AgX
// and the grade into a single LUT; stacking two double-quantises and bands
// the darks." M1 does not ship a grade — that is M8 — but the SLOT lands
// now, at `uLutMix = 0`, so the composite pass never has to be restructured
// to add one later. WebGL2 has native `sampler3D`; this is deliberately not
// the old 2D strip-atlas trick some engines still carry from WebGL1.
//
// The scale/offset math below is the one place a LUT implementation is
// usually wrong: sampling AT THE TEXEL VALUE rather than at the texel's
// CENTRE biases every result toward the low edge by half a texel, and on a
// 33-wide LUT that is a visible banding error, not a rounding footnote.
// `lutCoord` is the fix, and it is shared between the GLSL (generated from
// it, `tonemap.ts`'s `AGX_GLSL` pattern) and the pure TS sampler the test
// suite uses to prove the round-trip — one formula, not two copies that can
// drift apart.
// =========================================================================

export type RGB = [number, number, number];

/** Standard for film-style grading LUTs; matches what most DCC tools export. */
export const LUT_SIZE = 33;

/**
 * A colour value in [0,1] to a 1D texture coordinate on a `size`-wide axis,
 * centred on the texel rather than its edge.
 *
 * Texel `i` of `size` occupies `[i/size, (i+1)/size)` and its centre is at
 * `(i+0.5)/size`. An identity LUT stores texel `i` = colour `i/(size-1)`, so
 * sampling that colour back must land exactly on texel `i`'s centre:
 * `((v*(size-1)) + 0.5) / size`.
 */
export function lutCoord(value: number, size: number = LUT_SIZE): number {
  const v = Math.min(1, Math.max(0, value));
  return (v * (size - 1) + 0.5) / size;
}

/**
 * The wrong version — samples at the raw value, no half-texel centring.
 * `size` is unused on purpose: that omission IS the bug. Kept only so the
 * test can reject it.
 */
export function lutCoordNaive(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Identity LUT data: texel (r,g,b) stores colour (r,g,b)/(size-1).
 *
 * Byte order matches what `texSubImage3D` expects for a `TEXTURE_3D`: x
 * (width, red) fastest-varying, then y (height, green), then z (depth,
 * blue) — the same raster order `createTarget`'s 2D textures use, one
 * dimension up.
 */
export function identityLutData(size: number = LUT_SIZE): Uint8Array {
  const data = new Uint8Array(size * size * size * 4);
  let o = 0;
  for (let b = 0; b < size; b++) {
    for (let g = 0; g < size; g++) {
      for (let r = 0; r < size; r++) {
        data[o++] = Math.round((r / (size - 1)) * 255);
        data[o++] = Math.round((g / (size - 1)) * 255);
        data[o++] = Math.round((b / (size - 1)) * 255);
        data[o++] = 255;
      }
    }
  }
  return data;
}

function texelAt(data: Uint8Array, size: number, x: number, y: number, z: number): RGB {
  const xi = Math.min(size - 1, Math.max(0, x));
  const yi = Math.min(size - 1, Math.max(0, y));
  const zi = Math.min(size - 1, Math.max(0, z));
  const o = ((zi * size + yi) * size + xi) * 4;
  return [data[o] / 255, data[o + 1] / 255, data[o + 2] / 255];
}

/**
 * CPU trilinear sample, matching what `LUT_GLSL`'s `texture(uLut, ...)` does
 * on the GPU with `LINEAR` filtering. Exists so the coordinate math can be
 * measured without a driver — see `test/lut.test.ts`.
 */
export function sampleLutTrilinear(data: Uint8Array, size: number, color: RGB, coord = lutCoord): RGB {
  const cx = coord(color[0], size) * size - 0.5;
  const cy = coord(color[1], size) * size - 0.5;
  const cz = coord(color[2], size) * size - 0.5;
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const z0 = Math.floor(cz);
  const fx = cx - x0;
  const fy = cy - y0;
  const fz = cz - z0;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const out: RGB = [0, 0, 0];
  for (let ch = 0; ch < 3; ch++) {
    const s = (dx: number, dy: number, dz: number) => texelAt(data, size, x0 + dx, y0 + dy, z0 + dz)[ch];
    const c00 = lerp(s(0, 0, 0), s(1, 0, 0), fx);
    const c10 = lerp(s(0, 1, 0), s(1, 1, 0), fx);
    const c01 = lerp(s(0, 0, 1), s(1, 0, 1), fx);
    const c11 = lerp(s(0, 1, 1), s(1, 1, 1), fx);
    const c0 = lerp(c00, c10, fy);
    const c1 = lerp(c01, c11, fy);
    out[ch] = lerp(c0, c1, fz);
  }
  return out;
}

/**
 * AgX/grade sampling as GLSL, generated from `lutCoord` so the shader and the
 * tested TS formula cannot drift apart the way two hand-copied versions
 * eventually would.
 *
 * `uLutMix` is the whole reason this can ship in M1 with nothing to show for
 * it: at 0 the sample is computed and thrown away by the `mix`, so the slot
 * costs one texture fetch and changes no pixel, and turning on a grade later
 * is a uniform, not a shader rewrite.
 */
export function lutGlsl(size: number = LUT_SIZE): string {
  const scale = (size - 1) / size;
  const offset = 0.5 / size;
  return `
precision highp sampler3D;
uniform sampler3D uLut;
uniform float uLutMix;
const float LUT_SCALE = ${scale};
const float LUT_OFFSET = ${offset};

vec3 applyLut(vec3 c) {
  vec3 uvw = clamp(c, 0.0, 1.0) * LUT_SCALE + LUT_OFFSET;
  vec3 graded = texture(uLut, uvw).rgb;
  return mix(c, graded, uLutMix);
}
`;
}

/** Upload arbitrary `size^3` RGBA8 data as a sampleable `TEXTURE_3D`. */
export function createLutTexture3D(gl: WebGL2RenderingContext, data: Uint8Array, size: number = LUT_SIZE): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('[lantern] could not create LUT texture');
  gl.bindTexture(gl.TEXTURE_3D, tex);
  gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RGBA8, size, size, size);
  gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, 0, size, size, size, gl.RGBA, gl.UNSIGNED_BYTE, data);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_3D, null);
  return tex;
}

/** The slot's default occupant: grades nothing, changes nothing, proves the plumbing. */
export function createIdentityLut(gl: WebGL2RenderingContext, size: number = LUT_SIZE): WebGLTexture {
  return createLutTexture3D(gl, identityLutData(size), size);
}
