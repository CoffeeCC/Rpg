// =========================================================================
// THE ARENA'S MATERIALS — where `battleScene.ts`'s texture ids get pixels.
//
// Same split, same two rules, as `render/materials.ts` — which this file
// deliberately does NOT reuse, because the map's library requests wall art,
// eight object icons and a hero sprite that an arena has no use for, and does
// not have the two things an arena does: a candle, and a painted backdrop that
// changes per fight rather than per gate.
//
// THE TWO UPLOAD RULES, restated because both have cost hours in this project:
//
//   COLOUR is SRGB8_ALPHA8. Everything past the sampler is linear-light, so
//   gamma-encoded bytes make every midtone too bright.
//
//   NORMALS are RGBA8, NEVER sRGB. A normal map is three numbers that happen
//   to live in a colour texture; an sRGB decode turns 0.5 — "no tilt on this
//   axis" — into 0.21 and tips every surface.
//
// ASYNCHRONY IS NOT AN ERROR STATE. `SpriteBatcher.draw` skips a batch whose
// texture id is missing, so the arena renders the instant the procedural
// furniture exists and gains its painted figures and backdrop as they arrive.
// A monster with no painting costs that monster a figure and nothing else —
// which is 41 of 92 of them (ENGINE_PLAN §8's cleanup list).
// =========================================================================

import type { Material } from '../lantern/scene/scene';
import { createRGBATexture } from '../lantern/gl/procedural';
import {
  baseDiscNormalPixels,
  baseDiscPixels,
  blockShadowPixels,
  contactShadowPixels,
} from '../lantern/scene/piece';
import {
  boardFrameNormalPixels,
  boardFramePixels,
  boardRimNormalPixels,
  boardRimPixels,
  fieldToAlbedo,
  fieldToNormals,
  woodField,
} from '../lantern/scene/board';
import { flamePixels } from '../lantern/scene/emitters';
// The map's bake conventions, reused deliberately: a combatant IS one of the
// bevel assets `render/materials.ts` already resolves, so the fight and the
// floor must agree on which cut of a sprite is the real one.
import { BAKED_ROOT, PIECE_RELIEF, bakedRef } from './materials';
import {
  COMBAT_FX_KINDS,
  IMPACT_ATLAS_COLS,
  MAT_ARENA,
  MAT_BACKDROP,
  MAT_BEZEL,
  MAT_BEZEL_SMALL,
  MAT_BLANK,
  MAT_CANDLE,
  MAT_CORNER_BRASS,
  MAT_IMPACT,
  MAT_RAIL_STRIP,
  MAT_RAIL_STRIP_BRASS,
  MAT_SOCKET,
  type CombatFxKind,
} from './battleScene';

/**
 * Where `tools/art/blender/bake.py` publishes to (`tools/art/blender/publish.mjs`
 * copies staging's `<name>.png` / `<name>_normal.png` here, mirroring
 * `render/materials.ts`'s `BAKED_ROOT` convention for the bevel/tile bakes).
 *
 * NOT reused from `materials.ts` on purpose: `bakedRef` there parses the
 * EDT-bevel naming (`<set>/<source>_albedo.png`) off a source art URL, and the
 * Blender board bakes are a different pipeline with a different convention —
 * `<name>.png` is itself the albedo, there is no source art to derive a URL
 * from, and AO is never published at all (see the header of `publish.mjs`).
 */
export const BAKED_BOARD_ROOT = 'art/materials/board';

export interface BattleMaterialLibrary {
  materials: Map<string, Material>;
  /** Queue a colour texture for `id` from `url`. Idempotent; a repeat is free. */
  request(id: string, url: string, extra?: Partial<Material>): void;
  /**
   * Queue a Blender-baked board furniture shape (§19.1) by its bake name —
   * `candle_socket`, `board_corner_brass`, `candle_rail_strip`, and so on.
   * Fetches BOTH `${name}.png` (colour) and `${name}_normal.png` (relief) from
   * `BAKED_BOARD_ROOT` and applies the two upload rules stated at the top of
   * this file: colour is `SRGB8_ALPHA8`, the normal is `RGBA8` and never sRGB.
   * `repeat: true` wraps both textures instead of clamping, for a shape
   * authored to tile (the candle rail strip's registered height axis).
   */
  requestFurniture(id: string, name: string, extra?: Partial<Material> & { repeat?: boolean }): void;
  /**
   * A combatant's painted art: the REPAIRED cut plus its carved relief.
   * Prefers `<name>_albedo.png` over the original URL — see `requestFigureArt`
   * for why the fight was drawing ghosts while the floor was not.
   */
  requestFigure(id: string, url: string): void;
  /** Drop a texture so a new fight can put a different image behind the same id. */
  forget(id: string): void;
  dispose(): void;
}

