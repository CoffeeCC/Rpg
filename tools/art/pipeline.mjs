/**
 * The material passes, ported off `web/public/lantern-lab.html`.
 *
 * The Lab is the reference implementation and it runs in WebGL2; this file is
 * the same arithmetic on typed arrays so it can run unattended over ~125 assets
 * and in CI. Where a decision looks arbitrary here it is because the shader
 * does it that way and the two have to agree — the Lab is what the tuning was
 * eyeballed in, and a port that quietly rounds differently is a port that
 * cannot be checked against it.
 *
 * Two things about the GL semantics that had to be reproduced exactly:
 *
 *   - **CLAMP_TO_EDGE, LINEAR, matched resolutions.** Every pass samples at
 *     `uv + texel * offset` with source and destination the same size, so each
 *     tap lands dead on a texel centre: integer neighbour lookups with the index
 *     clamped at the border. No filtering happens at all except in the levels
 *     downsample, which is genuinely bilinear and is written as such below.
 *   - **v runs down.** The albedo is uploaded with `UNPACK_FLIP_Y_WEBGL false`,
 *     so texture row 0 is image row 0 and the Sobel's y gradient is y-down.
 *     Arrays here are in image order, which means the shader maps across
 *     unchanged — and it is why the lighting model flips n.y rather than the
 *     art.
 *
 * The pipeline splits by asset class, per ENGINE_PLAN.md §9.1:
 *
 *   tiles  luminance -> denoise -> auto-level -> [detail | form] -> Sobel
 *   bevel  alpha silhouette -> EDT -> profile -> smooth -> Sobel
 *
 * They share everything from the Sobel onwards. They must not share anything
 * before it: `bevel` exists precisely because it never looks at painted tone,
 * and so cannot invert a volume the way luminance->Sobel does on shaded art.
 */

// ---------------------------------------------------------------------------
// Defaults. The `tiles` numbers are the Lab's slider defaults, unchanged.
// ---------------------------------------------------------------------------

export const TILE_DEFAULTS = {
  denoise: 1.4,
  detail: 1.0,
  form: 0.55,
  formRadius: 9,
  invert: 0,
};

export const BEVEL_DEFAULTS = {
  /** Alpha above this counts as inside the silhouette. */
  alphaThreshold: 0.5,
  /**
   * How far in from the edge the bulge takes to reach full height, in pixels.
   * `auto` derives it from the shape itself — the 85th percentile of the
   * interior distance field — so a small sprite and a full-frame monster both
   * dome across their whole body instead of one of them getting a thin rim and
   * a dead flat middle.
   */
  bevelRadius: 'auto',
  bevelPercentile: 0.85,
  /** Gaussian sigma applied to the height. The EDT is exact and therefore steppy. */
  smooth: 2.0,
  detail: 1.0,
  /** Off by default: a distance bevel is already low frequency, so a second
   *  blurred band only rounds off the silhouette read. */
  form: 0.0,
  formRadius: 9,
  invert: 0,
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Rec.709 luminance of straight (gamma-encoded) RGBA8, as a 0..1 plane.
 *
 * Perceptual weights, not a flat mean: the eye reads green as most of
 * brightness, and averaging makes saturated reds and blues claim height they
 * do not have.
 *
 * Taking luminance *before* the denoise blur rather than inside it — as the
 * shader does — is exact, not an approximation: luminance is linear in RGB, so
 * it commutes with a weighted sum.
 */
export function luminance(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = (0.2126 * rgba[i * 4] + 0.7152 * rgba[i * 4 + 1] + 0.0722 * rgba[i * 4 + 2]) / 255;
  }
  return out;
}

/** Alpha channel as a 0..1 plane. */
export function alphaPlane(rgba, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = rgba[i * 4 + 3] / 255;
  return out;
}

/**
 * Separable Gaussian with a hard window, clamped at the edges.
 *
 * `radius` is the loop bound in pixels and `sigma` the falloff, because the two
 * shader passes disagree about how to derive one from the other and both have
 * to be reproducible: the denoise pass uses R = ceil(2*sigma) capped at 8, the
 * form pass uses R = ceil(radius) capped at 24 with sigma = radius.
 */
