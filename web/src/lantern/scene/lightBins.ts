// =========================================================================
// LIGHT BINNING — the ceiling comes off.
//
// THE PROBLEM THIS EXISTS FOR. `renderer.ts` culled lights against the
// viewport once per frame and then took the first eight, because the lit
// shader carried eight uniform slots. So the budget was EIGHT LIGHTS ON
// SCREEN, TOTAL — not eight per tile — and the failure was silent: the ninth
// light simply did not appear, anywhere, with nothing in the HUD to say so.
//
// ENGINE_PLAN §12 asks for one bright lantern and MANY faint emitters — wall
// sconces, a lit torch, glowing mushrooms, drifting wisps. One corridor of
// those exhausts eight. So the cap had to go before the art direction could
// exist at all.
//
// WHY BINNING AND NOT CASCADES (§12.3, and it is decided rather than
// weighed here). Radiance cascades are O(1) in lights, but that is a SIDE
// EFFECT of what they are for, which is bounce — and they are the milestone
// with real research risk. Binning buys COUNT, which is the thing actually
// missing, and it is contained, well-understood work. It also makes M5
// cheaper rather than competing with it, because the cascade solver wants the
// same spatial structure to seed from.
//
// THE IDEA, and why it is cheap precisely BECAUSE the emitters are faint.
// Chop the visible board into coarse square bins. Each light writes its index
// into every bin its REACH covers. A fragment looks up the one bin it stands
// in and shades against only those lights. Faint means small reach: a mushroom
// lighting two tiles touches about a dozen tiles — three or four bins — and
// costs literally nothing anywhere else on the board. The lantern and the room
// lamp are the expensive ones, and there is one of each.
//
// EVERYTHING HERE IS PURE. No GL, no DOM, no camera — bounds in, a typed array
// out. That is what makes the interesting half of this feature testable
// without a graphics context, which is the same split `scene/piece.ts` keeps
// with its pixel generators.
// =========================================================================

import { attenuation } from '../passes/lighting';
import type { Bounds, Light } from './scene';

/**
 * The empty-slot sentinel, and the reason a bin needs no separate count.
 *
 * 0xFFFF because the bin texture is R16UI: a slot holds a light index, and
 * 65535 is one the renderer can never hand out (`MAX_SCENE_LIGHTS` is three
 * orders of magnitude below it). The shader's inner loop is therefore
 * "fetch, break on sentinel", which costs `count + 1` texel fetches rather
 * than a fixed `capacity` — so a bin holding two mushrooms costs two lights,
 * not sixteen.
 */
export const BIN_EMPTY = 0xffff;

/**
 * Hard ceiling on lights in one frame. Not a budget — a bounds check.
 *
 * The light data texture is `LIGHT_TEXELS` wide and one row per light, and
 * WebGL2 guarantees only 2048 rows. 1024 leaves headroom and is far past any
 * scene anyone will author; the point of the constant is that going over it
 * must be a reported drop rather than a wrapped index.
 */
export const MAX_SCENE_LIGHTS = 1024;

/** RGBA32F texels per light in the data texture. See `packLights`. */
export const LIGHT_TEXELS = 3;

/**
 * Light slots per bin, and the number the shader compiles its loop bound from.
 *
 * The CPU binning and the GLSL loop MUST agree — a shader compiled for 8 that
 * reads a 16-slot texture walks into the next bin's lights, which is the
 * subtlest possible version of this feature going wrong. So the constant lives
 * here, beside the packer, and the renderer feeds the same value to both.
 */
export const DEFAULT_BIN_CAPACITY = 16;