// -------------------------------------------------------------------------
// THE CANDLE — pure pixels, so the shape is testable without a context
// -------------------------------------------------------------------------

/**
 * A wax column with a wick, as an upright quad's albedo.
 *
 * Generated rather than drawn for the reason every generator in this engine is
 * generated: it is geometry, so it can be re-tuned without a re-shoot and
 * asserted as a falloff rather than as a screenshot. The column is narrower
 * than the quad so the sprite's own edges are transparent and the silhouette
 * comes from the alpha, not from the quad.
 */
export function candlePixels(size = 64): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const half = 0.24; // column half-width, in UV
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size; // 0 at the TOP of the quad (see procedural.ts)
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const dx = u - 0.5;
      const i = (y * size + x) * 4;
      // The wick occupies the top eighth, dead centre.
      if (v < 0.12) {
        if (Math.abs(dx) < 0.022) {
          const soot = 1 - v / 0.12;
          out[i] = 46 + 30 * soot;
          out[i + 1] = 38 + 22 * soot;
          out[i + 2] = 32 + 14 * soot;
          out[i + 3] = 255;
        }
        continue;
      }
      if (Math.abs(dx) > half) continue;
      // Cylindrical shading across the column: bright a third of the way from
      // the left, falling off to a dark right edge. A flat column reads as a
      // strip of paper, and this is the cheapest thing that says "round".
      const across = dx / half; // -1..1
      const lobe = Math.cos((across - 0.32) * 1.25);
      const shade = 0.42 + 0.58 * Math.max(0, lobe) ** 1.4;
      // The top rim of the wax is melted and translucent; the base is dirty.
      const melt = v < 0.2 ? 1.16 : 1;
      const grime = 0.9 + 0.1 * (1 - v);
      const k = shade * melt * grime;
      out[i] = Math.min(255, 236 * k);
      out[i + 1] = Math.min(255, 222 * k);
      out[i + 2] = Math.min(255, 186 * k);
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Tangent-space normals for the column, from the same cylinder. */
export function candleNormalPixels(size = 64): Uint8Array {
  const out = new Uint8Array(size * size * 4);
  const half = 0.24;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const dx = u - 0.5;
      const i = (y * size + x) * 4;
      out[i] = 128;
      out[i + 1] = 128;
      out[i + 2] = 255;
      out[i + 3] = 255;
      if (v < 0.12 || Math.abs(dx) > half) continue;
      const across = Math.max(-1, Math.min(1, dx / half));
      const nx = across * 0.92;
      const nz = Math.sqrt(Math.max(1e-4, 1 - nx * nx));
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = 128;
      out[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    }
  }
  return out;
}

// -------------------------------------------------------------------------
// THE IMPACT ATLAS — `art/impactFx.tsx`'s eight shapes, as pixels
// -------------------------------------------------------------------------
//
// ENGINE_PLAN §21.7 left `ImpactEffect` as a DOM overlay: an SVG sweeping over
// the target, unlit, casting nothing. §1.2 says the GPU draws every surface,
// and a flare is a surface — so the same eight shapes are generated here and
// drawn as an emissive quad standing on the piece's own measured box.
//
// GENERATED, NOT DRAWN, for the reason every generator in this engine is: the
// shapes are arithmetic, so they can be re-tuned without a re-shoot and
// asserted as coverage rather than as a screenshot. They are also PURE — no
// `Math.random` anywhere, because two uploads of the same atlas must be
// identical byte for byte or a pixel diff of the fight means nothing.
//
// A MASK, NOT A COLOUR. Every lit pixel is white and the shape lives entirely
// in the alpha channel; the element's colour arrives as the sprite's tint
// (`battleScene.IMPACT_LOOK`, which is `IMPACT_COLOR` converted to linear
// light). So this uploads RGBA8 and NEVER sRGB — the same rule, and the same
// reasoning, `shadow` and `blockshadow` already follow above.

/**
 * Transparent border left around every cell, in cell fractions.
 *
 * An atlas cannot be mipmapped without its cells bleeding into each other at
 * the coarse levels — so this one is not, and the margin is the second belt:
 * even at LINEAR magnification a sample that strays past a cell edge lands on
 * transparency rather than on the neighbouring element's flare.
 */
