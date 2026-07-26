// =========================================================================
// THE PHYSICAL CARD — a hand, a deck and a discard pile, as a Scene.
//
// Third bridge file, same contract as `floorScene.ts` and `battleScene.ts`: it
// knows about both worlds and the whole of it is PURE. Boxes and numbers in,
// sprites and lights out. No GL, no DOM, no React, no clock but the `time` it
// is handed.
//
// -------------------------------------------------------------------------
// WHY THERE IS A SECOND CANVAS AT ALL
// -------------------------------------------------------------------------
//
// ENGINE_PLAN §1.2: THE GPU DRAWS EVERY SURFACE, THE DOM DRAWS TEXT AND HIT
// TARGETS. A card is a surface — `bake.py` models it as one: chamfered stock
// with a linen tooth, a gilt moulding standing proud of it, a sunken art
// window, an engine-turned back. None of that was being drawn. `.playing-card`
// is a CSS gradient with a 3px ridge border, which is the best a DOM element
// can do and is not a physical object.
//
// So this draws the card's BODY and the DOM keeps everything else: the name,
// the cost, the rules text, the art in the window, the hover lift, the fan, the
// click target, the nav registration. Exactly the arrangement the battlefield
// already uses for its combatants, one screen down.
//
// It cannot share the arena's canvas because it cannot share the arena's BOX:
// `.lantern-arena` is `inset: 0` inside `.battlefield`, and the hand lives in
// `.hand-zone`, a sibling that starts where the battlefield ends and whose fan
// rides 118px UP over it (`battle.css .hand-fan { margin-top: -118px }`). One
// canvas over the whole stage is the only shape that covers both, and a second
// camera is cheaper than making the arena's camera mean two things.
//
// -------------------------------------------------------------------------
// THE SAME MACHINERY, POINTED AT A DIFFERENT BOX
// -------------------------------------------------------------------------
//
// `battleScene.placeFigure` measures a `.bf-figure`'s rect and unprojects it, so
// a piece stands precisely where its DOM box stands. `placeCard` is that
// function with two differences, and both are forced by what a card IS:
//
//   IT IS HELD, NOT STOOD. A figure is anchored at its FEET — the bottom edge
//   of its box, which is where it meets the board. A card is anchored at its
//   CENTRE, because that is what its rotation turns about (`transform-origin`
//   defaults to 50% 50%) and a card pinned by its bottom edge would swing.
//
//   IT IS TURNED. `battle.css` fans the hand by 3.6 degrees a slot. See
//   `Sprite.rotate`, which exists for this.
//
// THE PAINT ORDER IS THE DOM'S, NOT THE BOARD'S, and that is the third
// difference. Pieces sort back-to-front by board y because they stand on a
// table and the far one is behind. A fanned hand is a STACK of held objects
// whose overlap is decided by DOM order and by nothing else — the card to the
// right laps the card to its left whatever the arc does to their screen
// heights. `sortForPainting` sorts by layer first, so handing each card its own
// layer reproduces that exactly, and the layers are the only thing in this file
// that would be wrong on a board.
// =========================================================================

import type { CardRarity } from '../engine/types';
import { DEFAULT_TILT, unproject, type Camera, type Vec2 } from '../lantern/scene/camera';
import { makeOccluderGrid, makeScene, type Light, type Material, type Scene } from '../lantern/scene/scene';
import { LAYER_PIECE, type Sprite, type UVRect } from '../lantern/scene/sprite';
import { emitterLight } from '../lantern/scene/emitters';

// -------------------------------------------------------------------------
// MATERIAL IDS — stated once so the builder and the loader cannot disagree
// -------------------------------------------------------------------------

/** The matte board. Chamfered edge, linen tooth, sunken window and panels. */
export const MAT_CARD_STOCK = 'card:stock';
/** The gilt: frame moulding, corner braces, art bezel, medallion, pip. */
export const MAT_CARD_BORDER = 'card:border';
/** The engine-turned rosette. What a deck and a discard pile show all game. */
export const MAT_CARD_BACK = 'card:back';

