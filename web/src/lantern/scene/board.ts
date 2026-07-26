// =========================================================================
// THE BOARD AS AN OBJECT — a slab with an edge, sitting on a table.
//
// ENGINE_PLAN §11 names the two cues this file exists for, and both were
// listed as MISSING:
//
//   "Board edge and thickness — a board is a slab with a visible rim; ours
//    was an infinite tile plane that simply stopped."
//   "A table underneath — gives the board a context and makes it an OBJECT
//    rather than the whole world. Everything outside it was flat night,
//    which reads as void."
//
// §13 then made them load-bearing rather than set dressing: the camera frames
// the whole board, so the rim and the table are on screen every single frame
// and carry most of the "this is a physical thing" impression by themselves.
//
// THE GENERAL SHAPE, and it is deliberate. The rim is not a special case for
// the board's outline — it is `ledgeFace`, a vertical quad wherever the
// height of the world changes. A wall block's front face is the same thing.
// So is the drop at the edge of a raised platform, and so is the second layer
// §14 is about to add. Building the rim as an instance of that rather than as
// its own thing is most of the geometry for those, for free.
//
// EVERYTHING HERE IS PURE. Sprite lists and byte arrays; no GL, no DOM.
// =========================================================================

import { visibleBounds, type Camera, type Vec2 } from './camera';
import { LAYER_BOARD, LAYER_DECAL, LAYER_TABLE, type Sprite, type Tint, type UVRect } from './sprite';

const FULL_UV: UVRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// -------------------------------------------------------------------------
// LEDGES — one vertical face, wherever the world changes height
// -------------------------------------------------------------------------

export interface LedgeFaceOptions {
  /** Left edge of the face, in tiles. */
  x: number;
  /** Width, in tiles. */
  width: number;
  /** The board row the face stands at — the near edge of whatever is behind it. */
  y: number;
  /** Height of the surface BEHIND the face. */
  top: number;
  /** Height of the surface IN FRONT of it. Below `top`, or there is no face. */
  bottom: number;
  textureId: string;
  uv?: UVRect;
  tint?: Tint;
}

/**
 * The quad that closes a height discontinuity.
 *
 * This is the surface that makes a tilted camera worth having: it is the only
 * thing in a top-down world that faces the light head-on, so it is the only
 * thing a moving lantern rakes ACROSS rather than merely brightening. Every
 * vertical surface in the game is one of these — a wall block's front, a
 * board's rim, a ledge above a drop, the step between two map layers.
 *
 * `upright` rather than `billboard`: this is a fixed plane in the world and it
 * does not turn to face anybody. Its normal points along board +y, out toward
 * the near edge of the table.
 */
export function ledgeFace(o: LedgeFaceOptions): Sprite {
  return {
    position: { x: o.x, y: o.y, z: o.bottom },
    size: { x: o.width, y: Math.max(0, o.top - o.bottom) },
    // Anchored at its BASE, which is the surface in front of it.
    pivot: { x: 0, y: 1 },
    upright: true,
    uv: o.uv ?? FULL_UV,
    textureId: o.textureId,
    tint: o.tint,
  };
}

// -------------------------------------------------------------------------
// THE SLAB
// -------------------------------------------------------------------------

/**
 * A Blender-baked frame, cut into windows instead of stretched over the slab.
 *
 * `board_frame` is ONE square render of a whole frame — 4 tiles of play area
 * inside a 1.1-tile band of timber — and stretching that over a 22x14 board is
 * the one thing it must not do: the border band is a fixed FRACTION of the
 * texture, so on a 22-wide slab the brass bead would land four tiles inside the
 * play area and the tiles would draw straight over it. `bake.py`'s own comment
 * on `build_frame` says as much ("Corner-plus-edge is the version that survives
 * a board whose aspect is not 1:1").
 *
 * So the ring is cut out of the bake as a 3x3 of UV windows with the middle
 * omitted, and the corner windows keep their exact size while only the four
 * edge runs stretch along their length. That costs the timber figure some
 * sharpness on a long run and buys three things that matter more: every mitre,
 * bead and corner bracket lands at its real width whatever the board's aspect,
 * and — the reason it is windows rather than mirrored strips — EVERY WINDOW IS
 * IN ITS NATIVE ORIENTATION. A mirrored quad would need its normal map's
 * matching channel negated to stay correct (LYING maps texture RGB to board
 * x/y/z directly), the vertex format carries no flip flag, and the error would
 * be invisible until the lantern moved past it.
 */