export const IMPACT_CELL_MARGIN = 0.05;

/** Distance from `(px,py)` to the segment `a`->`b`. */
function segmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy;
  const t = len2 <= 1e-9 ? 0 : Math.max(0, Math.min(1, ((px - ax) * vx + (py - ay) * vy) / len2));
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Distance to a polyline, as the minimum over its segments. */
function polylineDistance(px: number, py: number, pts: readonly [number, number][]): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const d = segmentDistance(px, py, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
    if (d < best) best = d;
  }
  return best;
}

/** A quadratic Bezier, flattened to a polyline the distance query can use. */
function quadPoints(
  p0: [number, number],
  c: [number, number],
  p1: [number, number],
  steps = 24,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    out.push([
      m * m * p0[0] + 2 * m * t * c[0] + t * t * p1[0],
      m * m * p0[1] + 2 * m * t * c[1] + t * t * p1[1],
    ]);
  }
  return out;
}

/** A cubic Bezier, same treatment. `dark`'s two curls are cubics in the SVG. */
function cubicPoints(
  p0: [number, number],
  c0: [number, number],
  c1: [number, number],
  p1: [number, number],
  steps = 28,
): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const m = 1 - t;
    out.push([
      m * m * m * p0[0] + 3 * m * m * t * c0[0] + 3 * m * t * t * c1[0] + t * t * t * p1[0],
      m * m * m * p0[1] + 3 * m * m * t * c0[1] + 3 * m * t * t * c1[1] + t * t * t * p1[1],
    ]);
  }
  return out;
}

/** Soft-edged coverage for a stroke of half-width `hw` at distance `d`. */
function strokeCoverage(d: number, hw: number, feather = 0.012): number {
  if (d <= hw - feather) return 1;
  if (d >= hw + feather) return 0;
  return (hw + feather - d) / (2 * feather);
}

/**
 * How bright a soft core each element carries, 0..1.
 *
 * A flare that is only line-work reads as a decal sitting in front of the
 * piece. The core is what makes it read as something GLOWING at the point of
 * impact, and it is also what the bloom pass finds — an edge one pixel wide
 * does not survive a downsample. The bladed kinds get the least of it: a slash
 * is a glint off an edge, not a detonation.
 *
 * THESE WERE HALVED AFTER LOOKING AT A REAL FRAME, and it is the correction
 * worth recording. The first pass paired a 0.55 core with `emissiveStrength`
 * 2.6 — nearly double the 1.25 bloom threshold — so every flare bloomed into
 * one white ball about three times the width of the piece, and the combatant
 * it landed on disappeared behind it. The DOM overlay it replaces is a
 * translucent SVG you can still see the target through, and that is the right
 * behaviour: you have to be able to watch the thing you just hit.
 */
const IMPACT_CORE: Record<CombatFxKind, number> = {
  slash: 0.1,
  pierce: 0.11,
  hit: 0.24,
  fire: 0.3,
  frost: 0.2,
  bolt: 0.26,
  dark: 0.18,
  holy: 0.3,
};