export function blur(src, w, h, sigma, radius) {
  const R = Math.max(0, Math.floor(radius));
  const s = Math.max(1e-4, sigma);
  const k = new Float64Array(R * 2 + 1);
  for (let i = -R; i <= R; i++) k[i + R] = Math.exp(-(i * i) / (2 * s * s));

  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let wsum = 0;
      for (let i = -R; i <= R; i++) {
        const wgt = k[i + R];
        sum += src[row + clamp(x + i, 0, w - 1)] * wgt;
        wsum += wgt;
      }
      tmp[row + x] = sum / Math.max(wsum, 1e-5);
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      let wsum = 0;
      for (let i = -R; i <= R; i++) {
        const wgt = k[i + R];
        sum += tmp[clamp(y + i, 0, h - 1) * w + x] * wgt;
        wsum += wgt;
      }
      out[y * w + x] = sum / Math.max(wsum, 1e-5);
    }
  }
  return out;
}

/** The Lab's denoise pass: Gaussian of sigma `denoise`, window ceil(2*sigma) capped at 8. */
export function denoise(src, w, h, sigma) {
  const s = Math.max(0.001, sigma);
  return blur(src, w, h, s, Math.min(8, Math.ceil(s * 2)));
}

/** The Lab's form band: Gaussian of sigma `radius`, window ceil(radius) capped at 24. */
export function formBand(src, w, h, radius) {
  return blur(src, w, h, radius, Math.min(24, Math.ceil(radius)));
}

/** Bilinear fetch with CLAMP_TO_EDGE, in GL's coordinate convention. */
function sampleBilinear(src, w, h, u, v) {
  const x = u * w - 0.5;
  const y = v * h - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const xa = clamp(x0, 0, w - 1);
  const xb = clamp(x0 + 1, 0, w - 1);
  const ya = clamp(y0, 0, h - 1);
  const yb = clamp(y0 + 1, 0, h - 1);
  const a = src[ya * w + xa] * (1 - fx) + src[ya * w + xb] * fx;
  const b = src[yb * w + xa] * (1 - fx) + src[yb * w + xb] * fx;
  return a * (1 - fy) + b * fy;
}

/**
 * Measure the height's usable range off a 128x128 downsample.
 *
 * Percentiles rather than the extremes, so one blown highlight in the art
 * cannot flatten the whole tile. This is also the number the art brief is
 * arguing about: `hollow_wall` uses 23% of the available range, which costs
 * precision in every derived map, and is what "use the full tonal range" means
 * when it is written down as a target.
 *
 * The 128x128 step is a genuine bilinear resample, matching the Lab, where it
 * falls out of rendering a 1024 texture into a 128 viewport.
 */
export function measureLevels(src, w, h, size = 128) {
  const n = size * size;
  const vals = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      vals[y * size + x] = clamp(sampleBilinear(src, w, h, (x + 0.5) / size, (y + 0.5) / size), 0, 1);
    }
  }
  vals.sort();
  const at = (q) => vals[clamp(Math.round(q * (n - 1)), 0, n - 1)];
  const lo = at(0.02);
  const hi = at(0.98);
  // Refuse to amplify noise on art that genuinely has no range in it.
  return hi - lo < 0.02 ? { lo: 0, hi: 1, span: hi - lo, applied: false } : { lo, hi, span: hi - lo, applied: true };
}

/**
 * The same percentiles over an explicit subset of pixels.
 *
 * The bevel path needs this: measuring the tonal range of a sprite over the
 * whole canvas would average in a transparent surround that decodes as black,
 * pinning the 2nd percentile at zero and reporting a healthy range for art that
 * has none. Only the silhouette counts.
 */
export function measureLevelsMasked(src, mask, stride = 3) {
  const vals = [];
  for (let i = 0; i < src.length; i += stride) if (!mask || mask[i]) vals.push(src[i]);
  if (vals.length < 64) return { lo: 0, hi: 1, span: 1, applied: false };
  vals.sort((a, b) => a - b);
  const at = (q) => vals[clamp(Math.round(q * (vals.length - 1)), 0, vals.length - 1)];
  const lo = at(0.02);
  const hi = at(0.98);
  return { lo, hi, span: hi - lo, applied: hi - lo >= 0.02 };
}

/** Stretch a height field to the full 0..1 range using measured levels. */
export function applyLevels(src, w, h, lo, hi) {
  const out = new Float32Array(w * h);
  const d = Math.max(1e-4, hi - lo);
  for (let i = 0; i < src.length; i++) out[i] = clamp((src[i] - lo) / d, 0, 1);
  return out;
}

/**
 * Sobel on both height bands, combined, to a unit normal field.
 *
 * Two bands weighted separately is the whole trick, and the reason this is not
 * an emboss filter: one radius has to choose between reading the mortar between
 * the bricks and reading the curvature of the wall, and either choice throws
 * the other away. Detail carries the grain, form carries the shape.
 *
 * Returns w*h*3 of unit vectors — un-encoded, because the QC pass wants the
 * float and only the PNG writer wants the 0..255.
 */