/**
 * The foil layer for one rarity.
 *
 * A lookup, not a mapping table, and `bake.py` shaped the bake to make it one:
 * the shape names ARE the engine's `CardRarity` strings, and `starter` and
 * `common` are emitted as all-black masks rather than omitted precisely so this
 * has no branch in it. A missing file is a special case somebody has to
 * remember; a mask with nothing in it is the same code path drawing nothing.
 *
 * FOIL IS A RARITY SIGNAL. Paul: *"that card agent isnt doing EVERY card in
 * holographic shiny foil is it? we need to distinguish between rarer cards and
 * common cards using that technique"*. The shine only means something against a
 * baseline that does not have it, so the two ordinary tiers publish as fully
 * transparent images and draw nothing at all.
 */
export function cardFoilId(rarity: CardRarity): string {
  return `card:foil:${rarity}`;
}

/** Bake name for a material id, for the loader. Mirrors `cardFoilId`. */
export function cardFoilBakeName(rarity: CardRarity): string {
  return `card_foil_${rarity}`;
}

/** Every rarity the engine can select. `bake.py` also bakes a `star` tier;
 *  `CardRarity` has no member for it, so nothing here can ask for it. */
export const CARD_RARITIES: readonly CardRarity[] = ['starter', 'common', 'uncommon', 'rare'];

// -------------------------------------------------------------------------
// WHAT THE COMPONENT MEASURED
// -------------------------------------------------------------------------

/**
 * One card, as its DOM box plus what to paint in it.
 *
 * `w`/`h` are the LAID-OUT size with the transform's scale already applied, not
 * the bounding box of the turned rect — those differ by 17% on a card turned
 * seven degrees, and the bounding box is the wrong one. See
 * `decomposeTransform` for where the scale comes from.
 */
export interface CardBox {
  /** Stable across frames, so a future animation can track one card. */
  key: string;
  /** Centre of the card, px from the host's top-left. */
  cx: number;
  cy: number;
  /** On-screen size in px, transform scale applied. */
  w: number;
  h: number;
  /** Screen rotation, radians, clockwise. */
  rotate: number;
  /**
   * Which foil the face carries, or null for a card lying face DOWN — the draw
   * pile, the discard pile, the rival tamer's hand.
   */
  rarity: CardRarity | null;
  /** Unplayable: `.playing-card.unplayable` greys the DOM, this greys the body. */
  dim?: boolean;
}

/**
 * A card's place on the board, in tiles.
 *
 * The mirror of `battleScene.FigurePlacement`, and the same inverse trick:
 * `width` divides by `zoom` and `height` by `zoom * sin(tilt)` because that is
 * exactly what `buildVertexData` multiplies them back by for a standing quad,
 * so a card draws at the pixel size the DOM reserved for it whatever the tilt.
 */
export interface CardPlacement {
  key: string;
  /** Centre of the card, in tiles. `z` is height above the board. */
  at: Vec2;
  z: number;
  width: number;
  height: number;
  rotate: number;
}

// -------------------------------------------------------------------------
// THE CAMERA
// -------------------------------------------------------------------------

/**
 * THE TILT IS THE ARENA'S, AND IT HAS TO BE.
 *
 * A card is a BILLBOARD, and `lighting.ts` reconstructs a billboard's world
 * normal from the tangent-space map using `uTilt` — the basis is
 * `(1,0,0)`, `(0,-cos,sin)`, `(0,sin,cos)`. `bake.py`'s `billboard_basis()`
 * encodes the normal pass against those same three axes at `DEFAULT_TILT_DEG`.
 * Bake at one angle and decode at another and every chamfer on the card lights
 * as though it were cut at a different angle — plausible, and wrong, which
 * `bake.py`'s header names as the failure mode that costs the most time.
 */
export const CARD_TILT = DEFAULT_TILT;

/**
 * ONE BOARD UNIT IS ONE HAND CARD WIDE, which is not an arbitrary choice.
 *
 * `bake.py` frames every card shape at 1.0 x 1.4 board units and measures every
 * panel inside it against a 132px reference card. Making a hand card exactly one
 * unit wide means the world this scene lights is the world the bake was drawn
 * in: a light "one tile away" is a light one card away, the grating's 4px pitch
 * lands on 4px, and every number below can be read as a fraction of a card.
 *
 * It also makes the zoom a MEASUREMENT rather than a constant, so the whole
 * scene follows `battle.css`'s five card breakpoints for free. The fallback is
 * only ever used for the frame where the hand is empty and no card has been
 * measured, and a plausible world beats a degenerate one.
 */
export const CARD_FALLBACK_ZOOM = 132;
export const MIN_CARD_ZOOM = 24;
export const MAX_CARD_ZOOM = 640;