export interface FrameWindows {
  /** The `board_frame` bake — the timber half. */
  textureId: string;
  /** Its `_brass` half, drawn over the timber at the identical rects. */
  brassTextureId?: string;
}

/**
 * `tools/art/blender/bake.py`'s frame numbers, in TILES.
 *
 * Restated here rather than imported because nothing joins the two programs at
 * runtime — a change on either side has to fail a test rather than a
 * screenshot. `FRAME_PLAY`, `FRAME_BORDER`, `MARGIN` and `FRAME_WINDOW` there.
 */
export const BAKED_FRAME = {
  /** Play area the frame was modelled around. */
  play: 4,
  /** Width of the timber band. This is what sets the scale of everything. */
  border: 1.1,
  /** Empty space the render leaves around the slab, as a multiplier. */
  margin: 1.04,
  /** How far a corner or edge window reaches in from the slab's outer edge. */
  window: 1.5,
} as const;

/** Height the `board_rim` bake was authored at, in tiles. */
export const BAKED_RIM_HEIGHT = 0.34;

export interface BoardSlabOptions {
  /** Play area, in tiles. The tile grid occupies [0,width) x [0,height). */
  width: number;
  height: number;
  /** Frame width around the play area, in tiles. */
  border?: number;
  /** How thick the slab is, in tiles. This is what the rim shows. */
  thickness?: number;
  frameTextureId: string;
  /** A baked frame, cut into windows. Falls back to `frameTextureId` when absent. */
  frameWindows?: FrameWindows;
  rimTextureId?: string;
  /** The rim bake's `_brass` half — the strap and its bolts at every seam. */
  rimBrassTextureId?: string;
  /**
   * Tiles per repeat of the rim texture.
   *
   * 4 by default, which is what `board_rim` is baked at. It is a knob because
   * it is the ONLY way to keep a baked rim's aspect honest: the quad's height
   * is the slab's thickness, so a 0.5-thick slab showing a 4x0.34 bake stretches
   * it by half again and the strap's bolt heads come out as ovals. Scaling the
   * repeat length by the same factor scales the bake uniformly instead.
   */
  rimRepeat?: number;
  tableTextureId?: string;
  /** Soft darkening the slab casts onto the table. */
  shadowTextureId?: string;
  /** How far the table extends past the slab, in tiles. */
  tableMargin?: number;
  /** Tiles per repeat of the table's wood. */
  tableGrain?: number;
  frameTint?: Tint;
  rimTint?: Tint;
  tableTint?: Tint;
}

const SLAB_DEFAULTS = {
  border: 1.1,
  thickness: 0.34,
  tableMargin: 14,
  tableGrain: 7,
  rimRepeat: 4,
};

/**
 * Where the frame ring draws: after the table, before every tile.
 *
 * The one-quad frame never had to be told this. Its anchor is the slab's outer
 * corner, so every tile's `y` was strictly greater and the painter sort put it
 * first for free. A RING has a NEAR SIDE — the bottom edge and the two bottom
 * corners anchor past the last row of tiles and would therefore draw OVER the
 * board, painting timber across the front row of the dungeon. So the ordering
 * that used to fall out of the geometry now has to be stated. Half a layer,
 * so nothing else in `sprite.ts`'s ladder has to move.
 */
const LAYER_FRAME = LAYER_BOARD - 0.5;
/** The brass inlay and corner brackets, over their own timber. */
const LAYER_FRAME_BRASS = LAYER_BOARD - 0.4;

/** The rectangle the slab occupies, frame included, in tiles. */
export function slabBounds(o: BoardSlabOptions): { x: number; y: number; width: number; height: number } {
  const b = o.border ?? SLAB_DEFAULTS.border;
  return { x: -b, y: -b, width: o.width + b * 2, height: o.height + b * 2 };
}

/** One axis of the 3x3 cut: where each band starts, how wide it is, and the
 *  slice of the bake it shows. */
interface Band {
  at: number;
  size: number;
  t0: number;
  t1: number;
}

/**
 * Cut one axis of the bake into outer-band / stretched-middle / outer-band.
 *
 * `span` is the slab's extent on this axis in tiles and `at` its lower edge.
 * The two outer bands keep the bake's own proportions; only the middle moves.
 */
