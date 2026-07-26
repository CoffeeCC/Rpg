// =========================================================================
// GAME PIECES — the base under a figure, and the shadow under the base.
//
// ENGINE_PLAN §1.2: "the hero and the monsters are pieces standing on it.
// Carved, painted, with thickness, casting contact shadows onto the board
// they stand on."
//
// M3 gave us `Sprite.upright`, which stands a figure up instead of laying it
// face-down like a printed counter. That was necessary and it is not
// sufficient, and the reason is worth stating precisely because it is the
// single strongest cue in the whole board-game look:
//
//   A STANDING SPRITE WITH NO CONTACT SHADOW READS AS A STICKER.
//
// However well it is lit. The eye decides "on the surface" versus "in front
// of the surface" almost entirely from the darkening where the two meet, and
// no amount of normal-mapped rim light substitutes for it. Absence of contact
// darkening reads as flat — the same observation ENGINE_PLAN §9.4 makes about
// height-field self-shadowing, one scale up.
//
// So a piece is three things, not one:
//
//   1. a CONTACT SHADOW — a disc on the board, darkest and tightest where the
//      piece meets it, wider and fainter the higher the piece's mass sits
//   2. a BASE — a low plinth with visible thickness, which is what a physical
//      game piece actually stands on and what gives it a footprint
//   3. the FIGURE itself, upright
//
// EVERYTHING HERE IS PURE. Sprite lists and pixel arrays, no GL, no DOM. The
// pixel generators return `Uint8Array`s that `gl/procedural.ts` uploads —
// which is what keeps the falloff law testable without a graphics context.
// =========================================================================

import type { Vec2 } from './camera';
import { LAYER_DECAL, type Sprite, type Tint, type UVRect } from './sprite';

const FULL_UV: UVRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// -------------------------------------------------------------------------
// THE FALLOFF LAW
// -------------------------------------------------------------------------

export interface ContactShadowOptions {
  /** Footprint radius in tiles, where the object touches down. */
  radius: number;
  /**
   * How far the object's MASS sits above the board, in tiles.
   *
   * Not the object's height — the height of the part that is doing the
   * occluding. A piece resting on the board is ~0.05; a card hovering on
   * pick-up is 0.3; a lantern hung from a bracket is 1.5.
   */
  height?: number;
  /** Peak darkness at contact, 0..1. 1 is a hole in the board. */
  strength?: number;
  /**
   * Tiles of lift over which the shadow doubles in width.
   *
   * Physically this is set by the light's angular size: a small flame makes
   * a shadow that stays tight a long way up, a broad window makes one that
   * spreads immediately. One number stands in for that here.
   */
  spread?: number;
}

export interface ContactShadowShape {
  /** Disc radius in tiles. */
  radius: number;
  /** Peak alpha at the centre, 0..1. */
  opacity: number;
}

/**
 * Height to width-and-darkness, and the reason both move together.
 *
 * The naive version scales only the radius, and it looks wrong in a way that
 * is hard to name until you see them side by side: a lifted object gets a
 * bigger shadow that is *just as dark*, which reads as the object having got
 * bigger rather than having lifted off. The same light is being blocked
 * either way, so spreading it over a wider disc has to make it fainter —
 * area goes as the square of the growth, so opacity goes as its inverse
 * square. That is the whole law, and it is why a hover reads as a hover.
 */
export function contactShadowShape(o: ContactShadowOptions): ContactShadowShape {
  const height = Math.max(0, o.height ?? 0);
  const spread = Math.max(1e-3, o.spread ?? 0.9);
  const grow = 1 + height / spread;
  return {
    radius: Math.max(1e-4, o.radius) * grow,
    opacity: clamp01((o.strength ?? 0.8) / (grow * grow)),
  };
}

// -------------------------------------------------------------------------
// SPRITES
// -------------------------------------------------------------------------

/**
 * The disc on the board under a piece.
 *
 * Drawn as an ordinary sprite with a BLACK albedo and an alpha gradient, and
 * that is not a shortcut — it is exactly a multiply. The lit shader outputs
 * `albedo.rgb * light` with `albedo.a` as the alpha, so a black texel under
 * the standard src-alpha blend leaves `dst * (1 - a)`. Occlusion of light,
 * computed in the HDR target before the tonemap, which is where occlusion
 * physically belongs. No second blend mode, no dedicated pass, and it behaves
 * identically on the unlit M1 path.
 */