export function clampCardZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return CARD_FALLBACK_ZOOM;
  return Math.min(MAX_CARD_ZOOM, Math.max(MIN_CARD_ZOOM, zoom));
}

/**
 * The camera the cards are drawn through.
 *
 * Centred on board (0, 0), so the middle of the canvas is the origin and a card
 * measured at the top-left of the stage lands at negative board coordinates.
 * That is fine and it is why nothing here indexes a grid by position.
 */
export function cardCamera(viewport: Vec2, cardWidthPx: number | null): Camera {
  return {
    centre: { x: 0, y: 0 },
    zoom: clampCardZoom(cardWidthPx && cardWidthPx > 1 ? cardWidthPx : CARD_FALLBACK_ZOOM),
    tilt: CARD_TILT,
    viewport: { x: Math.max(1, viewport.x), y: Math.max(1, viewport.y) },
  };
}

/**
 * A measured DOM box, as a card held above the board.
 *
 * DEGENERATE BOXES YIELD NOTHING, NEVER A NaN. A hand mid-deal, a slot being
 * unmounted as a card is played, a `.playing-card` measured before its width
 * has resolved — all hand over a zero-size or non-finite rect, and a single NaN
 * vertex reaches the camera and blanks the canvas permanently. `null` here is
 * the caller's cue to draw no card at all, which is a missing card for one
 * frame instead of a dead canvas for the rest of the session.
 */
export function placeCard(box: CardBox, cam: Camera): CardPlacement | null {
  if (!Number.isFinite(box.cx) || !Number.isFinite(box.cy)) return null;
  if (!Number.isFinite(box.w) || !Number.isFinite(box.h)) return null;
  if (box.w < 2 || box.h < 2) return null;
  const sin = Math.max(1e-3, Math.sin(cam.tilt));
  const width = box.w / cam.zoom;
  const height = box.h / (cam.zoom * sin);
  // HALF THE CARD'S HEIGHT UP, and the unprojection has to agree with it.
  // `project` subtracts `z * zoom * sin(tilt)` from the screen y, so a card
  // placed at height z but unprojected at 0 draws that far up the screen —
  // which is 76px at the shipping tilt on a 185px card, i.e. most of a card.
  // Unprojecting at the height it will be placed at is what makes the round
  // trip exact.
  const z = height / 2;
  const at = unproject({ x: box.cx, y: box.cy }, cam, z);
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  return {
    key: box.key,
    at,
    z,
    width,
    height,
    rotate: Number.isFinite(box.rotate) ? box.rotate : 0,
  };
}

// -------------------------------------------------------------------------
// THE TRANSFORM — reading a fan off the DOM without believing its bounding box
// -------------------------------------------------------------------------

/**
 * A CSS transform string as the uniform scale and rotation it carries.
 *
 * `getBoundingClientRect()` IS NOT THE CARD. It is the axis-aligned box AROUND
 * the card, and a hand card is turned: at the 7.2 degrees a five-card fan puts
 * on its outer slots, a 132x185 card measures 154x200 — 17% too wide and 8% too
 * tall. Draw that and the gilt frame stands a dozen pixels outside the printing
 * it is supposed to surround.
 *
 * The bounding box also cannot recover the SIGN of the rotation, because it is
 * built from `|sin|` and `|cos|` and a fan turns one way on the left and the
 * other on the right. So the angle is read from the transform itself, where it
 * is stated, rather than solved out of a box that has thrown half of it away.
 *
 * Pure, and separated from the DOM read for exactly that reason: every case
 * below is a string this function was handed, and none of them needs a browser.
 */
export function decomposeTransform(css: string | null | undefined): { scale: number; rotate: number } {
  const identity = { scale: 1, rotate: 0 };
  if (!css) return identity;
  const trimmed = css.trim();
  if (trimmed === '' || trimmed === 'none') return identity;
  const open = trimmed.indexOf('(');
  const close = trimmed.lastIndexOf(')');
  if (open < 0 || close < open) return identity;
  const kind = trimmed.slice(0, open);
  if (kind !== 'matrix' && kind !== 'matrix3d') return identity;
  const parts = trimmed
    .slice(open + 1, close)
    .split(',')
    .map((n) => Number.parseFloat(n));
  if (parts.some((n) => !Number.isFinite(n))) return identity;
  // `matrix(a, b, c, d, e, f)` and `matrix3d`'s first column are the same two
  // numbers: where the element's own +x axis ended up. Length is the scale
  // along it, angle is the rotation, and both come out signed.
  if (kind === 'matrix' ? parts.length !== 6 : parts.length !== 16) return identity;
  const a = parts[0];
  const b = parts[1];
  const scale = Math.hypot(a, b);
  if (!Number.isFinite(scale) || scale <= 1e-4) return identity;
  return { scale, rotate: Math.atan2(b, a) };
}