function frameBands(at: number, span: number, border: number): Band[] {
  const outer = BAKED_FRAME.play + BAKED_FRAME.border * 2;
  const tex = outer * BAKED_FRAME.margin;
  // The render leaves empty space around the slab, so the slab's own outer
  // edge is this far into the texture rather than at 0.
  const pad = (tex - outer) / 2;
  // Tiles per bake unit. The board's border may be wider than the 1.1 the
  // frame was modelled at, and everything scales off that one ratio.
  const k = border / BAKED_FRAME.border;
  const band = BAKED_FRAME.window * k;
  const near = (pad + BAKED_FRAME.window) / tex;
  const bands: Band[] = [{ at, size: band, t0: pad / tex, t1: near }];
  const middle = span - band * 2;
  // A board narrower than two windows has no middle at all. Skipped rather
  // than clamped: a negative-width quad draws inside out.
  if (middle > 0) bands.push({ at: at + band, size: middle, t0: near, t1: 1 - near });
  bands.push({ at: at + span - band, size: band, t0: 1 - near, t1: 1 - pad / tex });
  return bands;
}

/**
 * The baked frame as a ring of quads — timber first, then its brass.
 *
 * THE BRASS IS ITS OWN SPRITE ON PURPOSE, at the identical rect. `split()` in
 * `bake.py` renders `board_frame` and `board_frame_brass` from one assembly
 * through one camera frame precisely so the metal can be a separate draw: the
 * two halves carry different material maps (roughness 0.12 against 0.86), and
 * a single quad carrying both an oak rail and a brass inlay can only be one or
 * the other. Merging them back into one texture would throw away the entire
 * reason the bake is split.
 */
function frameRingSprites(
  slab: { x: number; y: number; width: number; height: number },
  border: number,
  windows: FrameWindows,
  tint?: Tint,
): Sprite[] {
  const cols = frameBands(slab.x, slab.width, border);
  const rows = frameBands(slab.y, slab.height, border);
  const ring = (textureId: string, layer: number): Sprite[] => {
    const out: Sprite[] = [];
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols.length; c++) {
        // The middle of the 3x3 is the play area, and the tile grid draws it.
        if (cols.length === 3 && rows.length === 3 && c === 1 && r === 1) continue;
        out.push({
          position: { x: cols[c].at, y: rows[r].at, z: 0 },
          size: { x: cols[c].size, y: rows[r].size },
          pivot: { x: 0, y: 0 },
          uv: { u0: cols[c].t0, v0: rows[r].t0, u1: cols[c].t1, v1: rows[r].t1 },
          textureId,
          tint,
          layer,
        });
      }
    }
    return out;
  };
  const out = ring(windows.textureId, LAYER_FRAME);
  if (windows.brassTextureId) out.push(...ring(windows.brassTextureId, LAYER_FRAME_BRASS));
  return out;
}

/**
 * Everything under and around the tile grid, in paint order.
 *
 * table -> the slab's shadow on it -> the frame -> (the caller's tiles) -> rim
 *
 * THE FRAME IS ONE QUAD, not a ring of four. Four strips need four different
 * chamfer directions and therefore four textures or a rotation the sprite
 * format does not have; one quad with a chamfer baked around all four sides
 * of its texture gets every edge at once, and the tile grid simply draws over
 * the middle of it. It sorts first among board-layer sprites without being
 * told to, because its anchor is the outer corner and every tile's y is
 * strictly greater.
 *
 * THE TABLE SITS AT -thickness. That is the whole trick for "the board is
 * proud of the table": the projection drops anything at negative z further
 * down the screen, so the table's surface appears below the board's, and the
 * rim quad fills the gap between them.
 */