export function deriveNormal(detail, form, w, h, { detail: kDetail, form: kForm, invert }) {
  const out = new Float32Array(w * h * 3);
  const sign = 1 - 2 * invert; // mix(1.0, -1.0, invert)

  const grad = (src, x, y) => {
    const xm = clamp(x - 1, 0, w - 1);
    const xp = clamp(x + 1, 0, w - 1);
    const ym = clamp(y - 1, 0, h - 1) * w;
    const yc = y * w;
    const yp = clamp(y + 1, 0, h - 1) * w;
    const tl = src[ym + xm];
    const tc = src[ym + x];
    const tr = src[ym + xp];
    const ml = src[yc + xm];
    const mr = src[yc + xp];
    const bl = src[yp + xm];
    const bc = src[yp + x];
    const br = src[yp + xp];
    return [
      tr + 2 * mr + br - (tl + 2 * ml + bl),
      bl + 2 * bc + br - (tl + 2 * tc + tr),
    ];
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      let gx = 0;
      let gy = 0;
      if (kDetail !== 0) {
        const g = grad(detail, x, y);
        gx += g[0] * kDetail;
        gy += g[1] * kDetail;
      }
      if (kForm !== 0) {
        const g = grad(form, x, y);
        gx += g[0] * kForm;
        gy += g[1] * kForm;
      }
      gx *= sign;
      gy *= sign;
      // The z term sets how far the surface is allowed to tilt. Scaling the
      // gradient rather than clamping the normal keeps it unit length, so a
      // strong setting steepens instead of flattening into a cutoff.
      const nx = -gx * 4;
      const ny = -gy * 4;
      const len = Math.hypot(nx, ny, 1) || 1;
      out[i * 3] = nx / len;
      out[i * 3 + 1] = ny / len;
      out[i * 3 + 2] = 1 / len;
    }
  }
  return out;
}

/**
 * Ambient occlusion: how far below its own neighbourhood a point sits.
 *
 * Crude next to a hemisphere trace and right for the shape of the problem —
 * creases and mortar lines are exactly where the coarse band sits above the
 * fine one. On a bevel it falls out as a rim darkening at the silhouette,
 * which is also what you want.
 */
export function deriveAo(detail, form, w, h) {
  const out = new Float32Array(w * h);
  for (let i = 0; i < out.length; i++) {
    out[i] = clamp(1 - Math.max(0, form[i] - detail[i]) * 4, 0, 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// EDT beveling — the character path
// ---------------------------------------------------------------------------

/**
 * Exact Euclidean distance transform, Felzenszwalb & Huttenlocher's
 * lower-envelope-of-parabolas method: two separable O(n) passes over squared
 * distances.
 *
 * `mask` is 1 inside the silhouette. The result is the distance in pixels from
 * each interior pixel to the nearest exterior one. Outside the image counts as
 * exterior, so a sprite that runs off the canvas still bevels at the canvas
 * edge instead of claiming to be infinitely thick there.
 */
export function distanceTransform(mask, w, h) {
  const INF = 1e20;
  const f = new Float64Array(Math.max(w, h));
  const d = new Float64Array(Math.max(w, h));
  const v = new Int32Array(Math.max(w, h));
  const z = new Float64Array(Math.max(w, h) + 1);
  const grid = new Float64Array(w * h);

  for (let i = 0; i < w * h; i++) grid[i] = mask[i] ? INF : 0;

  const envelope = (n) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
    }
  };

  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    envelope(h);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
    envelope(w);
    for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
  }

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      // Nearest pixel outside the canvas, in case the art is cropped tight.
      const border = Math.min(x + 1, y + 1, w - x, h - y);
      out[i] = Math.min(Math.sqrt(grid[i]), border);
    }
  }
  return out;
}

/**
 * Height from the alpha silhouette: EDT bevel.
 *
 * ENGINE_PLAN.md §9.1, on the authority of Moreira, Coutinho & Chaimowicz,
 * *Analysis and Compilation of Normal Map Generation Techniques for Pixel Art*
 * (SBGames 2022, arXiv:2212.09692) — of six methods evaluated, beveling is the
 * best of the automatic ones. What earns it the character path is not that it
 * scores well: it is that **it cannot invert a volume**. Luminance->Sobel reads
 * `albedo x irradiance` and mistakes a painted crevice for a bump, and the
 * artifact only shows once the light swings away from where the artist implied
 * it. Distance-from-edge never looks at tone, so the failure is not available
 * to it. The trade is that it knows nothing about interior form — a monster
 * comes out as one smooth mass, which is honest and dull, and the ~20 assets
 * that carry the look get hand-authored maps anyway.
 *
 * Profile is a quarter circle rather than a linear ramp, so the normal turns
 * continuously across the bevel instead of creasing where the chamfer meets the
 * plateau.
 */