/**
 * Two transforms stacked, as one.
 *
 * A hand card wears both: `battle.css` turns the SLOT to fan it and lifts it on
 * hover, and the card inside breathes on its own 4.4s cycle. Composing them
 * here is what stops the drawn body sliding against the printed face as the
 * card breathes — a 3px drift on a 185px card, once every four seconds, which
 * is exactly the kind of motion the eye catches and cannot name.
 */
export function composeTransforms(
  ...transforms: readonly { scale: number; rotate: number }[]
): { scale: number; rotate: number } {
  let scale = 1;
  let rotate = 0;
  for (const t of transforms) {
    scale *= t.scale;
    rotate += t.rotate;
  }
  return { scale, rotate };
}

// -------------------------------------------------------------------------
// THE LOOK
// -------------------------------------------------------------------------

/**
 * How dark an unplayable card goes.
 *
 * `.playing-card.unplayable` is `filter: grayscale(0.7) brightness(0.6)`, which
 * now only reaches the DOM's own layer — the text and the art. Without this the
 * body would stay lit and gilded under greyed-out printing, which reads as a
 * rendering fault rather than as "you cannot afford this".
 */
export const CARD_DIM_TINT: readonly [number, number, number, number] = [0.44, 0.43, 0.46, 1];

/**
 * THE LANTERN OVER THE HAND, and where it sits is the whole feature.
 *
 * A billboard's surface normal IS the view direction (`Sprite.billboard`), so a
 * light has to stand between the cards and the viewer to land on them square. In
 * board terms the viewer is at `(0, sin(tilt), cos(tilt))` from any card, so the
 * light hangs along that axis: `LANTERN_FRONT` tiles toward the near edge of the
 * table and `LANTERN_LIFT` tiles up. Put it straight overhead instead — the
 * obvious staging — and it arrives near edge-on and the whole hand goes matte,
 * which is the same mistake `battleScene.LANTERN_HEIGHT` records paying for.
 *
 * ONE CARD WIDTH AND A HALF away, so the falloff still has something to say
 * across a five-card fan: the middle of the hand catches the highlight and the
 * outer slots are a third of the way down the curve. A light far enough away to
 * light every card equally is a light that says nothing about which card you
 * are looking at.
 */
export const LANTERN_FRONT = 1.22;
export const LANTERN_LIFT = 0.86;
export const LANTERN_REACH = 4.4;

/**
 * AND IT IS PUSHED OFF THE VIEW AXIS, which is the difference between a foil
 * card and a yellow rectangle.
 *
 * A billboard's normal IS the view direction, so a light standing exactly on
 * that axis puts the half-vector on the normal at EVERY pixel: `dot(N, H)` is
 * 1 across the whole card, the specular lobe is at its peak everywhere at once,
 * and the result is a uniform wash that no amount of gloss will break up. That
 * was the first cut, and it read as flat gold plastic — measured, a scanline
 * across the 7px moulding came back 198, 208, 207, 205, 202, 208, 203, which is
 * a 2.5% modulation over a feature that is two beads and a sunken channel.
 *
 * More importantly it is what kills the grating. A groove has two flanks that
 * tilt the normal by equal and opposite amounts, and `dot(N, H)` is an even
 * function of that tilt — with H on N the two flanks land on the SAME band and
 * the diffraction cancels itself out. Off-axis, one flank turns toward the half
 * vector and the other away, and the pitch becomes visible as bands.
 *
 * 0.55 tiles at 1.5 tiles' distance is about 20 degrees, which is the window
 * where both things are true: the lobe still fires (`pow(0.985, 198)` is 0.05,
 * small but real) and the flanks are separated. The sway then walks it between
 * roughly 9 and 30 degrees, so the bands travel rather than sit.
 */
export const LANTERN_SIDE = 0.55;