export interface LightBinOptions {
  /**
   * Bin edge length in tiles.
   *
   * The trade is the usual clustered-forward one and it is not sharp: bigger
   * bins mean fewer of them to build and upload, and more lights per fragment
   * because a bin claims every light that touches any part of it. 2 tiles is
   * a little under the reach of the faintest emitter the art direction asks
   * for, which is the size that stops a mushroom's bins from being mostly
   * empty board.
   */
  binSize?: number;
  /** Light slots per bin. Overflow is scored and reported, never silent. */
  capacity?: number;
  /**
   * Cap on bins per axis, which is what stops a zoomed-way-out camera from
   * asking for a megabyte of bin texture. When it bites, `binSize` grows
   * instead — coarser bins, never a smaller covered region, because a region
   * that does not cover the fragment is a lighting hole and a coarse bin is
   * merely a few wasted light evaluations.
   */
  maxBins?: number;
  /**
   * Tiles of margin around `bounds`.
   *
   * `cullSprites` keeps a sprite whose BOX overlaps the bounds, so a fragment
   * can legitimately sit a sprite-size outside them — a hero standing just off
   * the bottom edge, the table quad, a wall's front face. The bin lookup
   * clamps, so without margin those fragments would all read the edge bin.
   * Clamping is still the backstop; the margin is what keeps it from being
   * load-bearing.
   */
  pad?: number;
}

const DEFAULTS: Required<LightBinOptions> = {
  binSize: 2,
  capacity: DEFAULT_BIN_CAPACITY,
  maxBins: 64,
  pad: 3,
};

/**
 * A frame's binning, ready to upload.
 *
 * `slots` is row-major over bins, `capacity` entries each, sentinel-filled.
 * It maps one-to-one onto an R16UI texture of `binsX * capacity` by `binsY`,
 * which is why the layout is what it is rather than something tidier.
 */
export interface LightBins {
  /** World position of bin (0,0)'s minimum corner, in tiles. */
  originX: number;
  originY: number;
  binSize: number;
  binsX: number;
  binsY: number;
  capacity: number;
  /** `binsX * binsY * capacity` light indices, BIN_EMPTY where unused. */
  slots: Uint16Array;
  /** Lights actually placed, per bin. Row-major, `binsX * binsY`. */
  counts: Uint16Array;
  /**
   * Placements refused for want of a slot, summed over every bin.
   *
   * THE WHOLE POINT OF REPORTING IT: the bug this file replaces was invisible,
   * and an overflow that is also invisible would be the same bug one level
   * down. The renderer puts this in `HudStats`, so a bin that is genuinely
   * too small says so on screen instead of quietly dimming one mushroom.
   */
  dropped: number;
  /** Fullest bin in the frame. `capacity` here means the next light overflows. */
  maxPerBin: number;
  /** Lights that reached at least one bin. Below `lights.length` means some fell outside. */
  placed: number;
}

/**
 * Where bin coordinates come out, given the region and the caps.
 *
 * Split out from `binLights` because the renderer needs the same geometry to
 * write the shader's uniforms, and two places computing "how many bins fit"
 * from the same inputs is how a lookup ends up half a bin off — which shows
 * up as light popping along one edge of the screen and nowhere else.
 */
export function binGeometry(bounds: Bounds, options: LightBinOptions = {}): {
  originX: number;
  originY: number;
  binSize: number;
  binsX: number;
  binsY: number;
} {
  const opts = { ...DEFAULTS, ...options };
  const pad = Math.max(0, opts.pad);
  const originX = bounds.minX - pad;
  const originY = bounds.minY - pad;
  const width = Math.max(1e-3, bounds.maxX - bounds.minX + pad * 2);
  const height = Math.max(1e-3, bounds.maxY - bounds.minY + pad * 2);
  const maxBins = Math.max(1, Math.floor(opts.maxBins));
  // One bin size for both axes, because the shader multiplies by a single
  // reciprocal. Grow it until both axes fit under the cap rather than
  // clipping the region, for the reason in `maxBins` above.
  const binSize = Math.max(opts.binSize, width / maxBins, height / maxBins, 1e-3);
  return {
    originX,
    originY,
    binSize,
    binsX: Math.min(maxBins, Math.max(1, Math.ceil(width / binSize))),
    binsY: Math.min(maxBins, Math.max(1, Math.ceil(height / binSize))),
  };
}