/** Coverage of one element's shape at cell-local `(u, v)`, both 0..1. */
function impactShape(kind: CombatFxKind, u: number, v: number): number {
  const x = u - 0.5;
  const y = v - 0.5;
  switch (kind) {
    // Three sweeping arcs, thinnest and most opaque last — the SVG's own
    // `M-10 55 Q 100 95 210 30` family, normalised out of its 200 viewBox.
    case 'slash': {
      let a = 0;
      const arcs: [number, number, number, number][] = [
        [0.275, 0.475, 0.15, 0.05],
        [0.5, 0.725, 0.4, 0.0375],
        [0.725, 0.925, 0.625, 0.0225],
      ];
      const weight = [0.55, 0.85, 1];
      for (let i = 0; i < arcs.length; i++) {
        const [y0, yc, y1, hw] = arcs[i];
        const d = polylineDistance(u, v, quadPoints([-0.05, y0], [0.5, yc], [1.05, y1]));
        a = Math.max(a, strokeCoverage(d, hw) * weight[i]);
      }
      return a;
    }
    // A lance: a lens tapering to a point at both ends, thickest at the
    // middle. The SVG's arrowhead is at one end only; a symmetric spike reads
    // better on a billboard, which can be seen from either side of the board.
    case 'pierce': {
      const taper = Math.max(0, 1 - Math.abs(2 * u - 1));
      const hw = 0.075 * Math.pow(taper, 0.6);
      return hw <= 0 ? 0 : strokeCoverage(Math.abs(y), hw);
    }
    // The four-point sparkle, as an astroid — `|x|^0.5 + |y|^0.5 <= r^0.5` is
    // exactly the concave star the SVG draws by hand out of eight points.
    case 'hit':
    case 'holy': {
      const r = kind === 'holy' ? 0.47 : 0.44;
      const f = Math.sqrt(Math.abs(x) / r) + Math.sqrt(Math.abs(y) / r);
      return f >= 1.06 ? 0 : f <= 0.98 ? 1 : (1.06 - f) / 0.08;
    }
    // A teardrop, wide at the base and licking to a point. The wobble is a
    // fixed sine of height, not a random walk: it is the same flame every
    // time, which is what makes a pixel diff of the atlas meaningful.
    case 'fire': {
      const t = (v - 0.06) / 0.86;
      if (t < 0 || t > 1) return 0;
      const w = 0.32 * Math.pow(t, 0.55) * (1 - 0.22 * t * t) * (1 + 0.13 * Math.sin(t * 9.1));
      const d = Math.abs(x);
      if (d >= w) return 0;
      // A hot core down the middle, so the flame is not a flat silhouette.
      return d < w * 0.45 ? 1 : 0.72;
    }
    // Eight spokes with barbs, tapering outward. A snowflake's read is the
    // barbs; the bare asterisk reads as a compass rose.
    case 'frost': {
      let a = 0;
      for (let k = 0; k < 8; k++) {
        const ang = (k * Math.PI) / 4;
        const ex = Math.cos(ang) * 0.45;
        const ey = Math.sin(ang) * 0.45;
        const d = segmentDistance(x, y, 0, 0, ex, ey);
        const along = Math.min(1, Math.sqrt(x * x + y * y) / 0.45);
        a = Math.max(a, strokeCoverage(d, 0.032 * (1 - 0.55 * along)));
        for (const at of [0.5, 0.76]) {
          const bx = Math.cos(ang) * 0.45 * at;
          const by = Math.sin(ang) * 0.45 * at;
          for (const off of [0.7, -0.7]) {
            const tx = bx + Math.cos(ang + off) * 0.12;
            const ty = by + Math.sin(ang + off) * 0.12;
            a = Math.max(a, strokeCoverage(segmentDistance(x, y, bx, by, tx, ty), 0.018));
          }
        }
      }
      return a;
    }
    // The zigzag, stroked rather than filled — the SVG's outline traced down
    // its spine, which keeps the shape legible at a quarter of the size.
    case 'bolt': {
      const d = polylineDistance(u, v, [
        [0.62, 0.05],
        [0.3, 0.51],
        [0.55, 0.51],
        [0.35, 0.95],
      ]);
      return strokeCoverage(d, 0.055);
    }
    // Two curling wisps, the SVG's own cubics.
    case 'dark': {
      const a = polylineDistance(
        u,
        v,
        cubicPoints([0.1, 0.85], [0.28, 0.5], [0.23, 0.28], [0.5, 0.16]).concat(
          cubicPoints([0.5, 0.16], [0.79, 0.04], [0.91, 0.28], [0.84, 0.5]),
        ),
      );
      const b = polylineDistance(u, v, cubicPoints([0.19, 0.94], [0.36, 0.64], [0.33, 0.39], [0.59, 0.28]));
      return Math.max(strokeCoverage(a, 0.06) * 0.85, strokeCoverage(b, 0.04) * 0.7);
    }
  }
}

/**
 * All eight shapes, as one square RGBA8 atlas laid out by `COMBAT_FX_KINDS`.
 *
 * `cell` is the edge of one cell; the buffer is `cell * IMPACT_ATLAS_COLS`
 * square, which is what `createRGBATexture` requires and what makes 3x3 the
 * only sane arrangement for eight shapes. The ninth cell is left empty and
 * `impactUv` never addresses it.
 */