/**
 * Peak radiance for the hand's lantern.
 *
 * MEASURED DOWN FROM 5.2, which put the gilt at 198/166/80 against a GILT
 * albedo of about 201/163/41 in sRGB — i.e. the diffuse term alone was landing
 * at 1.5, everything was pinned to the top of the AgX curve, and every feature
 * on the card was compressed into the same value. The specular that was
 * supposed to be the whole read was adding 0.25 to something already clipped.
 *
 * At 1.9 the gilt's diffuse lands near 0.55, which leaves most of the curve
 * above it for the highlight and the holo to be EVENTS in rather than
 * additions to.
 */
export const LANTERN_INTENSITY = 1.9;

/**
 * AND IT SWINGS, which is not decoration.
 *
 * Iridescence is a function of `dot(N, H)`, so it only resolves into moving
 * bands when the light, the surface or the eye moves. Nothing on this screen
 * moves any of them: the camera is fixed, the cards are held still, and
 * `Sprite.rotate` deliberately leaves the tangent frame alone. A holo that never
 * sweeps is not holo, it is glitter — which is the exact failure `bake.py` chose
 * the 4px grating pitch to avoid, arrived at from the other direction.
 *
 * So the lantern hangs on a cord. Two incommensurate periods, so it never
 * repeats a figure the eye can learn, and an amplitude under half a card, so it
 * reads as a hanging light breathing rather than as something sliding about.
 */
export const LANTERN_SWAY_X = 0.3;
export const LANTERN_SWAY_Y = 0.18;

export function lanternSway(time: number): Vec2 {
  return {
    x: Math.sin(time * 0.61) * LANTERN_SWAY_X,
    y: Math.sin(time * 0.37 + 1.7) * LANTERN_SWAY_Y,
  };
}

// -------------------------------------------------------------------------
// THE BUILD
// -------------------------------------------------------------------------

export interface CardSceneOptions {
  camera: Camera;
  /** Seconds. Drives the swing; a fixed value gives a fixed frame. */
  time: number;
  /** Only ids present here are drawn — an unloaded texture is silently skipped. */
  materials: Map<string, Material>;
  cards: readonly CardBox[];
  ambient?: number;
  lanternIntensity?: number;
}

const FULL_UV: UVRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * One frame of a hand, as a Scene. Rebuilt from state, never mutated.
 *
 * FOUR LAYERS PER CARD AND THEY MUST NOT BE BATCHED ACROSS CARDS. Drawing every
 * stock, then every border, then every foil would be three draw calls for the
 * whole hand instead of three per card — and it would be wrong, because the
 * cards OVERLAP. `battle.css` laps each hand slot 44px over the one before it,
 * so a neighbour's stock would paint over this card's gilt. Per-card layers are
 * what `batchGroups` reads, and it merges only ADJACENT runs, so the order this
 * function emits is the order the GPU draws.
 */