export function bevelHeight(alpha, w, h, params) {
  const p = { ...BEVEL_DEFAULTS, ...params };
  const mask = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) mask[i] = alpha[i] > p.alphaThreshold ? 1 : 0;

  const dist = distanceTransform(mask, w, h);

  let radius = p.bevelRadius;
  if (radius === 'auto' || radius == null) {
    const inside = [];
    // Every 4th pixel: this is a percentile over tens of thousands of samples
    // and the exact one does not move.
    for (let i = 0; i < w * h; i += 4) if (mask[i]) inside.push(dist[i]);
    inside.sort((a, b) => a - b);
    radius = inside.length
      ? Math.max(2, inside[clamp(Math.round(p.bevelPercentile * (inside.length - 1)), 0, inside.length - 1)])
      : 2;
  }

  const height = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (!mask[i]) continue;
    const t = clamp(dist[i] / radius, 0, 1);
    // Quarter circle: 0 at the silhouette, 1 at full depth, tangent flat inside.
    height[i] = Math.sqrt(Math.max(0, 1 - (1 - t) * (1 - t)));
  }

  const smoothed = p.smooth > 0 ? blur(height, w, h, p.smooth, Math.min(24, Math.ceil(p.smooth * 2))) : height;
  return { height: smoothed, mask, bevelRadius: radius, distance: dist };
}

/**
 * Flatten the normal and clear the AO outside the silhouette.
 *
 * Those texels are transparent and never lit, but the Sobel does not know that
 * and leaves a halo of steep normals just outside the alpha edge, which shows
 * up the moment anything samples the map with a filter.
 */
export function maskOutside(normals, ao, height, mask) {
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) continue;
    normals[i * 3] = 0;
    normals[i * 3 + 1] = 0;
    normals[i * 3 + 2] = 1;
    ao[i] = 1;
    height[i] = 0;
  }
}

// ---------------------------------------------------------------------------
// The bakes
// ---------------------------------------------------------------------------

/**
 * `tiles` mode — the Lab's pipeline, exactly.
 * @returns {{ normals: Float32Array, height: Float32Array, ao: Float32Array, levels: object, params: object }}
 */
export function bakeTiles(bitmap, params = {}) {
  const p = { ...TILE_DEFAULTS, ...params };
  const { width: w, height: h, data } = bitmap;

  const raw = denoise(luminance(data, w, h), w, h, p.denoise);
  const levels = measureLevels(raw, w, h);
  const detail = applyLevels(raw, w, h, levels.lo, levels.hi);
  const form = formBand(detail, w, h, p.formRadius);

  return {
    normals: deriveNormal(detail, form, w, h, p),
    height: detail,
    ao: deriveAo(detail, form, w, h),
    levels,
    params: p,
    alpha: null,
  };
}

/**
 * `bevel` mode — the character path. Silhouette in, volume out, tone ignored.
 */
export function bakeBevel(bitmap, params = {}) {
  const p = { ...BEVEL_DEFAULTS, ...params };
  const { width: w, height: h, data } = bitmap;

  const alpha = alphaPlane(data, w, h);
  const { height: hgt, mask, bevelRadius } = bevelHeight(alpha, w, h, p);
  // The coarse band is computed whatever `form` is weighted at, because AO is
  // the difference between the two and wants it regardless.
  const form = formBand(hgt, w, h, p.formRadius);

  const normals = deriveNormal(hgt, form, w, h, p);
  const ao = deriveAo(hgt, form, w, h);
  maskOutside(normals, ao, hgt, mask);

  // Reported only. A bevel height spans 0..1 by construction, so measuring the
  // height would print 100% for every asset and mean nothing; what the art
  // brief is actually asking about is the tone of the source, so that is what
  // gets recorded, measured inside the silhouette. NOTHING downstream of this
  // line reads it — tone must not reach the height field, because not reading
  // tone is the entire reason this mode exists.
  const levels = measureLevelsMasked(denoise(luminance(data, w, h), w, h, 1.4), mask);

  return {
    normals,
    height: hgt,
    ao,
    levels,
    params: { ...p, bevelRadius },
    alpha: (() => {
      const a = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) a[i] = data[i * 4 + 3];
      return a;
    })(),
    mask,
  };
}

export function bake(bitmap, mode, params) {
  if (mode === 'tiles') return bakeTiles(bitmap, params);
  if (mode === 'bevel') return bakeBevel(bitmap, params);
  throw new Error(`unknown mode "${mode}" — expected tiles or bevel`);
}