export function contactShadowSprite(at: Vec2, textureId: string, o: ContactShadowOptions): Sprite {
  const shape = contactShadowShape(o);
  return {
    position: { x: at.x, y: at.y, z: 0 },
    size: { x: shape.radius * 2, y: shape.radius * 2 },
    pivot: { x: 0.5, y: 0.5 },
    uv: FULL_UV,
    textureId,
    tint: [0, 0, 0, shape.opacity],
    layer: LAYER_DECAL,
  };
}

export interface PieceBaseOptions {
  /** Plinth radius in tiles. */
  radius?: number;
  /** How tall the plinth is, in tiles. Small: this is a rim, not a pedestal. */
  thickness?: number;
  /** Colour of the plinth's top face. */
  tint?: Tint;
  /** Multiplier applied to `tint` for the side wall. Below 1; it faces down. */
  sideShade?: number;
  /** How far past the plinth the contact shadow spills. */
  shadowScale?: number;
  shadow?: Omit<ContactShadowOptions, 'radius'>;
}

const BASE_DEFAULTS = {
  radius: 0.4,
  thickness: 0.11,
  tint: [1, 1, 1, 1] as Tint,
  sideShade: 0.45,
  // Spills a good way past the plinth on purpose. At 1.2 the ring of contact
  // darkening is 20% of the radius, which at the shipping zoom is four pixels
  // — present in the data and invisible on screen, which is the worst of both.
  shadowScale: 1.45,
};

/**
 * Shadow, plinth side, plinth top — in paint order.
 *
 * THICKNESS WITHOUT NEW GEOMETRY. The side is the same disc drawn on the
 * board and the top is the same disc drawn at `z = thickness`; the projection
 * lifts the top one up the screen by `z * zoom * sin(tilt)` and what is left
 * showing underneath is a crescent. Which is precisely the silhouette of a
 * cylinder seen from a tilt — the top and bottom ellipses of a cylinder ARE
 * the same ellipse, offset. So one texture, two quads, and a real edge.
 *
 * The alternative was an upright quad for the side wall, which needs a second
 * texture, does not curve, and shows a hard corner where it meets the disc.
 */
export function pieceBaseSprites(
  at: Vec2,
  baseTextureId: string,
  shadowTextureId: string,
  o: PieceBaseOptions = {},
): Sprite[] {
  const radius = o.radius ?? BASE_DEFAULTS.radius;
  const thickness = o.thickness ?? BASE_DEFAULTS.thickness;
  const tint = o.tint ?? BASE_DEFAULTS.tint;
  const shade = o.sideShade ?? BASE_DEFAULTS.sideShade;
  const size = { x: radius * 2, y: radius * 2 };
  const pivot = { x: 0.5, y: 0.5 };

  const shadow = contactShadowSprite(at, shadowTextureId, {
    radius: radius * (o.shadowScale ?? BASE_DEFAULTS.shadowScale),
    // The plinth is what touches the board, so its own shadow starts at
    // contact height regardless of how tall the figure standing on it is.
    height: 0,
    ...o.shadow,
  });

  const disc = (z: number, t: Tint): Sprite => ({
    position: { x: at.x, y: at.y, z },
    size,
    pivot,
    uv: FULL_UV,
    textureId: baseTextureId,
    tint: t,
    layer: LAYER_DECAL,
  });

  return [
    shadow,
    disc(0, [tint[0] * shade, tint[1] * shade, tint[2] * shade, tint[3]]),
    disc(thickness, tint),
  ];
}

// -------------------------------------------------------------------------
// PROCEDURAL PIXELS
// -------------------------------------------------------------------------

/**
 * The contact-shadow disc, as RGBA8.
 *
 * RGB is zero everywhere — see `contactShadowSprite` for why black is the
 * whole trick. Only alpha carries a shape, and the shape is deliberately NOT
 * a linear ramp: a real contact shadow has a core that is essentially solid
 * and a penumbra that opens out from it, so the profile holds near 1 across
 * `core` and then eases to 0 at the rim. A linear ramp reads as an airbrushed
 * smudge, which is the tell of a fake shadow.
 */