export function buildCardScene(o: CardSceneOptions): Scene {
  const cam = o.camera;
  const has = (id: string) => o.materials.has(id);
  const sprites: Sprite[] = [];
  const lights: Light[] = [];

  let sumX = 0;
  let sumY = 0;
  let minZTop = Infinity;
  let placed = 0;

  for (let i = 0; i < o.cards.length; i++) {
    const box = o.cards[i];
    const p = placeCard(box, cam);
    // A degenerate rect yields NO SPRITE. See `placeCard`.
    if (!p) continue;
    placed++;
    sumX += p.at.x;
    sumY += p.at.y;
    minZTop = Math.min(minZTop, p.z * 2);

    const tint = box.dim
      ? ([CARD_DIM_TINT[0], CARD_DIM_TINT[1], CARD_DIM_TINT[2], CARD_DIM_TINT[3]] as [
          number,
          number,
          number,
          number,
        ])
      : undefined;
    // One layer per card, in the order the caller listed them — which is the
    // order the DOM stacks them. See the header.
    const layer = LAYER_PIECE + i;
    const quad = (textureId: string): Sprite => ({
      position: { x: p.at.x, y: p.at.y, z: p.z },
      size: { x: p.width, y: p.height },
      // CENTRE, not bottom-centre: a card turns about its middle.
      pivot: { x: 0.5, y: 0.5 },
      billboard: true,
      rotate: p.rotate,
      uv: FULL_UV,
      textureId,
      tint,
      layer,
    });

    if (box.rarity === null) {
      if (has(MAT_CARD_BACK)) sprites.push(quad(MAT_CARD_BACK));
      continue;
    }
    if (has(MAT_CARD_STOCK)) sprites.push(quad(MAT_CARD_STOCK));
    if (has(MAT_CARD_BORDER)) sprites.push(quad(MAT_CARD_BORDER));
    const foil = cardFoilId(box.rarity);
    if (has(foil)) sprites.push(quad(foil));
  }

  // --- the light ---------------------------------------------------------
  // Hung over the middle of whatever was actually measured, so it follows the
  // hand rather than a hardcoded corner of a viewport it cannot see. With
  // nothing measured there is nothing to light, and a light with no receivers
  // is a light that only costs a bin.
  if (placed > 0) {
    const sway = lanternSway(o.time);
    const cx = sumX / placed + LANTERN_SIDE + sway.x;
    const cy = sumY / placed;
    const top = Number.isFinite(minZTop) ? minZTop : 1.4;
    lights.push(
      emitterLight(
        {
          x: cx,
          y: cy + LANTERN_FRONT + sway.y,
          z: top * 0.5 + LANTERN_LIFT,
        },
        {
          // WARM, BUT NOT THE ARENA'S FLAME. The board's lantern is
          // (1, 0.66, 0.33) because it is a candle in a dungeon and the
          // dungeon is the point. This one is held at arm's length over the
          // cards, and it multiplies the holo: a rainbow through a
          // strongly orange lamp has no blue end, because the lamp has none to
          // give. Pulling it toward white keeps the room warm and lets the
          // grating show the colours it separates.
          colour: [1, 0.86, 0.66],
          intensity: o.lanternIntensity ?? LANTERN_INTENSITY,
          reach: LANTERN_REACH,
          radius: 0.18,
          // Steady. The SWING is the motion here, and a light that also
          // guttered would make the foil twinkle instead of sweep — which is
          // the sparkle the grating pitch was chosen to avoid.
          flicker: 0,
          time: o.time,
        },
      ),
    );
    // A cool fill from the far side, so a card the lantern has swung away from
    // is dim rather than black. Same job the arena's room lamp does, and the
    // same argument: the room the board is sitting in is outside the fiction,
    // it falls on everything, and nothing in the fiction occludes it.
    lights.push({
      position: { x: cx - 5.5, y: cy + 3.4, z: top + 5 },
      colour: [0.62, 0.7, 1],
      // Small, and it fought the lantern at 0.5. A fill this broad lands at
      // nearly the same angle on every card, so what it adds is exactly the
      // flat wash the ambient was already adding too much of — it is here to
      // keep a card the lantern has swung away from legible as an object, not
      // to be a second key.
      intensity: 0.22,
      radius: 1.2,
      reach: 22,
      castsShadow: false,
    });
  }

  return makeScene(cam, {
    sprites,
    materials: o.materials,
    // AN OCCLUDER GRID WITH NOTHING IN IT, AND IT IS NOT A FORMALITY — the
    // same trap `battleScene.ts` records at length. `renderer.ts` reads
    //
    //     useLighting = opts.lit && lights.length > 0 && scene.occluders !== null
    //
    // so `occluders: null` does not mean "nothing blocks light", it means NOT
    // LIT AT ALL, and the whole hand comes back at flat albedo — which looks
    // exactly like a lantern turned up too far.
    //
    // ONE TILE is the whole grid, and that is the honest size. There is no
    // board here: a hand is held in front of the table, every light in this
    // scene is `castsShadow: false`, and `traceShadow` bounds-checks before it
    // samples, so a bigger grid would be zeroes nothing ever reads.
    occluders: makeOccluderGrid(1, 1),
    occluderHeight: 1,
    lights,
    time: o.time,
    // A hair over the arena's 0.07, and the first pass ran it at 0.42 on the
    // argument that a card has to be READ. That argument is wrong here and it
    // is worth recording why: the reading matter is DOM — the name, the cost,
    // the rules text and the art all sit on top of this canvas and are not lit
    // by it at all. What the ambient reaches is the stock and the gilt, and at
    // 0.42 it drowned them: the frame came back a flat slab of saturated
    // yellow with no bead, no channel and no chamfer, which is what a moulding
    // looks like when the light doing the shaping is 60% of the total.
    ambient: o.ambient ?? 0.11,
  });
}
