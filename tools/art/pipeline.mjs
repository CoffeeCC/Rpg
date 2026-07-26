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
 *   bevel  alpha sharpen -> silhouette -> EDT -> profile -> smooth -> Sobel
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
   * Alpha sharpening — see `sharpenAlpha` for what it fixes and why.
   *
   * `sharpenThreshold` is where the TRUE silhouette is, read off the raw alpha.
   * It is deliberately low. The mattes on this art are luminance-keyed, so a
   * dark pauldron is a low alpha and a mid-height threshold eats it; measured
   * across the shipped set, moving 0.5 -> 0.06 recovers 53% of obsidianWarden's
   * silhouette and 25% of player's. Below ~0.04 there is nothing left to
   * recover — coverage stops moving — so this is not a knob that wants pushing.
   *
   * `sharpenBand` is the width in PIXELS of the antialiasing ramp kept at that
   * silhouette. 1.5 is a pixel and a half of edge; 0 would be a hard key and
   * would show every stair.
   *
   * `sharpen` is the blend back toward the raw alpha, in the style of `detail`
   * and `form`. 0 leaves the alpha exactly as authored, which is what a
   * genuinely translucent asset — glass, a ghost, a flame — would want.
   */
  sharpen: 1.0,
  sharpenThreshold: 0.06,
  sharpenBand: 1.5,
  /**
   * Refuse to sharpen when this much of the canvas BORDER is inside the
   * silhouette — because then it is not a silhouette, it is a photograph.
   *
   * Two of the hundred assets are not cut out at all: `obsidianWarden` carries
   * a smoky backdrop out to all four edges and `lastLightBargain` is a full
   * lava scene. Forcing their alpha opaque does not de-ghost a character, it
   * pastes a rectangle onto the board — which is worse than the faint wash it
   * replaces, and worse in a way nobody would notice until they saw it in
   * game. The measured split is clean: 89 of 100 assets sit under 2%, the
   * highest legitimate one (`roostVigil`, a gargoyle on a plinth that runs off
   * the bottom of the frame) is 22.9%, and `obsidianWarden` is 36.2%. 0.30 is
   * the gap between those two, chosen with both of them on screen.
   *
   * A refusal is recorded in the manifest rather than swallowed: the asset
   * wants re-cutting, and the manifest is where that gets noticed.
   */
  sharpenBorderLimit: 0.3,
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
 *
 * `clampToBorder` is that last rule, and it is the default because the bevel
 * wants it. The alpha sharpener does not: it runs this over the INVERTED mask
 * to measure how far outside the silhouette a pixel is, and there the rule
 * caps every pixel in the outermost row at distance 1 — which would leave a
 * one-pixel frame of 17%-opaque nothing around the whole canvas.
 */