export function impactAtlasPixels(cell = 128): Uint8Array {
  const size = cell * IMPACT_ATLAS_COLS;
  const out = new Uint8Array(size * size * 4);
  for (let i = 0; i < COMBAT_FX_KINDS.length; i++) {
    const kind = COMBAT_FX_KINDS[i];
    const cx = (i % IMPACT_ATLAS_COLS) * cell;
    const cy = Math.floor(i / IMPACT_ATLAS_COLS) * cell;
    const core = IMPACT_CORE[kind];
    for (let y = 0; y < cell; y++) {
      const v = (y + 0.5) / cell;
      for (let x = 0; x < cell; x++) {
        const u = (x + 0.5) / cell;
        // The margin, enforced here rather than trusted to each shape.
        const inset =
          u < IMPACT_CELL_MARGIN ||
          u > 1 - IMPACT_CELL_MARGIN ||
          v < IMPACT_CELL_MARGIN ||
          v > 1 - IMPACT_CELL_MARGIN;
        let a = inset ? 0 : impactShape(kind, u, v);
        if (!inset && core > 0) {
          const r = Math.sqrt((u - 0.5) ** 2 + (v - 0.5) ** 2) / 0.3;
          a = Math.max(a, core * Math.exp(-r * r));
        }
        if (a <= 0) continue;
        const o = ((cy + y) * size + (cx + x)) * 4;
        out[o] = 255;
        out[o + 1] = 255;
        out[o + 2] = 255;
        out[o + 3] = Math.min(255, Math.round(a * 255));
      }
    }
  }
  return out;
}

/** Board frame chamfer, per axis — one fraction would over-chamfer the short edges. */
function frameOptions(width: number, height: number, border: number) {
  const w = width + border * 2;
  const h = height + border * 2;
  return { borderU: (border * 0.86) / w, borderV: (border * 0.86) / h };
}

/**
 * Everything an arena needs that is made of arithmetic rather than art.
 *
 * Note the board dimensions are a HINT here rather than a fact: the arena's
 * width is solved from the viewport every frame (`battleScene.arenaWidth`), so
 * the frame's chamfer is baked for the first size it saw. That is fine and it
 * is why it is stated — the chamfer is a few percent of a texture that is
 * stretched over the whole slab, and re-baking it on every resize would upload
 * a 512x512 texture during a drag.
 */
