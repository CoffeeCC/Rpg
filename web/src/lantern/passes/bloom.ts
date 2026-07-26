// =========================================================================
// BLOOM — light spilling in the air, and in the eye.
//
// A dark scene lit by small warm emitters is the WORST case for bloom, which
// is unfortunate because it is the only case this game has. Two specific
// things go wrong and both have a named fix (ENGINE_PLAN §9.6):
//
//   FIREFLIES   one very bright texel against near-black survives every
//               downsample and scintillates as the camera moves, because a
//               naive box average is dominated by its largest input. This is
//               what makes cheap bloom look like sensor noise.
//               Fix: the Karis average, on the first downsample only.
//
//   ONSET LINE  a hard bright-pass threshold means an object brightening
//               through it acquires a glow ALL AT ONCE, and on a gradient you
//               see the threshold as a visible contour crawling across the
//               image. Fix: a soft knee.
//
// Mip chain (Jimenez) rather than dual-filter (Bjorge), because the wide
// radius is the point here — lantern haze filling the frame — and the
// progressive upsample-and-accumulate gives a multi-scale falloff that reads
// as atmosphere rather than as a glow sticker. Dual-filter's advantage is
// bandwidth on mobile, which is a constraint this game does not have.
// =========================================================================

/**
 * The smallest mip worth making.
 *
 * Below about this the level holds almost no spatial information and each one
 * still costs a full pass plus a target. The widest useful blur comes from
 * REACHING a small level, not from grinding down to 1x1.
 */
export const MIN_MIP = 8;

export interface MipSize {
  width: number;
  height: number;
}

/**
 * The chain of half-resolution steps, largest first.
 *
 * Stops at whichever comes first: the requested step count, or a level that
 * would fall below `MIN_MIP` on either axis. The floor matters more than it
 * looks — an ultrawide hits it on height while the width still has levels
 * left, and continuing would produce degenerate 1-texel-tall targets whose
 * bilinear upsample smears horizontally into a visible band.
 */
export function mipChain(width: number, height: number, steps: number): MipSize[] {
  const out: MipSize[] = [];
  let w = width;
  let h = height;
  for (let i = 0; i < steps; i++) {
    w = Math.floor(w / 2);
    h = Math.floor(h / 2);
    if (w < MIN_MIP || h < MIN_MIP) break;
    out.push({ width: w, height: h });
  }
  return out;
}

/**
 * Relative luminance, Rec. 709.
 *
 * Perceptual weights rather than a flat mean: green carries most of what the
 * eye reads as brightness, so a flat average would let a saturated blue texel
 * claim a brightness it does not have and bloom it.
 */
export function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Karis weight — `1 / (1 + luma)`.
 *
 * The whole anti-firefly mechanism, and it is one division. A texel a hundred
 * times brighter than its neighbours gets a hundredth of the weight, so it
 * contributes to the average roughly as much as they do instead of drowning
 * them. Applied ONLY on the first downsample: after that the extreme values
 * are already averaged away, and continuing to weight would progressively
 * dim the bloom, which is a different bug that looks like the effect not
 * working.
 */
export function karisWeight(r: number, g: number, b: number): number {
  return 1 / (1 + luma(r, g, b));
}

export type RGB = [number, number, number];

/** Plain mean — what a naive downsample does, kept so the test can reject it. */
export function boxAverage(taps: RGB[]): RGB {
  const n = taps.length || 1;
  const t = taps.reduce((a, c) => [a[0] + c[0], a[1] + c[1], a[2] + c[2]] as RGB, [0, 0, 0] as RGB);
  return [t[0] / n, t[1] / n, t[2] / n];
}

/** Luma-weighted mean. Same taps, and a firefly no longer owns the result. */
export function karisAverage(taps: RGB[]): RGB {
  let wsum = 0;
  const acc: RGB = [0, 0, 0];
  for (const c of taps) {
    const w = karisWeight(c[0], c[1], c[2]);
    acc[0] += c[0] * w;
    acc[1] += c[1] * w;
    acc[2] += c[2] * w;
    wsum += w;
  }
  if (wsum <= 0) return [0, 0, 0];
  return [acc[0] / wsum, acc[1] / wsum, acc[2] / wsum];
}

/**
 * How much of a colour enters the bloom, with a soft knee.
 *
 * Returns a multiplier in [0,1]. `knee` is the width of the ramp in linear
 * units either side of the threshold; at `knee = 0` this degenerates to a hard
 * cut, which is what `hardThreshold` does and what the test rejects.
 *
 * The quadratic segment is chosen so the result is C1 continuous at both ends
 * of the ramp — value AND slope match. Matching only the value still leaves a
 * kink, and a kink in a threshold is exactly as visible as a step when it is
 * being crawled across a gradient by a moving light.
 */
export function softKnee(value: number, threshold: number, knee: number): number {
  if (knee <= 0) return value > threshold ? 1 : 0;
  const soft = Math.min(Math.max(value - threshold + knee, 0), 2 * knee);
  const quad = (soft * soft) / (4 * knee);
  const contribution = Math.max(quad, value - threshold);
  return value <= 1e-6 ? 0 : Math.min(1, Math.max(0, contribution / value));
}