export function distanceTransform(mask, w, h, { clampToBorder = true } = {}) {
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
      const d = Math.sqrt(grid[i]);
      if (!clampToBorder) {
        out[i] = d;
        continue;
      }
      // Nearest pixel outside the canvas, in case the art is cropped tight.
      const border = Math.min(x + 1, y + 1, w - x, h - y);
      out[i] = Math.min(d, border);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Alpha sharpening — the step in front of the bevel
// ---------------------------------------------------------------------------

/**
 * Below one 8-bit step per pixel the alpha is flat to the precision it was
 * stored in, so the local gradient carries no information about where the edge
 * is and must not be divided by.
 */
const MIN_ALPHA_SLOPE = 1 / 255;

/** Alpha statistics, the shape the manifest records them in. */
function alphaProfile(plane) {
  let opaque = 0;
  let partial = 0;
  let sum = 0;
  for (let i = 0; i < plane.length; i++) {
    const a = plane[i];
    if (a >= 0.999) opaque++;
    else if (a > 0.004) partial++;
    if (a > 0.004) sum += a;
  }
  const visible = opaque + partial;
  return {
    /** Of the pixels that show at all, how many are fully opaque. */
    opaqueFraction: visible ? opaque / visible : 0,
    partialFraction: visible ? partial / visible : 0,
    meanAlpha: visible ? sum / visible : 0,
    visible,
  };
}

/**
 * Turn a soft matte into a silhouette with a clean edge.
 *
 * WHAT IS WRONG WITH THE ART. These sprites were cut out with something
 * luminance-keyed: the alpha channel is legibly a *drawing* of the character,
 * not a matte. Dark cloth is low alpha, a highlight is high alpha. Measured on
 * the shipped set, `tamer` is 23% fully opaque with a mean alpha of 148/255 and
 * `obsidianWarden` 16.5% at 121/255. It cost nothing on the old DOM map, which
 * put sprites on a near-black background where a half-transparent dark pixel is
 * indistinguishable from an opaque one. On a lit board there is brightness
 * underneath, and every soft pixel blends toward the floor — the figures read
 * as ghosts.
 *
 * IT ALSO COSTS GEOMETRY. `bevelHeight` takes its silhouette from this same
 * alpha, so the luminance key does not just fade the art, it *erodes the
 * shape*: at the old 0.5 threshold `obsidianWarden` lost 53% of its silhouette
 * and `tamer` 44%, and what the EDT then bevels is a lace doily rather than a
 * body. `tamer`'s auto bevel radius collapsed to 3px against 12px for the one
 * sprite whose matte is sound (`merchant`), which is why it came out flattest.
 *
 * HOW IT WORKS. Two estimates of the same signed distance to the silhouette,
 * each used where it is the better one:
 *
 *   - AWAY FROM THE EDGE, an exact EDT off the thresholded mask. It is
 *     quantised to whole pixels, which does not matter a pixel and a half in,
 *     and it is immune to the interior texture that makes the gradient estimate
 *     wobble.
 *   - AT THE EDGE, the first-order estimate `(a - T) / |grad a|`, which is
 *     SUB-PIXEL. This is the part that keeps the silhouette from going jagged:
 *     the ramp position varies continuously with the source alpha, so the edge
 *     follows the contour the artist drew rather than the pixel grid. A plain
 *     `alpha > T ? 1 : 0` key would put every stair on show.
 *
 * The distance then becomes coverage across a band `sharpenBand` pixels wide,
 * centred on the silhouette. Everything further in is 1, everything further out
 * is 0, and the band is the antialiasing.
 *
 * WHAT IT DOES NOT DO: fill holes. Measured at this threshold, `player` has
 * none at all and `merchant` has 32 pixels of them; `tamer`'s are the loop of
 * her leash, which encloses real background and must stay a hole. A blanket
 * flood fill would weld it shut. Holes are a threshold problem, and the
 * threshold is where they get solved.
 *
 * @param {Float32Array} alpha 0..1, w*h
 * @returns {{ alpha: Float32Array, applied: boolean, before: object, after: object }}
 */
export function sharpenAlpha(alpha, w, h, params = {}) {
  const p = { ...BEVEL_DEFAULTS, ...params };
  const before = alphaProfile(alpha);
  const amount = clamp(p.sharpen ?? 0, 0, 1);
  if (amount <= 0) {
    return { alpha, applied: false, reason: 'sharpen is 0', borderCoverage: 0, before, after: before };
  }

  const T = clamp(p.sharpenThreshold, 0, 1);
  const band = Math.max(1e-3, p.sharpenBand);

  const core = new Uint8Array(w * h);
  const shell = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    core[i] = alpha[i] >= T ? 1 : 0;
    shell[i] = core[i] ? 0 : 1;
  }

  // Is this a cut-out at all? See `sharpenBorderLimit`.
  let ring = 0;
  let ringIn = 0;
  for (let x = 0; x < w; x++) {
    ring += 2;
    ringIn += core[x] + core[(h - 1) * w + x];
  }
  for (let y = 1; y < h - 1; y++) {
    ring += 2;
    ringIn += core[y * w] + core[y * w + w - 1];
  }
  const borderCoverage = ring ? ringIn / ring : 0;
  if (borderCoverage > p.sharpenBorderLimit) {
    return {
      alpha,
      applied: false,
      reason:
        `the silhouette covers ${(borderCoverage * 100).toFixed(1)}% of the canvas border, over the ` +
        `${(p.sharpenBorderLimit * 100).toFixed(0)}% limit — this art is not cut out, it has a background ` +
        'baked into it, and forcing it opaque would paste a rectangle on the board. Re-cut the source.',
      borderCoverage,
      before,
      after: before,
    };
  }
  // Unclamped both ways: a figure that runs off the canvas is not thereby thin,
  // and the transparent surround is not thereby half-there.
  const dIn = distanceTransform(core, w, h, { clampToBorder: false });
  const dOut = distanceTransform(shell, w, h, { clampToBorder: false });

  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;

      // Whole-pixel signed distance from this pixel's CENTRE to the boundary.
      // A pixel just inside has dIn = 1 and sits half a pixel in; its outside
      // neighbour has dOut = 1 and sits half a pixel out. The boundary is the
      // zero between them.
      const edt = core[i] ? dIn[i] - 0.5 : -(dOut[i] - 0.5);

      let sd = edt;
      if (edt > -1.5 && edt < 1.5) {
        // On the boundary itself, where sub-pixel accuracy is the whole game.
        const xm = clamp(x - 1, 0, w - 1);
        const xp = clamp(x + 1, 0, w - 1);
        const ym = clamp(y - 1, 0, h - 1) * w;
        const yc = y * w;
        const yp = clamp(y + 1, 0, h - 1) * w;
        // Sobel over a linear ramp of slope s returns 8s, hence the /8: this is
        // alpha units per pixel, which is what the division below needs.
        const gx = (alpha[ym + xp] + 2 * alpha[yc + xp] + alpha[yp + xp] - (alpha[ym + xm] + 2 * alpha[yc + xm] + alpha[yp + xm])) / 8;
        const gy = (alpha[yp + xm] + 2 * alpha[yp + x] + alpha[yp + xp] - (alpha[ym + xm] + 2 * alpha[ym + x] + alpha[ym + xp])) / 8;
        const g = Math.hypot(gx, gy);
        const sub = (alpha[i] - T) / Math.max(g, MIN_ALPHA_SLOPE);
        // A boundary pixel cannot be further than a pixel from the boundary;
        // clamping keeps a flat patch of alpha from claiming otherwise.
        sd = clamp(sub, -1, 1);
      }

      const sharp = clamp(0.5 + sd / band, 0, 1);
      out[i] = alpha[i] + (sharp - alpha[i]) * amount;
    }
  }

  return { alpha: out, applied: true, reason: null, borderCoverage, before, after: alphaProfile(out) };
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

  // Sharpen FIRST. Everything after this line — the silhouette, the EDT, the
  // alpha the exported maps carry, and the de-ghosted sprite the renderer
  // wants — reads the cleaned alpha, so there is exactly one silhouette in
  // play and the maps cannot disagree with the art they belong to.
  //
  // `alphaThreshold` is still 0.5 and still what cuts the mask, and on the
  // sharpened plane that is the same contour as `sharpenThreshold` on the raw
  // one by construction: sharpening maps the T-contour to 0.5. When `sharpen`
  // is 0 it degrades to exactly the old behaviour.
  const sharpened = sharpenAlpha(alphaPlane(data, w, h), w, h, p);
  const alpha = sharpened.alpha;
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
    // `bevelRadius` stays as AUTHORED — usually the string 'auto'. It used to
    // be overwritten here with the number `auto` resolved to, which made the
    // manifest replay a radius instead of re-deriving one, and that is only
    // harmless while the silhouette never changes. Alpha sharpening changes
    // the silhouette on every asset, and a radius measured off the old eroded
    // outline is not tuning, it is a stale measurement wearing tuning's
    // clothes. The resolved number is a measurement and lives beside the other
    // ones, in `measured.silhouette.bevelRadius`.
    params: { ...p },
    bevelRadius,
    alpha: (() => {
      const a = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) a[i] = Math.round(clamp(alpha[i], 0, 1) * 255);
      return a;
    })(),
    /**
     * The source art wearing the cleaned alpha. This is the deliverable that
     * lets the renderer stop drawing ghosts without anyone repainting 92
     * monsters: same RGB, same silhouette, opaque where the character is.
     */
    albedo: (() => {
      const out = new Uint8ClampedArray(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        out[i * 4] = data[i * 4];
        out[i * 4 + 1] = data[i * 4 + 1];
        out[i * 4 + 2] = data[i * 4 + 2];
        out[i * 4 + 3] = Math.round(clamp(alpha[i], 0, 1) * 255);
      }
      return out;
    })(),
    alphaSharpen: sharpened,
    mask,
  };
}

export function bake(bitmap, mode, params) {
  if (mode === 'tiles') return bakeTiles(bitmap, params);
  if (mode === 'bevel') return bakeBevel(bitmap, params);
  throw new Error(`unknown mode "${mode}" — expected tiles or bevel`);
}