export function boardSlabSprites(o: BoardSlabOptions, camera?: Camera): Sprite[] {
  const thickness = o.thickness ?? SLAB_DEFAULTS.thickness;
  const slab = slabBounds(o);
  const out: Sprite[] = [];

  if (o.tableTextureId) {
    // Sized to the view when there is one, because a table has to reach the
    // edge of frame or it is just a bigger board. Falls back to a generous
    // fixed margin so this stays usable headless.
    const margin = o.tableMargin ?? SLAB_DEFAULTS.tableMargin;
    const view = camera
      ? visibleBounds(camera, 2)
      : { minX: slab.x - margin, minY: slab.y - margin, maxX: slab.x + slab.width + margin, maxY: slab.y + slab.height + margin };
    const grain = o.tableGrain ?? SLAB_DEFAULTS.tableGrain;
    const w = view.maxX - view.minX;
    const h = view.maxY - view.minY;
    out.push({
      position: { x: view.minX, y: view.minY, z: -thickness },
      size: { x: w, y: h },
      pivot: { x: 0, y: 0 },
      // Wrapped, not stretched: the UV counts REPEATS, so the grain stays the
      // same physical size whatever the camera is doing.
      uv: { u0: 0, v0: 0, u1: w / grain, v1: h / grain },
      textureId: o.tableTextureId,
      tint: o.tableTint,
      layer: LAYER_TABLE,
    });
  }

  if (o.shadowTextureId) {
    // The slab's own shadow. A board lying on a table has a hard dark line
    // under its near edge and a soft one everywhere else, and this is the
    // cheap version: one soft rectangle a little larger than the slab. It is
    // a multiply, so it still reads when the table is nearly unlit.
    const spill = thickness * 1.6;
    out.push({
      position: { x: slab.x - spill, y: slab.y - spill, z: -thickness },
      size: { x: slab.width + spill * 2, y: slab.height + spill * 2 },
      pivot: { x: 0, y: 0 },
      uv: FULL_UV,
      textureId: o.shadowTextureId,
      tint: [0, 0, 0, 0.72],
      layer: LAYER_TABLE,
    });
  }

  // A REAL BAKE IF THERE IS ONE, the generated chamfer if there is not. The
  // fallback is not politeness: `web/public/art/materials/` is a build
  // artifact, so a fresh clone that has never run `npm run art:board` has no
  // frame at all, and the board it draws must be the one that shipped before
  // the bake existed rather than a hole.
  if (o.frameWindows) {
    out.push(...frameRingSprites(slab, o.border ?? SLAB_DEFAULTS.border, o.frameWindows, o.frameTint));
  } else {
    out.push({
      position: { x: slab.x, y: slab.y, z: 0 },
      size: { x: slab.width, y: slab.height },
      pivot: { x: 0, y: 0 },
      uv: FULL_UV,
      textureId: o.frameTextureId,
      tint: o.frameTint,
      layer: LAYER_BOARD,
    });
  }

  if (o.rimTextureId) {
    // The only face of the slab that has any area. In an orthographic,
    // axis-aligned projection the left and right sides are exactly edge-on
    // and the back is behind the board — so a rim is one quad, and the sides
    // are sold by the frame's chamfer catching the light instead.
    const repeat = o.rimRepeat ?? SLAB_DEFAULTS.rimRepeat;
    const uv = { u0: 0, v0: 0, u1: slab.width / repeat, v1: 1 };
    const face = (textureId: string): Sprite =>
      ledgeFace({
        x: slab.x,
        width: slab.width,
        y: slab.y + slab.height,
        top: 0,
        bottom: -thickness,
        textureId,
        uv,
        tint: o.rimTint,
      });
    out.push(face(o.rimTextureId));
    // The strap and its bolt heads, at the identical rect — see
    // `frameRingSprites` for why the metal is never merged into the timber.
    // Same position and size, so the stable painter sort keeps it on top.
    if (o.rimBrassTextureId) out.push(face(o.rimBrassTextureId));
  }

  return out;
}

/** Where to point a camera so the whole slab is in frame with room around it. */
export function frameTheBoard(o: BoardSlabOptions): { centre: Vec2 } {
  const slab = slabBounds(o);
  return { centre: { x: slab.x + slab.width / 2, y: slab.y + slab.height / 2 } };
}

// -------------------------------------------------------------------------
// PROCEDURAL TIMBER
// -------------------------------------------------------------------------