/** The naive version. Not used to render; the test measures its onset step. */
export function hardThreshold(value: number, threshold: number): number {
  return value > threshold ? 1 : 0;
}

// -------------------------------------------------------------------------
// Shaders
// -------------------------------------------------------------------------

/**
 * Jimenez's 13-tap downsample.
 *
 * Not a box filter and not a Gaussian — a specific arrangement of four
 * overlapping 2x2 groups plus a centre group, weighted 0.125/0.125/0.125/
 * 0.125/0.5. The overlap is what removes the pulsing that a plain box
 * downsample produces when the source moves by a sub-texel amount, which on a
 * scene with a moving lantern is every single frame.
 */
export const BLOOM_DOWNSAMPLE_GLSL = `
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform int uKaris;      // 1 on the first downsample only
uniform float uThreshold;
uniform float uKnee;

float lumaOf(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 group(vec3 a, vec3 b, vec3 c, vec3 d, int karis) {
  if (karis == 1) {
    // Weight each tap by 1/(1+luma) so one firefly cannot own the average.
    float wa = 1.0 / (1.0 + lumaOf(a));
    float wb = 1.0 / (1.0 + lumaOf(b));
    float wc = 1.0 / (1.0 + lumaOf(c));
    float wd = 1.0 / (1.0 + lumaOf(d));
    return (a * wa + b * wb + c * wc + d * wd) / max(wa + wb + wc + wd, 1e-5);
  }
  return (a + b + c + d) * 0.25;
}

vec3 bloomDownsample(vec2 uv) {
  vec2 t = uTexel;
  vec3 a = texture(uSrc, uv + vec2(-2.0, 2.0) * t).rgb;
  vec3 b = texture(uSrc, uv + vec2( 0.0, 2.0) * t).rgb;
  vec3 c = texture(uSrc, uv + vec2( 2.0, 2.0) * t).rgb;
  vec3 d = texture(uSrc, uv + vec2(-2.0, 0.0) * t).rgb;
  vec3 e = texture(uSrc, uv                        ).rgb;
  vec3 f = texture(uSrc, uv + vec2( 2.0, 0.0) * t).rgb;
  vec3 g = texture(uSrc, uv + vec2(-2.0,-2.0) * t).rgb;
  vec3 h = texture(uSrc, uv + vec2( 0.0,-2.0) * t).rgb;
  vec3 i = texture(uSrc, uv + vec2( 2.0,-2.0) * t).rgb;
  vec3 j = texture(uSrc, uv + vec2(-1.0, 1.0) * t).rgb;
  vec3 k = texture(uSrc, uv + vec2( 1.0, 1.0) * t).rgb;
  vec3 l = texture(uSrc, uv + vec2(-1.0,-1.0) * t).rgb;
  vec3 m = texture(uSrc, uv + vec2( 1.0,-1.0) * t).rgb;

  vec3 sum = group(j, k, l, m, uKaris) * 0.5
           + group(a, b, d, e, uKaris) * 0.125
           + group(b, c, e, f, uKaris) * 0.125
           + group(d, e, g, h, uKaris) * 0.125
           + group(e, f, h, i, uKaris) * 0.125;
  return sum;
}

// Soft knee. Only meaningful on the first pass; later levels are already
// filtered and re-thresholding them would eat the wide, dim tail that is the
// entire point of a mip chain.
vec3 bloomPrefilter(vec3 c) {
  float lum = lumaOf(c);
  float soft = clamp(lum - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / max(4.0 * uKnee, 1e-4);
  float contribution = max(soft, lum - uThreshold) / max(lum, 1e-4);
  return c * clamp(contribution, 0.0, 1.0);
}
`;

/**
 * The 9-tap tent used on the way back up.
 *
 * Upsampling with plain bilinear leaves a boxy structure that shows as faint
 * rectangles in the haze; the tent softens the level before it is added to the
 * one above. Accumulating on the way up — rather than summing all levels at
 * the end — is what makes the falloff multi-scale, because each level is
 * blurred again by every step above it.
 */
export const BLOOM_UPSAMPLE_GLSL = `
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;

vec3 bloomUpsample(vec2 uv) {
  vec2 t = uTexel * uRadius;
  vec3 sum = vec3(0.0);
  sum += texture(uSrc, uv + vec2(-1.0,  1.0) * t).rgb * 1.0;
  sum += texture(uSrc, uv + vec2( 0.0,  1.0) * t).rgb * 2.0;
  sum += texture(uSrc, uv + vec2( 1.0,  1.0) * t).rgb * 1.0;
  sum += texture(uSrc, uv + vec2(-1.0,  0.0) * t).rgb * 2.0;
  sum += texture(uSrc, uv                       ).rgb * 4.0;
  sum += texture(uSrc, uv + vec2( 1.0,  0.0) * t).rgb * 2.0;
  sum += texture(uSrc, uv + vec2(-1.0, -1.0) * t).rgb * 1.0;
  sum += texture(uSrc, uv + vec2( 0.0, -1.0) * t).rgb * 2.0;
  sum += texture(uSrc, uv + vec2( 1.0, -1.0) * t).rgb * 1.0;
  return sum * (1.0 / 16.0);
}
`;