/**
 * Bin every light that touches the visible region.
 *
 * The footprint is the light's REACH as an axis-aligned box in xy, and that is
 * conservative on purpose. A fragment at height h is lit when the 3D distance
 * is under `reach`, and 3D distance is never less than the xy distance — so
 * binning on xy alone can only ever over-include, never miss. Which is the
 * right direction to be wrong in: over-including costs an attenuation that
 * evaluates to nearly zero, under-including is a light that vanishes.
 *
 * ORDER IS PRESERVED where it fits. Lights go into each bin in the order the
 * caller gave them, so the lantern — index 0 by convention everywhere in this
 * engine — is the first light a fragment shades against, and the debug views
 * that return on the first light still show the lantern.
 *
 * ON OVERFLOW, the brightest wins. A full bin scores the newcomer against its
 * weakest occupant at the bin centre (`intensity * attenuation`) and evicts
 * only if the newcomer is stronger. That makes overflow degrade by losing the
 * least visible light rather than by losing whichever one happened to be
 * enumerated last — the exact failure mode this whole file exists to delete,
 * at a smaller scale.
 */
export function binLights(
  lights: readonly Light[],
  bounds: Bounds,
  options: LightBinOptions = {},
): LightBins {
  const opts = { ...DEFAULTS, ...options };
  const capacity = Math.max(1, Math.floor(opts.capacity));
  const geo = binGeometry(bounds, options);
  const { originX, originY, binSize, binsX, binsY } = geo;
  const binCount = binsX * binsY;

  const slots = new Uint16Array(binCount * capacity).fill(BIN_EMPTY);
  const counts = new Uint16Array(binCount);
  // Parallel to `slots`, and deliberately local: a score is scaffolding for
  // the eviction decision, not something a consumer should be able to read
  // back and start depending on.
  const scores = new Float32Array(binCount * capacity);

  let dropped = 0;
  let placed = 0;
  const inv = 1 / binSize;
  const limit = Math.min(lights.length, MAX_SCENE_LIGHTS);
  if (lights.length > limit) dropped += lights.length - limit;

  for (let i = 0; i < limit; i++) {
    const l = lights[i];
    const reach = Math.max(0, l.reach);
    const x0 = Math.floor((l.position.x - reach - originX) * inv);
    const x1 = Math.floor((l.position.x + reach - originX) * inv);
    const y0 = Math.floor((l.position.y - reach - originY) * inv);
    const y1 = Math.floor((l.position.y + reach - originY) * inv);
    const bx0 = Math.max(0, x0);
    const bx1 = Math.min(binsX - 1, x1);
    const by0 = Math.max(0, y0);
    const by1 = Math.min(binsY - 1, y1);
    if (bx1 < bx0 || by1 < by0) continue;

    let any = false;
    for (let by = by0; by <= by1; by++) {
      for (let bx = bx0; bx <= bx1; bx++) {
        const bin = by * binsX + bx;
        const base = bin * capacity;
        const used = counts[bin];
        // Score at the bin CENTRE. The alternative — score at the light's own
        // position — ranks a distant floodlight above a mushroom sitting in
        // the bin, which is precisely backwards for deciding what that bin's
        // fragments can see.
        const cx = originX + (bx + 0.5) * binSize;
        const cy = originY + (by + 0.5) * binSize;
        const dx = l.position.x - cx;
        const dy = l.position.y - cy;
        const score = l.intensity * attenuation(Math.sqrt(dx * dx + dy * dy), reach);
        if (used < capacity) {
          slots[base + used] = i;
          scores[base + used] = score;
          counts[bin] = used + 1;
          any = true;
          continue;
        }
        // Full. Evict the weakest, but only for something brighter.
        let weakest = 0;
        for (let s = 1; s < capacity; s++) if (scores[base + s] < scores[base + weakest]) weakest = s;
        dropped++;
        if (score > scores[base + weakest]) {
          slots[base + weakest] = i;
          scores[base + weakest] = score;
          any = true;
        }
      }
    }
    if (any) placed++;
  }

  let maxPerBin = 0;
  for (let b = 0; b < binCount; b++) if (counts[b] > maxPerBin) maxPerBin = counts[b];

  return { originX, originY, binSize, binsX, binsY, capacity, slots, counts, dropped, maxPerBin, placed };
}