/** Deterministic, and deliberately not Math.random: the same board every run. */
function hash01(x: number, y: number): number {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Value noise on a TORUS.
 *
 * Periodic, not because it is elegant but because the table texture REPEATS.
 * Ordinary value noise leaves a visible seam at every repeat — and it is not
 * a subtle seam: the eye finds a straight line in a random field instantly,
 * so the first table came out looking like it was tiled with lino squares.
 * Wrapping the lattice at the period makes the pattern genuinely continuous
 * across the join, and costs two modulos.
 */
function periodicNoise(x: number, y: number, px: number, py: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = smooth(x - ix);
  const fy = smooth(y - iy);
  const wrap = (v: number, p: number) => ((v % p) + p) % p;
  const x0 = wrap(ix, px);
  const y0 = wrap(iy, py);
  const x1 = wrap(ix + 1, px);
  const y1 = wrap(iy + 1, py);
  const a = hash01(x0, y0);
  const b = hash01(x1, y0);
  const c = hash01(x0, y1);
  const d = hash01(x1, y1);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * `x` and `y` are in TEXTURE units (0..1 across the texture) times the
 * frequency, and the frequency doubles as the period — which is what keeps
 * every octave wrapping at the same place. Frequencies must therefore be
 * whole numbers; a fractional one tiles at some other interval and the seam
 * comes straight back.
 */
function fbm(u: number, v: number, fx: number, fy: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += periodicNoise(u * fx * f, v * fy * f, fx * f, fy * f) * amp;
    f *= 2;
    amp *= 0.5;
  }
  return sum;
}

export interface WoodOptions {
  /** Grain lines per texture width. */
  grain?: number;
  /** How much the grain wanders. 0 is a barcode. */
  warp?: number;
  /** sRGB colour of the darkest grain. */
  dark?: [number, number, number];
  /** sRGB colour of the lightest timber. */
  light?: [number, number, number];
}

const WOOD_DEFAULTS: Required<WoodOptions> = {
  grain: 9,
  warp: 2.6,
  dark: [34, 23, 16],
  light: [92, 63, 40],
};

/**
 * The wood pattern as a scalar field, 0 dark grain to 1 pale timber.
 *
 * Split out from the pixels because the ALBEDO and the NORMAL have to come
 * from the same field or the light picks out grain that is not in the paint —
 * the registration problem ENGINE_PLAN §7 spends a section on, in miniature
 * and for free, because here we own both.
 */
export function woodField(size: number, o: WoodOptions = {}): Float32Array {
  const opt = { ...WOOD_DEFAULTS, ...o };
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Grain runs along +x. The warp is what stops it being a barcode: the
      // lines bend around each other the way timber does around a knot.
      // `grain` is rounded because the ring function only wraps at whole
      // numbers of lines per texture, and a half line at the join is the
      // exact seam the periodic noise above exists to avoid.
      const lines = Math.max(1, Math.round(opt.grain));
      const g = v * lines + fbm(u, v, 3, 2) * opt.warp;
      const ring = Math.abs(g - Math.round(g)) * 2;
      const fine = fbm(u, v, 24, 8, 3) * 0.22;
      field[y * size + x] = clamp01(0.18 + ring * 0.62 + fine);
    }
  }
  return field;
}

/** Colour a scalar field between two sRGB endpoints. Alpha is opaque. */
export function fieldToAlbedo(
  field: Float32Array,
  size: number,
  dark: [number, number, number],
  light: [number, number, number],
): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const t = clamp01(field[i]);
    px[i * 4] = Math.round(dark[0] + (light[0] - dark[0]) * t);
    px[i * 4 + 1] = Math.round(dark[1] + (light[1] - dark[1]) * t);
    px[i * 4 + 2] = Math.round(dark[2] + (light[2] - dark[2]) * t);
    px[i * 4 + 3] = 255;
  }
  return px;
}

/**
 * Sobel a scalar height field into a tangent-space normal map.
 *
 * Wraps at the edges rather than clamping, because these textures REPEAT —
 * a clamped edge puts a seam of flat normals down the middle of the table
 * every `grain` tiles, which is the kind of artifact that is invisible in the
 * texture and glaring under a moving light.
 */
export function fieldToNormals(field: Float32Array, size: number, strength = 1): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => field[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx =
        at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      const dy =
        at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      const nx = -dx * strength;
      const ny = -dy * strength;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      const i = (y * size + x) * 4;
      px[i] = Math.round((nx / len) * 127.5 + 127.5);
      px[i + 1] = Math.round((ny / len) * 127.5 + 127.5);
      px[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
      px[i + 3] = 255;
    }
  }
  return px;
}

export interface FrameOptions extends WoodOptions {
  /** Chamfer width on the left and right edges, as a fraction of the texture. */
  borderU?: number;
  /** Chamfer width on the top and bottom edges. Separate, because the slab is
   *  not square and a single fraction would make one pair wider than the other. */
  borderV?: number;
  /** How far the chamfer tips the normal outward. */
  slope?: number;
  /** How much darker the chamfer paints. */
  shade?: number;
}

const FRAME_DEFAULTS = {
  borderU: 0.05,
  borderV: 0.075,
  slope: 1.5,
  shade: 0.45,
};

/**
 * How far into the chamfer a texel is, 0 flat and 1 at the outer edge.
 *
 * The whole slab's edge treatment reduces to this one number per axis, which
 * is why the frame can be a single quad instead of a ring of strips.
 */