export function contactShadowPixels(size = 96, core = 0.3): Uint8Array {
  const px = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      // smoothstep(core, 1, d) inverted: 1 inside the core, 0 at the rim.
      const t = clamp01((d - core) / Math.max(1e-4, 1 - core));
      const a = 1 - t * t * (3 - 2 * t);
      px[(y * size + x) * 4 + 3] = Math.round(clamp01(a) * 255);
    }
  }
  return px;
}

export interface DiscOptions {
  /** Where the bevel starts, as a fraction of the radius. */
  bevel?: number;
  /** Slope of the bevel, in normal-map terms. 0 flat, 1 nearly vertical. */
  slope?: number;
  /** sRGB base colour of the top face, 0..255. */
  colour?: [number, number, number];
  /** How much darker the bevelled rim paints, 0..1. */
  rimShade?: number;
}

const DISC_DEFAULTS: Required<DiscOptions> = {
  bevel: 0.68,
  slope: 0.85,
  // Turned oak, not ivory. The first pass used a near-white pewter and the
  // bases came out BRIGHTER than the floor they stand on — which reads as
  // three poker chips glued to a dungeon rather than as carved bases, because
  // the eye takes the brightest thing in frame as the subject.
  colour: [146, 128, 104],
  rimShade: 0.55,
};

/** Distance from centre, 0 at the middle and 1 at the disc's rim. */
function discR(x: number, y: number, size: number): number {
  const c = (size - 1) / 2;
  const dx = (x - c) / c;
  const dy = (y - c) / c;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * The plinth's albedo: a disc with a shaded rim, transparent outside.
 *
 * One texel of anti-aliasing at the silhouette, because the disc is drawn at
 * maybe 50 screen pixels across and a hard-cut alpha at that size reads as a
 * polygon rather than as a turned edge.
 */
export function baseDiscPixels(size = 128, o: DiscOptions = {}): Uint8Array {
  const opt = { ...DISC_DEFAULTS, ...o };
  const px = new Uint8Array(size * size * 4);
  const aa = 2 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = discR(x, y, size);
      const alpha = clamp01((1 - r) / aa);
      // Darken into the rim so the bevel reads even with the light behind it.
      const t = clamp01((r - opt.bevel) / Math.max(1e-4, 1 - opt.bevel));
      const shade = 1 - (1 - opt.rimShade) * t * t;
      const i = (y * size + x) * 4;
      px[i] = Math.round(opt.colour[0] * shade);
      px[i + 1] = Math.round(opt.colour[1] * shade);
      px[i + 2] = Math.round(opt.colour[2] * shade);
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

/**
 * The plinth's normal map: flat on top, sloping outward around the rim.
 *
 * This is what makes a base look TURNED rather than printed. The rim facing
 * the lantern catches a highlight and the far rim falls into shade, so the
 * disc gains a direction that changes as the piece moves — which a painted
 * gradient cannot do and which is the entire argument for M2 in miniature.
 *
 * Convention, stated because getting it wrong is invisible until the light
 * moves: the quad lies on the board, so texture +x is board +x and texture +v
 * (DOWN the image) is board +y, toward the camera. So the outward direction
 * at a pixel is simply its offset from the centre, unflipped.
 */
export function baseDiscNormalPixels(size = 128, o: DiscOptions = {}): Uint8Array {
  const opt = { ...DISC_DEFAULTS, ...o };
  const px = new Uint8Array(size * size * 4);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const r = Math.sqrt(dx * dx + dy * dy);
      const t = clamp01((r - opt.bevel) / Math.max(1e-4, 1 - opt.bevel));
      const lean = opt.slope * t * t;
      const inv = r > 1e-5 ? lean / r : 0;
      const nx = dx * inv;
      const ny = dy * inv;
      const nz = Math.sqrt(Math.max(1e-6, 1 - nx * nx - ny * ny));
      const i = (y * size + x) * 4;
      px[i] = Math.round((nx * 0.5 + 0.5) * 255);
      px[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      px[i + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      px[i + 3] = 255;
    }
  }
  return px;
}