export function createBattleMaterialLibrary(
  gl: WebGL2RenderingContext,
  board: { width: number; height: number; border: number },
): BattleMaterialLibrary {
  const materials = new Map<string, Material>();
  const owned = new Map<string, WebGLTexture[]>();
  const pending = new Set<string>();
  let disposed = false;

  const own = (id: string, tex: WebGLTexture): WebGLTexture => {
    const list = owned.get(id);
    if (list) list.push(tex);
    else owned.set(id, [tex]);
    return tex;
  };

  materials.set(MAT_BLANK, {
    id: MAT_BLANK,
    albedo: own(MAT_BLANK, createRGBATexture(gl, 1, new Uint8Array([255, 255, 255, 255]))),
  });
  materials.set('shadow', {
    id: 'shadow',
    // Alpha-only mask, so NOT sRGB — there is no colour in it to decode.
    albedo: own('shadow', createRGBATexture(gl, 96, contactShadowPixels(96), { mipmap: true })),
  });
  materials.set('blockshadow', {
    id: 'blockshadow',
    albedo: own('blockshadow', createRGBATexture(gl, 96, blockShadowPixels(96), { mipmap: true })),
  });
  materials.set('base', {
    id: 'base',
    albedo: own('base', createRGBATexture(gl, 128, baseDiscPixels(128), { srgb: true, mipmap: true })),
    normal: own('base', createRGBATexture(gl, 128, baseDiscNormalPixels(128), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set(MAT_CANDLE, {
    id: MAT_CANDLE,
    albedo: own(MAT_CANDLE, createRGBATexture(gl, 64, candlePixels(64), { srgb: true, mipmap: true })),
    normal: own(MAT_CANDLE, createRGBATexture(gl, 64, candleNormalPixels(64), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set('flame', {
    id: 'flame',
    albedo: own('flame', createRGBATexture(gl, 96, flamePixels(96), { srgb: true, mipmap: true })),
    emissiveStrength: 2.4,
  });
  // THE IMPACT FLARES (§21.7). Emissive, like the flame, and for the same
  // reason `emitters.ts` states: the sprite's brightness and the light it
  // casts stop being the same number. A burst is albedo x 2.6 on screen and a
  // light of `IMPACT_LOOK.intensity` in the world, and it has to be both —
  // that is what makes a hit both a legible SHAPE and a thing that genuinely
  // lights the board around it.
  //
  // 1.5, MEASURED AGAINST THE BLOOM THRESHOLD RATHER THAN PICKED. `LOOK`
  // (`LanternBattlefield.tsx`) sets `bloomThreshold` to 1.25, so a flare has
  // to clear 1.25 to glow at all and wants to sit just over it: the first cut
  // copied the flame's 2.6, which is more than double the threshold, and every
  // flare bloomed into a white ball that hid the combatant it landed on. At
  // 1.5 the shape survives the bloom instead of being eaten by it.
  //
  // NOT sRGB and NOT mipmapped, both deliberate: it is an alpha mask with no
  // colour to decode (the tint carries the element), and an atlas that is
  // mipmapped bleeds its cells into one another. See `impactAtlasPixels`.
  materials.set(MAT_IMPACT, {
    id: MAT_IMPACT,
    albedo: own(MAT_IMPACT, createRGBATexture(gl, 128 * IMPACT_ATLAS_COLS, impactAtlasPixels(128))),
    emissiveStrength: 1.5,
  });

  const fo = frameOptions(board.width, board.height, board.border);
  materials.set('frame', {
    id: 'frame',
    albedo: own('frame', createRGBATexture(gl, 512, boardFramePixels(512, fo), { srgb: true, mipmap: true })),
    normal: own('frame', createRGBATexture(gl, 512, boardFrameNormalPixels(512, fo), { mipmap: true })),
    normalStrength: 1,
  });
  materials.set('rim', {
    id: 'rim',
    albedo: own('rim', createRGBATexture(gl, 256, boardRimPixels(256), { srgb: true, mipmap: true, repeat: true })),
    normal: own('rim', createRGBATexture(gl, 256, boardRimNormalPixels(256), { mipmap: true, repeat: true })),
    normalStrength: 1,
  });
  const tableField = woodField(256, { grain: 7, warp: 1.5 });
  materials.set('table', {
    id: 'table',
    albedo: own(
      'table',
      createRGBATexture(gl, 256, fieldToAlbedo(tableField, 256, [30, 21, 14], [92, 64, 40]), {
        srgb: true,
        mipmap: true,
        repeat: true,
      }),
    ),
    normal: own('table', createRGBATexture(gl, 256, fieldToNormals(tableField, 256, 0.9), { mipmap: true, repeat: true })),
    normalStrength: 1,
  });

  /**
   * Load one image into a texture, applying the two upload rules.
   *
   * `srgb` decides `SRGB8_ALPHA8` (colour) versus `RGBA8` (a normal map or any
   * other numeric field) — getting this backwards on a normal map bends every
   * vector toward +z, per this file's header. `repeat` is CLAMP_TO_EDGE unless
   * a shape is authored to tile (the candle rail's registered height axis).
   */
  function loadTexture(
    url: string,
    srgb: boolean,
    repeat: boolean,
    done: (tex: WebGLTexture | null) => void,
  ): void {
    const img = new Image();
    img.onload = () => {
      if (disposed) return done(null);
      const tex = gl.createTexture();
      if (!tex) return done(null);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, srgb ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      gl.generateMipmap(gl.TEXTURE_2D);
      done(tex);
    };
    // A missing asset is not an error worth shouting about.
    img.onerror = () => done(null);
    img.src = url;
  }

  function request(id: string, url: string, extra: Partial<Material> = {}): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    loadTexture(url, true, false, (tex) => {
      pending.delete(id);
      if (!tex) return;
      own(id, tex);
      materials.set(id, { id, albedo: tex, ...extra });
    });
  }

  /**
   * The furniture path: two fetches (colour + normal) rather than one, so it
   * cannot reuse `request`'s single-texture draft. Publishes the moment the
   * ALBEDO lands — same rule as `render/materials.ts`'s draft pattern — so a
   * socket or a strip is drawn (flat-shaded) the instant its colour arrives
   * rather than waiting on both fetches, and the normal fills in whenever it
   * finishes, in whichever order the two requests land.
   */
  /**
   * A COMBATANT: the repaired cut, then the carved relief.
   *
   * Two fetches like `requestFurniture`, but the albedo has a FALLBACK CHAIN
   * rather than a fixed name — `<name>_albedo.png` first, the original URL
   * second. See `requestFigureArt` for why that order is the whole point.
   *
   * `disposed` is checked before falling back, not only inside the load: React
   * StrictMode builds a library, throws it away and builds another, and without
   * this the dead one answers its own baked load with "null, because I am
   * disposed" and then fetches the original as though the bake were missing.
   * Harmless, but it puts a phantom request for every ghostly original in the
   * network log — which is precisely the evidence someone would use to conclude
   * this feature does not work. `materials.ts` paid for that lesson already.
   */
  function requestFigure(id: string, url: string): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    const baked = bakedRef(url);
    const draft: { albedo: WebGLTexture | null; normal: WebGLTexture | null } = {
      albedo: null,
      normal: null,
    };
    const publish = () => {
      if (disposed || !draft.albedo) return;
      materials.set(id, {
        id,
        albedo: draft.albedo,
        normal: draft.normal ?? undefined,
        ...(baked ? { normalStrength: PIECE_RELIEF } : {}),
      });
    };
    const takeAlbedo = (tex: WebGLTexture | null) => {
      pending.delete(id);
      if (!tex) return;
      draft.albedo = own(id, tex);
      publish();
    };
    if (baked && baked.bevel) {
      loadTexture(`${BAKED_ROOT}/${baked.set}/${baked.name}_albedo.png`, true, false, (tex) => {
        if (tex) return takeAlbedo(tex);
        if (disposed) return;
        loadTexture(url, true, false, takeAlbedo);
      });
    } else {
      loadTexture(url, true, false, takeAlbedo);
    }
    if (baked) {
      // NEVER sRGB — an sRGB decode turns 0.5 ("no tilt") into 0.21 and every
      // surface lights as though tilted hard.
      loadTexture(`${BAKED_ROOT}/${baked.set}/${baked.name}_normal.png`, false, false, (tex) => {
        if (!tex) return;
        draft.normal = own(id, tex);
        publish();
      });
    }
  }

  function requestFurniture(
    id: string,
    name: string,
    extra: Partial<Material> & { repeat?: boolean } = {},
  ): void {
    if (disposed || materials.has(id) || pending.has(id)) return;
    pending.add(id);
    const { repeat = false, ...matExtra } = extra;
    const draft: {
      albedo: WebGLTexture | null;
      normal: WebGLTexture | null;
      material: WebGLTexture | null;
    } = {
      albedo: null,
      normal: null,
      material: null,
    };
    const publish = () => {
      if (disposed || !draft.albedo) return;
      materials.set(id, {
        id,
        albedo: draft.albedo,
        normal: draft.normal ?? undefined,
        material: draft.material ?? undefined,
        ...matExtra,
      });
    };
    loadTexture(`${BAKED_BOARD_ROOT}/${name}.png`, true, repeat, (tex) => {
      pending.delete(id);
      if (!tex) return;
      draft.albedo = own(id, tex);
      publish();
    });
    // THE MATERIAL MAP (roughness, specular, iridescence, occlusion). Never
    // sRGB: every channel is DATA, and an sRGB decode would bend all four —
    // turning 0.12 roughness into 0.014 and making brass a mirror.
    loadTexture(`${BAKED_BOARD_ROOT}/${name}_material.png`, false, repeat, (tex) => {
      if (!tex) return;
      draft.material = own(id, tex);
      publish();
    });
    loadTexture(`${BAKED_BOARD_ROOT}/${name}_normal.png`, false, repeat, (tex) => {
      if (!tex) return;
      draft.normal = own(id, tex);
      publish();
    });
  }

  /**
   * Free one id so it can be re-requested with a different image.
   *
   * The map never needs this — a floor's tile art is fixed for the life of the
   * device. The arena does: `backdrop` means "the painting behind THIS fight",
   * and walking from Hollow Gate into Sunken Gate must not leave the first
   * gate's painting standing behind the second one's monsters.
   */
  function forget(id: string): void {
    const list = owned.get(id);
    if (list) for (const tex of list) gl.deleteTexture(tex);
    owned.delete(id);
    materials.delete(id);
    pending.delete(id);
  }

  return {
    materials,
    request,
    requestFurniture,
    requestFigure,
    forget,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const list of owned.values()) for (const tex of list) gl.deleteTexture(tex);
      owned.clear();
      materials.clear();
    },
  };
}

/** What the arena floor is made of. Falls back to a bare slab off-gate. */
export function requestArenaFloor(lib: BattleMaterialLibrary, groundUrl: string | null): void {
  if (groundUrl) lib.request(MAT_ARENA, groundUrl, { inlay: 1 });
}

/** The painting that stands behind the fight (§8 item 6, now that it is data). */
export function requestBackdrop(lib: BattleMaterialLibrary, url: string | null): void {
  if (url) lib.request(MAT_BACKDROP, url);
}

/**
 * Painted figures for whoever is on the field.
 *
 * THIS USED TO PASS THE RAW URL, and that is why Paul kept seeing ghosts.
 *
 * `render/materials.ts` fixed the map by preferring `<name>_albedo.png` — the
 * source art wearing a REPAIRED matte. The originals were cut with a
 * luminance key, so dark cloth keyed out as low alpha and the alpha channel is
 * legibly a drawing of the character rather than a silhouette; mean
 * fully-opaque across the set is 59.6% before the repair and 91.6% after, and
 * `hero` alone goes 41.14% -> 95.26%. A figure at two thirds alpha is two
 * thirds of a figure and one third of the board behind it.
 *
 * The battle path never got that preference, so the fight kept drawing the
 * ghostly originals while the floor drew the repaired ones — the same pieces,
 * two different answers, which is exactly the shape of bug that survives
 * because each screen looks self-consistent.
 *
 * It also collects `_normal.png`, so a combatant lights as the carved relief
 * §15 asks for rather than as a flat card, at `PIECE_RELIEF` — full strength,
 * because a billboard never sees the grazing angle that forced tiles down to
 * `TILE_RELIEF`.
 *
 * Falls back to the original URL when there is no bake, so an unbaked species
 * still appears rather than vanishing.
 */
export function requestFigureArt(
  lib: BattleMaterialLibrary,
  art: readonly { textureId: string; url: string }[],
): void {
  for (const a of art) lib.requestFigure(a.textureId, a.url);
}

/**
 * The Blender-baked board furniture (§19.1) that has a fixed position on the
 * arena's own frame — no DOM measuring.
 *
 * Idempotent and safe to call every frame's mount effect: `requestFurniture`
 * no-ops once the id is loaded or already in flight, same as `request`.
 *
 * THE RAIL STRIP IS TWO ROWS, and the brass one was baked in the same pass as
 * the timber and then never asked for. `bake.py`'s `split()` publishes
 * `candle_rail_strip` and `candle_rail_strip_brass` from one assembly at one
 * frame, so both take the SAME `repeat: true` — the wrap is a property of the
 * shared frame's registered height axis, not of either material — and
 * `buildBattleScene` draws them at one rect. Requesting only the timber is why
 * a rail that §19.1 asks to be "fairly reflective" has had no metal on it.
 */
export function requestBoardFurniture(lib: BattleMaterialLibrary): void {
  lib.requestFurniture(MAT_SOCKET, 'candle_socket');
  lib.requestFurniture(MAT_RAIL_STRIP, 'candle_rail_strip', { repeat: true });
  lib.requestFurniture(MAT_RAIL_STRIP_BRASS, 'candle_rail_strip_brass', { repeat: true });
  lib.requestFurniture(MAT_CORNER_BRASS, 'board_corner_brass');
}

/**
 * The fittings that sit behind a MEASURED DOM box (§19.1, ENGINE_PLAN §21.7).
 *
 * Split from `requestBoardFurniture` because the two have genuinely different
 * lifetimes in the argument, not merely in the code: frame-fixed furniture is
 * carpentry the arena always has, while these exist only because a widget does
 * and would go away with it. Both are requested from the same mount effect
 * today, and keeping them separate is what makes it obvious which list a new
 * shape belongs on.
 *
 * BOTH BEZEL SIZES, always. They are one design at two authored sizes
 * (`battleScene.BEZEL_FRAME`), the chip's size in tiles moves across the
 * `--bf-scale` ladder, and the pick happens per frame in the scene builder —
 * so which one is needed is not known here and asking for one would make the
 * choice a load order rather than a measurement. Six fetches, once per fight.
 *
 * NOT REQUESTED: `log_well`, `pile_tray`, `exhaust_grate`, `lantern_cradle`,
 * `brass_strap`. Every one is published and none of them is wired, for reasons
 * that are measurements rather than oversights — see the block above
 * `HUD_PORTRAIT_ENEMY` in `battleScene.ts`. Asking for a texture nothing draws
 * would only put six phantom requests in the network log, which is exactly the
 * evidence someone would use to conclude the feature works.
 */
export function requestHudFurniture(lib: BattleMaterialLibrary): void {
  lib.requestFurniture(MAT_BEZEL, 'portrait_bezel');
  lib.requestFurniture(MAT_BEZEL_SMALL, 'portrait_bezel_small');
}