function chamfer(u: number, border: number): number {
  const d = Math.min(u, 1 - u);
  return 1 - clamp01(d / Math.max(1e-4, border));
}

export function boardFramePixels(size: number, o: FrameOptions = {}): Uint8Array {
  const opt = { ...FRAME_DEFAULTS, ...o };
  const wood = { ...WOOD_DEFAULTS, ...o };
  const field = woodField(size, o);
  const px = fieldToAlbedo(field, size, wood.dark, wood.light);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = Math.max(chamfer((x + 0.5) / size, opt.borderU), chamfer((y + 0.5) / size, opt.borderV));
      if (t <= 0) continue;
      const shade = 1 - opt.shade * Math.pow(t, 1.4);
      const i = (y * size + x) * 4;
      px[i] = Math.round(px[i] * shade);
      px[i + 1] = Math.round(px[i + 1] * shade);
      px[i + 2] = Math.round(px[i + 2] * shade);
    }
  }
  return px;
}

/**
 * The frame's normals: timber grain everywhere, plus a chamfer that dominates
 * near the outer edge.
 *
 * The chamfer is what a bevel actually IS to a renderer. Painting a gradient
 * on the edge gives you an edge that looks the same from every light angle,
 * which is to say it looks painted. Tipping the normal outward gives you one
 * that brightens on the lantern's side and falls away on the other, and the
 * whole slab reads as having a machined edge the moment the hero walks past.
 */
export function boardFrameNormalPixels(size: number, o: FrameOptions = {}): Uint8Array {
  const opt = { ...FRAME_DEFAULTS, ...o };
  const px = fieldToNormals(woodField(size, o), size, 0.5);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;
      const tu = chamfer(u, opt.borderU);
      const tv = chamfer(v, opt.borderV);
      if (tu <= 0 && tv <= 0) continue;
      const i = (y * size + x) * 4;
      // Blend the grain out as the chamfer takes over, rather than adding to
      // it: a bevel is a shape, and grain riding over a shape at full
      // strength reads as a crumpled edge.
      const mix = Math.max(tu, tv);
      const gx = (px[i] / 127.5 - 1) * (1 - mix);
      const gy = (px[i + 1] / 127.5 - 1) * (1 - mix);
      const nx = gx + (u < 0.5 ? -1 : 1) * tu * tu * opt.slope;
      const ny = gy + (v < 0.5 ? -1 : 1) * tv * tv * opt.slope;
      const len = Math.sqrt(nx * nx + ny * ny + 1);
      px[i] = Math.round((nx / len) * 127.5 + 127.5);
      px[i + 1] = Math.round((ny / len) * 127.5 + 127.5);
      px[i + 2] = Math.round((1 / len) * 127.5 + 127.5);
    }
  }
  return px;
}

/**
 * The slab's SIDE, seen head-on. Grain runs across it, not along it.
 *
 * A rim that reuses the top's texture is the tell of a fake slab: the side of
 * a plank shows end grain and a couple of darker laminations, not the same
 * face pattern turned ninety degrees.
 */
export function boardRimPixels(size: number, o: WoodOptions = {}): Uint8Array {
  const wood = { ...WOOD_DEFAULTS, ...o };
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const lam = Math.abs(v * 3.2 - Math.round(v * 3.2)) * 2;
      const g = fbm(u, v, 14, 4, 3);
      // Darker at the very bottom, where the rim meets the table and no light
      // reaches, and at the very top, where the chamfer turns away.
      const occlude = clamp01(v * 3.2) * clamp01((1 - v) * 6);
      field[y * size + x] = clamp01((0.2 + lam * 0.42 + g * 0.3) * occlude);
    }
  }
  return fieldToAlbedo(field, size, wood.dark, wood.light);
}

export function boardRimNormalPixels(size: number): Uint8Array {
  const field = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const lam = Math.abs(v * 3.2 - Math.round(v * 3.2)) * 2;
      field[y * size + x] = clamp01(0.3 + lam * 0.4 + fbm(u, v, 14, 4, 3) * 0.3);
    }
  }
  return fieldToNormals(field, size, 0.7);
}

/** A darkening quad the caller can lay anywhere on the board. */
export function boardDecal(at: Vec2, size: Vec2, textureId: string, alpha: number): Sprite {
  return {
    position: { x: at.x, y: at.y, z: 0 },
    size,
    pivot: { x: 0, y: 0 },
    uv: FULL_UV,
    textureId,
    tint: [0, 0, 0, clamp01(alpha)],
    layer: LAYER_DECAL,
  };
}