/** Bin index for a board position, clamped exactly the way the shader clamps it. */
export function binIndexAt(bins: LightBins, x: number, y: number): number {
  const bx = clampInt(Math.floor((x - bins.originX) / bins.binSize), 0, bins.binsX - 1);
  const by = clampInt(Math.floor((y - bins.originY) / bins.binSize), 0, bins.binsY - 1);
  return by * bins.binsX + bx;
}

/**
 * The light indices a fragment at (x, y) would shade against.
 *
 * The CPU twin of the shader's inner loop, and the thing most tests assert on:
 * "is this light visible at this position" is the question the old ceiling got
 * wrong, so it is the question worth being able to ask without a GPU.
 */
export function lightsAt(bins: LightBins, x: number, y: number): number[] {
  const bin = binIndexAt(bins, x, y);
  const base = bin * bins.capacity;
  const out: number[] = [];
  for (let s = 0; s < bins.capacity; s++) {
    const v = bins.slots[base + s];
    if (v === BIN_EMPTY) break;
    out.push(v);
  }
  return out;
}

function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Pack lights for the RGBA32F data texture: `LIGHT_TEXELS` wide, one row each.
 *
 *   texel 0   position.xyz, intensity
 *   texel 1   colour.rgb,   casts shadow (1 or 0)
 *   texel 2   reach, radius, 0, 0
 *
 * A texture rather than a uniform array, and that IS the fix — uniform arrays
 * have to be sized at compile time, which is where the number eight came from
 * in the first place. `texelFetch` takes a runtime index, so the light count
 * becomes a data question instead of a shader-source question.
 *
 * RGBA32F rather than 16F because these are BOARD COORDINATES. Half floats
 * carry about ten bits of mantissa, so a light thirty tiles out would snap to
 * roughly a thirtieth of a tile — visible as a light that jitters between
 * positions as it drifts, which is exactly what a wisp does.
 *
 * `indirectOnly` FOLDS INTO "casts no shadow" here, and it is worth being
 * precise about why. §12.4 wants the faint emitters marked `indirectOnly`, and
 * `Light`'s own doc says such a light belongs to the lattice rather than to
 * the direct pass. But the lattice is M5 and does not exist, so routing them
 * out of the direct pass today would make them INVISIBLE — the opposite of the
 * feature. Until M5 they stay in the direct pass with the march skipped, which
 * is the whole of what the flag can mean while there is only one pass. When
 * the lattice lands, this line is where they leave.
 */
export function packLights(lights: readonly Light[]): Float32Array {
  const n = Math.min(lights.length, MAX_SCENE_LIGHTS);
  const out = new Float32Array(Math.max(1, n) * LIGHT_TEXELS * 4);
  for (let i = 0; i < n; i++) {
    const l = lights[i];
    const o = i * LIGHT_TEXELS * 4;
    out[o + 0] = l.position.x;
    out[o + 1] = l.position.y;
    out[o + 2] = l.position.z;
    out[o + 3] = l.intensity;
    out[o + 4] = l.colour[0];
    out[o + 5] = l.colour[1];
    out[o + 6] = l.colour[2];
    out[o + 7] = l.castsShadow === false || l.indirectOnly === true ? 0 : 1;
    out[o + 8] = l.reach;
    out[o + 9] = l.radius;
  }
  return out;
}
