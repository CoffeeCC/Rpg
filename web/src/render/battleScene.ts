// =========================================================================
// THE ARENA — a fight, as a Scene.
//
// Second bridge file, same contract as `floorScene.ts`: it is the only kind of
// module allowed to know about both worlds, and the whole of it is PURE. Boxes
// and numbers in, sprites and lights out. No GL, no DOM, no React, no clock but
// the `time` it is handed.
//
// -------------------------------------------------------------------------
// THE DECISION THAT SHAPES THIS FILE: THE BOARD IS SOLVED, NOT LAID OUT.
// -------------------------------------------------------------------------
//
// The map port (ENGINE_PLAN §20) rests on one trick: the board plane's
// projection is AFFINE, so the DOM can keep rendering a square lattice at a
// fixed pitch and ONE CSS transform carries the whole thing onto the projected
// board. That works because the map HAS a lattice — 300 identical cells at a
// known pitch.
//
// A battlefield has no lattice. `.bf-row` is a flex row of units whose widths
// come from `--bf-scale`, the plate's `min-width`, the length of a monster's
// name and how many escorts the pack rolled. There is no pitch to carry.
//
// So the same affine map is used in the OTHER DIRECTION. It is exactly
// invertible (`camera.unproject`), which means:
//
//   * the DOM lays the fight out exactly as it always has — same rows, same
//     gaps, same `--bf-scale` ladder, same plates, same badges;
//   * the renderer MEASURES the two feet lines and solves for the one camera
//     that puts its two authored RANKS on them;
//   * every figure's own box is then unprojected through that camera, so a
//     piece stands precisely where its DOM box stands.
//
// Two anchors, two unknowns, one linear solve:
//
//     partyFeetPx - enemyFeetPx = (PARTY_RANK - ENEMY_RANK) * zoom * cos(tilt)
//     enemyFeetPx               = (ENEMY_RANK - cy) * zoom * cos(tilt) + vh/2
//
// which is `arenaCamera` below. Everything else — the slab, the frame, the rim,
// the table it is sitting on, the candles, the backdrop standing behind it — is
// authored in TILES against that camera and lands wherever the solve puts it.
//
// The payoff is the same as the map's and it is worth naming: `nav/` is
// untouched, the two heal-aim registrations (§8 item 3) are untouched,
// `document.elementFromPoint(...).closest('[data-enemy-uid]')` (§8 item 4) is
// untouched, and the aim line — which is built from `getBoundingClientRect()`
// of a hand slot and an enemy div — keeps aiming at exactly the thing that is
// drawn, because the thing that is drawn was placed from that rect.
//
// -------------------------------------------------------------------------
// AND IT IS WHERE §8 ITEM 9 STOPS BEING A CHEAT
// -------------------------------------------------------------------------
//
// `lighting.css:762-815` lights the arena by counting lit candles in the HUD
// with a CSS `:has()` selector — a HUD-reads-world data path that exists
// nowhere in TypeScript. ENGINE_PLAN §1.2: "on a board, the candle rail is a
// rail of candles sitting on the board, and of course it lights the board. The
// cheat becomes the mechanism."
//
// So `vigor` is an explicit input here, `candleRail` turns it into real candles
// standing on the board at real positions, and each burning one is a real
// `Light`. Nothing reads the DOM to find out how bright the room is.
// =========================================================================

import { DEFAULT_TILT, unproject, type Camera, type Vec2, type Vec3 } from '../lantern/scene/camera';
import { makeOccluderGrid, makeScene, type Light, type Material, type Scene } from '../lantern/scene/scene';
import { LAYER_BOARD, LAYER_DECAL, type Sprite, type UVRect } from '../lantern/scene/sprite';
import { contactShadowSprite, pieceBaseSprites } from '../lantern/scene/piece';
import { boardSlabSprites } from '../lantern/scene/board';
import { emitterLight, flicker, glowLightPosition } from '../lantern/scene/emitters';

// -------------------------------------------------------------------------
// MATERIAL IDS — stated once so the builder and the loader cannot disagree
// -------------------------------------------------------------------------

export const MAT_ARENA = 'arena';
export const MAT_BACKDROP = 'backdrop';
export const MAT_CANDLE = 'candle';
/**
 * The brass cup a candle stands in. §19.1: "a candle resting on bare timber is
 * a candle someone left there" — the socket is what makes it placed rather than
 * dropped, the same argument §15 makes for the plinth.
 *
 * Drawn whether or not a candle is in it, which is the whole point: an EMPTY
 * socket is how the opponent's rail says "this one does not spend what you
 * spend". Baked by `tools/art/blender/bake.py`; until it exists `has()` is
 * false and the rail simply has no cups, which is the previous look.
 */
export const MAT_SOCKET = 'socket';
export const MAT_BLANK = 'bf-blank';

export function monsterTextureId(speciesId: string): string {
  return `monster:${speciesId}`;
}
export function heroTextureId(className: string): string {
  return `hero:${className}`;
}

// -------------------------------------------------------------------------
// THE AUTHORED BOARD
// -------------------------------------------------------------------------

/**
 * Where the two ranks stand, in tiles from the board's far edge.
 *
 * These are the only two authored numbers in the whole layout, and everything
 * else is measured against them. Their DIFFERENCE is what sets the zoom (see
 * the header), so it is the number that decides how big a piece draws relative
 * to the gap between the lines: further apart means a smaller zoom means
 * smaller pieces on a deeper board.
 *
 * MEASURED, not guessed. At 1280x860 the battlefield box is 446px tall and the
 * two feet lines come in 220px apart, so 3 tiles of separation puts the zoom
 * near 128px a tile — which leaves 3.05 tiles of board above the enemy rank.
 * That is the number that matters, because it is the room the painted flat and
 * the far end of the board have to fit into. The first cut used 2.8 and there
 * was nothing above the enemies but floor running off the top of frame.
 */
export const ENEMY_RANK = 1.35;
export const PARTY_RANK = 4.35;

/** Play area depth in tiles. The near rows run off the bottom of frame. */
export const ARENA_DEPTH = 6;
/** Frame width around the play area, in tiles. */
export const ARENA_BORDER = 1.2;
/** Slab thickness — what the rim shows. Thicker than the map's: it is closer. */
export const ARENA_THICKNESS = 0.45;
/**
 * Where the slab's near edge paints on THIS board. See `rimLayer`'s doc in
 * `lantern/scene/board.ts` — a quarter-layer under the tiles, which is under
 * the console fittings that sit past it.
 */
export const ARENA_RIM_LAYER = LAYER_BOARD - 0.25;
/**
 * Where the painted flat stands in the ladder: over the floor, under every
 * fitting and every piece. See its call site in `buildBattleScene`.
 */
export const BACKDROP_LAYER = LAYER_BOARD + 0.5;
/**
 * Where `console_body` paints: above the floor/slab (the tiles, the frame,
 * the rim), below every one of §19.1's six DOM-anchored fittings.
 *
 * BETWEEN `LAYER_BOARD` and `LAYER_DECAL`, same trick `ARENA_RIM_LAYER` and
 * `BACKDROP_LAYER` already use and for the same reason: the fittings this
 * panel sits under are measured off live DOM rects this file does not
 * control the `y` of, so their unprojected board `y` cannot be trusted to
 * land ahead of the panel's own `y` in a plain y-sort. Pinning the ORDER by
 * layer is what §22.3's two paint-order bugs — the rim over the fittings,
 * the backdrop over the log well — were both fixed by, and this is the same
 * fix applied before either mistake had the chance to happen a third time.
 */
export const CONSOLE_BODY_LAYER = LAYER_BOARD + 0.75;

/**
 * Zoom guard rails.
 *
 * The solve divides by a measured pixel distance, so a mid-transition layout
 * (a row that has not been laid out yet, a stage animating in) can hand it a
 * near-zero separation. Clamping means the worst case is a badly-framed board
 * for one frame rather than a division that produces Infinity and a scene full
 * of NaN vertices, which is silent and looks like a dead canvas.
 */
export const MIN_ARENA_ZOOM = 26;
export const MAX_ARENA_ZOOM = 320;

/** Plinth radius as a fraction of the figure's measured width. */
export const PLINTH_FRACTION = 0.32;

/** How tall the painted flat stands, in tiles. Tall enough to fill the gap
 *  between the board's far edge and the top of frame at every viewport. */
export const BACKDROP_TILES = 2.6;

// -------------------------------------------------------------------------
// THE SOLVE
// -------------------------------------------------------------------------

/** What the component measured off the live battlefield, in CSS px. */
export interface FieldAnchors {
  /** The `.battlefield` box, in CSS px. */
  viewport: Vec2;
  /** Feet line of the enemy row, px from the field's top edge. Null = guess. */
  enemyFeet: number | null;
  partyFeet: number | null;
  tilt?: number;
}

export function clampArenaZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_ARENA_ZOOM;
  return Math.min(MAX_ARENA_ZOOM, Math.max(MIN_ARENA_ZOOM, zoom));
}

/**
 * How many whole tiles of play area the frame costs, each side.
 *
 * TWO, and it is forced by something outside this file: `.bf-rail` is an
 * OPAQUE HUD panel that overlaps the left of the canvas, about 190 device px
 * of it. The candle rail has to clear that plate or it is drawn and invisible,
 * which is the exact failure the first attempt hit from the other direction.
 * Measured at 1280x820: an inset of 1 puts the rail at screen x 62.6, behind
 * the plate; an inset of 2 puts it at 174 and it reads.
 *
 * IT IS NOT FREE, and the cost is recorded here rather than discovered later.
 * The field drops from 10 tiles to 6 at this viewport, and figures are placed
 * by UNPROJECTING their DOM boxes — the DOM row keeps its full width whatever
 * the board does, so the canvas edges now sit at board x -2.14 and 8.14. A
 * single enemy is centred and fine; a wide enough enemy row would stand its
 * outer pieces on the frame. The real fix is for the canvas to stop extending
 * under the opaque rail, at which point this can drop back to 1.
 */
export const FRAME_INSET_TILES = Math.ceil(ARENA_BORDER);

/**
 * How wide the play area is, in whole tiles.
 *
 * Whole, because the floor is drawn as unit tiles with per-tile UV windowing
 * exactly like the map's — a fractional last column would have to be either
 * clipped (the sprite format cannot) or stretched (visibly wrong against its
 * neighbour).
 *
 * IT USED TO ROUND STRAIGHT TO THE VIEWPORT, on the argument that a slab
 * reaching both side edges "stops the arena reading as a rug in the middle of a
 * table". That is a real risk and the note is kept because it is the thing to
 * watch. But it also pushed the frame, rim and table off screen, which cost
 * more than it bought: with no visible edge the fight is a texture that happens
 * to fill the panel, and §11's whole claim is that this is an OBJECT. Paul's
 * standing direction in §16 — buttons and menus "physically a part of the Board
 * Border, like attached to the sides of it" — needs a border to attach to, and
 * the candle rail is the first thing to hang on it.
 *
 * So the play area gives back `FRAME_INSET_TILES` a side and the frame comes
 * into view. Checked by eye at 1280x820 rather than reasoned about: the board
 * reads as a slab with an edge, not as a rug.
 */
export function arenaWidth(viewportX: number, zoom: number): number {
  const fill = Math.round(viewportX / zoom);
  return Math.max(6, Math.min(48, fill - FRAME_INSET_TILES * 2));
}

/**
 * The one camera that puts the authored ranks on the measured feet lines.
 *
 * Pure, and the reason it is pure is that it is the only place the two
 * coordinate systems meet — if this is right, every piece is right, and if it
 * is wrong every piece is wrong the same way. That is a property worth being
 * able to unit-test without a browser.
 */
export function arenaCamera(a: FieldAnchors): Camera {
  const tilt = a.tilt ?? DEFAULT_TILT;
  const cos = Math.max(1e-3, Math.cos(tilt));
  const vw = Math.max(1, a.viewport.x);
  const vh = Math.max(1, a.viewport.y);
  // The fallbacks are where the rows sit on an unstyled first paint. They only
  // ever survive one frame, and a plausible board beats a degenerate one.
  const enemyFeet = a.enemyFeet ?? vh * 0.44;
  const partyFeet = a.partyFeet ?? vh * 0.9;
  const sepPx = partyFeet - enemyFeet;
  const sepTiles = PARTY_RANK - ENEMY_RANK;
  const depthPerTile = sepPx > 8 ? sepPx / sepTiles : (vh * 0.46) / sepTiles;
  const zoom = clampArenaZoom(depthPerTile / cos);
  const cy = ENEMY_RANK - (enemyFeet - vh / 2) / (zoom * cos);
  const width = arenaWidth(vw, zoom);
  return { centre: { x: width / 2, y: cy }, zoom, tilt, viewport: { x: vw, y: vh } };
}

export function arenaExtent(cam: Camera): { width: number; height: number; border: number } {
  return { width: arenaWidth(cam.viewport.x, cam.zoom), height: ARENA_DEPTH, border: ARENA_BORDER };
}

// -------------------------------------------------------------------------
// FIGURES
// -------------------------------------------------------------------------

/**
 * One combatant, as its DOM art box plus what to paint in it.
 *
 * The box is measured off `.bf-figure` — NOT computed from the `size={150}`
 * props in the TSX. ENGINE_PLAN §8 item 5: "`--bf-scale` is the real source of
 * truth for scale, and `battle.css` `!important`s over the components' inline
 * sizes. The TSX numbers are hints, not authority." Measuring the resolved box
 * is how this file refuses to believe the hints.
 */
export interface FigureBox {
  uid: string;
  side: 'enemy' | 'ally';
  /** Centre of the art box, px from the field's left edge. */
  cx: number;
  /** The feet — the box's bottom edge, px from the field's top edge. */
  feetY: number;
  /** Art box size in CSS px. */
  w: number;
  h: number;
  /** Painted art, or null for a bare plinth (41 of 92 monsters have none). */
  textureId: string | null;
  /** Dead, spared, tamed away — faded rather than removed (`.felled`). */
  felled?: boolean;
  /** Its action is resolving right now. Lifts off the board a little. */
  acting?: boolean;
  /** Mirror the art. Allies face right on the DOM path; here they face up-board. */
  flip?: boolean;
}

export interface FigurePlacement {
  uid: string;
  /** Where the piece stands, in tiles. */
  at: Vec2;
  /** Quad size in tiles. */
  width: number;
  height: number;
  /** Plinth radius in tiles. */
  radius: number;
}

/**
 * A measured art box, as a piece standing on the board.
 *
 * `width` divides by `zoom` and `height` by `zoom * sin(tilt)` because that is
 * exactly what `buildVertexData` will multiply them back by for a standing
 * quad — the two lines are inverses on purpose, so a figure draws at the pixel
 * size the DOM reserved for it whatever the tilt is.
 */
export function placeFigure(f: FigureBox, cam: Camera): FigurePlacement {
  const sin = Math.max(1e-3, Math.sin(cam.tilt));
  const at = unproject({ x: f.cx, y: f.feetY }, cam, 0);
  const width = Math.max(0.05, f.w / cam.zoom);
  return {
    uid: f.uid,
    at,
    width,
    height: Math.max(0.05, f.h / (cam.zoom * sin)),
    radius: Math.max(0.16, width * PLINTH_FRACTION),
  };
}

// -------------------------------------------------------------------------
// THE CANDLE RAIL — §8 item 9, as geometry
// -------------------------------------------------------------------------

export interface CandleRail {
  /** Board x the rail stands on. Authored in board space — see `CANDLE_FRAME_X`. */
  x: number;
  total: number;
  lit: number;
}

/**
 * WHERE THE RAIL LIVES: on the FRAME, not on the field.
 *
 * It used to stand inside the play area at x = 0.7, at a position measured off
 * the DOM `.vigor-rail`'s right edge — so the board rail tracked the HUD rail
 * and the two sat beside each other. Paul, looking at the first frame: "it
 * looks like we have 2 vigor candle sections?" They were, because the geometry
 * was being aimed at the very widget it was supposed to replace.
 *
 * Two things were wrong with that and only one of them was visual:
 *
 * 1. Candles standing between the combatants are ON the field, and §15 says
 *    what stands on the field is a PIECE. Scenery among the pieces reads as
 *    something you could move or attack.
 * 2. Taking the position from a DOM measurement made the board's furniture a
 *    function of HUD layout — so the narrow breakpoint, which moves the rail,
 *    also moved the candles. Board furniture must not depend on where a widget
 *    happened to land.
 *
 * Both go away by authoring it: the rail sits in the middle of the LEFT FRAME
 * BAND, the same band the buttons are meant to attach to. That is Paul's
 * standing direction from §16 — "the Menus and buttons should be physically a
 * part of the Board Border, like attached to the sides of it" — and a candle
 * bracket on the rim is exactly that. It also lights the field from OUTSIDE
 * the field, which is what a rim light should do.
 */
export const CANDLE_FRAME_X = -ARENA_BORDER / 2;

/**
 * The OPPONENT'S rail, mirrored onto the right frame band.
 *
 * Paul: *"maybe the enemy Vigor (if it has that, maybe it should) could have
 * candles on the right side of the screen aswell. next to the chronicle combat
 * log"*. The parenthesis is the real question, and the engine answers it: only
 * a DUEL gives the opponent a resource. `duel.ts` builds a full `battle` per
 * side and `viewFor` publishes `foe.energy` / `foe.maxEnergy` — energy is not
 * redacted, only hand contents and draw order are. A monster has `intents` and
 * per-move cooldowns and nothing that is spent, so there is no pool to show.
 *
 * SO THE FURNITURE IS SYMMETRIC AND THE STATE IS NOT. Sockets are carpentry and
 * are cut on both sides always; candles are data and are only seated where a
 * side actually has vigor. Against a monster the right rail is a row of empty
 * brass cups, which reads as a statement rather than as a missing feature — the
 * thing you are fighting does not play by your rules. Against another tamer
 * both rails burn, and that symmetry MEANS something the moment you see it.
 *
 * The alternative — giving monsters vigor so the rails match — is a balance
 * project, not a render one: something has to spend it, which makes intent
 * selection resource-constrained and moves every fight-pacing number.
 */
export function candleFrameRightX(width: number): number {
  return width + ARENA_BORDER / 2;
}

/**
 * Where the candles stand, bottom-to-top.
 *
 * Index 0 is the NEAREST candle, matching `.vigor-candles`' `column-reverse`:
 * the DOM rail snuffs the top one first, so a board rail that filled from the
 * far edge would gutter at the wrong end and the two readouts would disagree
 * about which candle just went out. That ordering still matters even though the
 * DOM candles are no longer drawn — `lighting.css`'s `:has(.candle.lit)` count
 * is still live off the same elements, and the numeric readout beside them is
 * still DOM text.
 */
/**
 * The rail's own extent along the frame band, in board y.
 *
 * Named rather than re-derived at each call site because §19.1's rail strip
 * (`candle_rail_strip`) has to span the SAME run the candles stand along —
 * furniture and fixture share one measurement, or a re-tune of one silently
 * un-aligns it from the other.
 */
export const RAIL_NEAR = PARTY_RANK + 0.55;
export const RAIL_FAR = ENEMY_RANK - 0.75;

export function candlePositions(rail: CandleRail): Vec2[] {
  const n = Math.max(0, Math.floor(rail.total));
  if (n === 0) return [];
  if (n === 1) return [{ x: rail.x, y: (RAIL_NEAR + RAIL_FAR) / 2 }];
  const step = (RAIL_NEAR - RAIL_FAR) / (n - 1);
  const out: Vec2[] = [];
  for (let i = 0; i < n; i++) out.push({ x: rail.x, y: RAIL_NEAR - step * i });
  return out;
}

/** How tall a candle stands, in tiles. Wax plus a finger of flame. */
export const CANDLE_HEIGHT = 0.62;
export const CANDLE_WIDTH = 0.2;

/**
 * The candle rail strip (§19.1) — the timber the sockets are cut into.
 *
 * `WIDTH` matches `candle_rail_strip`'s own baked width in `bake.py`'s SHAPES
 * table (0.56 tiles, margin included) so the quad draws at the pixel size the
 * bake was framed at rather than an arbitrary stretch. `REPEAT_UNIT` is the
 * bake's height (2.0 tiles) — bake.py: "the rail TILES ALONG ITS HEIGHT — board
 * y — so the height is exact and the width carries the margin," which is what
 * licenses tiling it with a REPEAT-wrapped UV instead of stretching one texture
 * over the whole run.
 */
export const RAIL_STRIP_WIDTH = 0.56;
export const RAIL_STRIP_REPEAT_UNIT = 2.0;

export const MAT_RAIL_STRIP = 'railStrip';
/**
 * The rail strip's BRASS HALF.
 *
 * `bake.py`'s `split()` emits `candle_rail_strip` and `candle_rail_strip_brass`
 * from ONE assembly at ONE frame, for the reason §19.1 states: the renderer's
 * specular is per-material, so a single quad carrying both oiled timber and a
 * brass edge can only be shiny or matte. Both rows therefore share a width, a
 * height and a centre, and the engine draws them at the IDENTICAL rect — which
 * is what makes the fitting incapable of sitting crooked on its own timber.
 *
 * The wood half has been drawn since §21.7; the brass half was baked and
 * published in the same pass and never asked for. It tiles on the same axis and
 * takes the same repeat UV, so it is the same quad with a second texture.
 */
export const MAT_RAIL_STRIP_BRASS = 'railStripBrass';
export const MAT_CORNER_BRASS = 'cornerBrass';

/**
 * Centre of the far-left frame corner, where `board_corner_brass` sits.
 *
 * FAR, not near — checked against the actual bake rather than assumed. Looked
 * at `board_corner_brass.png` directly: the L hugs the texture's TOP edge and
 * LEFT edge. `piece.ts baseDiscNormalPixels`'s rule (restated in
 * `bake.py`'s header) is "texture +v (down the image) is board +y, toward
 * the camera" — so texture row 0 is the FAR edge (small board y), and the
 * L's two solid arms are the far edge and the left edge. That is the far-left
 * corner, matching `bake.py`'s own comment on the shape ("the far-left
 * corner"). An earlier pass here anchored it at the NEAR-left corner instead
 * — plausible-looking and wrong, the same class of mistake the header warns
 * a UV flip causes, just from misreading which corner rather than mirroring
 * one — and was only caught by rendering the PNG and looking at which way
 * the L opens.
 *
 * ONE corner only — see the note at its call site in `buildBattleScene` for
 * why the other three are not mirrored onto it.
 */
export function cornerBrassCentre(extent: { width: number; height: number; border: number }): Vec2 {
  return { x: -extent.border / 2, y: -extent.border / 2 };
}
export const CORNER_BRASS_SIZE = 0.6;

/**
 * How often a strap crosses the board-to-table joint, in tiles.
 *
 * FOUR, which is `board_rim`'s own repeat — `boardSlabSprites` tiles the rim
 * every four tiles and `bake.py` puts its bolt heads "at every four-tile seam".
 * Landing the straps on those seams is what makes them read as one piece of
 * hardware rather than as two unrelated brass rhythms along the same edge.
 */
export const STRAP_PITCH = 4;

/**
 * Where `brass_strap` sits, and it is a seam that did not exist until this pass.
 *
 * §21.7 and §21.8 both left the strap unwired for the same stated reason:
 * *"there is no seam in the current arena geometry for a strap to honestly sit
 * across."* That was true while `.lantern-arena` was `inset: 0` inside
 * `.battlefield` — the camera then showed board y up to about 5.1 and the slab's
 * near edge is at 7.2, so the rim, the joint and the table under it were all off
 * the bottom of frame. Hosting the canvas on `.battle-stage` moves the solve's
 * centre down by roughly 1.8 tiles and the near edge comes into view, which is
 * also what §19 asks for: the console is on the TABLE, past the board's near
 * edge, and this is the joint it is on the far side of.
 *
 * Lying ON THE TABLE (`z = -thickness`), not on the board, and at the strap's
 * AUTHORED board size rather than fitted to anything. Both follow from what it
 * is: frame-fixed carpentry like the sockets and the corner brass, so it is
 * foreshortened by the tilt exactly as a real band of brass lying on a table
 * would be. Only the HUD-anchored fittings undo that, and they undo it because
 * they are framing a straight-on widget.
 *
 * `build_brass_strap` RUNS ALONG X and says a seam running the other way is a
 * second bake rather than the same texture turned, so this joint — which runs
 * along x — is the one it can honestly take. No mirroring, no flip, and none of
 * the tangent-space problem that still keeps the corner brass at one corner.
 */
export function strapCentres(
  extent: { width: number; height: number; border: number },
  thickness: number,
): Vec3[] {
  const left = -extent.border;
  const right = extent.width + extent.border;
  const y = extent.height + extent.border + STRAP_FRAME.h / 2;
  const out: Vec3[] = [];
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) return out;
  for (let x = left + STRAP_PITCH; x < right - 1e-6; x += STRAP_PITCH) {
    out.push({ x, y, z: -thickness });
  }
  return out;
}

// -------------------------------------------------------------------------
// THE CONSOLE BODY (§19.1, closing §22.5's "still open" list)
// -------------------------------------------------------------------------
//
// `console_body` / `console_body_brass` were baked and published in the same
// pass as everything above and had no consumer on either render path — §22.5:
// "the band the fittings sit on is bare table. The fittings read as fittings;
// they do not yet read as fittings ON something." This is the deck that fixes
// that, and it is FRAME-FIXED FURNITURE like the rail strip, the corner brass
// and the strap above it, not a `FurnitureBox`: it has no DOM rect of its own
// to measure, because it is not framing one widget — it is the surface all
// six of §19.1's DOM-anchored fittings (§22.4) are measured against and
// unproject onto. `placeFurniture`/`FurnitureFit` exist to fit a bake INTO a
// measured box; there is no box here to fit into, so none of `cover`,
// `contain` or `slice` apply — the same reason `pushRail`'s rail strip and
// `strapCentres`' strap do not go through that machinery either.

/**
 * `console_body`'s own registered frame (`bake.py` SHAPES:
 * `split("console_body", build_console_body, width=4.0, height=1.36, ...)`).
 * A REGISTERED shape (`bake.py`'s own rule: "anything that must line up with
 * the tile grid or tile along a run gets its EXACT extent, no margin") —
 * confirmed against the published PNG rather than assumed: `console_body.png`
 * is 1024x348, and 1024/348 = 2.943 against the authored 4.0/1.36 = 2.941, so
 * neither axis is carrying slack for an anti-aliased silhouette the way a
 * free-standing shape like `candle_socket` does.
 *
 * THE WIDTH AXIS IS THE ONE THAT TILES. `build_console_body`'s own doc says
 * so directly: "IT RUNS PAST THE FRAME SIDEWAYS and carries no feature on the
 * left or right edge... the console is one continuous surface however wide it
 * is assembled." That is `RAIL_STRIP_REPEAT_UNIT`'s exact contract, on the
 * other axis — there the rail "TILES ALONG ITS HEIGHT... so the height is
 * exact and the width carries the margin"; here the height is what is drawn
 * at its one authored size and the width is REPEAT-wrapped in units of it.
 */
export const CONSOLE_BODY_REPEAT_UNIT = 4.0;
export const CONSOLE_BODY_HEIGHT = 1.36;

export const MAT_CONSOLE_BODY = 'consoleBody';
/**
 * The console body's BRASS HALF — the near-edge lip, the back rail, the bead
 * run and the half-straps over its own internal butt joints. `bake.py`'s
 * `split()` emits `console_body` and `console_body_brass` from one assembly
 * at one frame, so both draw at the IDENTICAL rect — see `MAT_RAIL_STRIP_BRASS`
 * for why this project always requests and draws both halves of a split shape
 * rather than only the timber.
 */
export const MAT_CONSOLE_BODY_BRASS = 'consoleBodyBrass';

export interface ConsoleBodyPlacement {
  position: Vec3;
  size: Vec2;
}

/**
 * Where the console body deck sits: ON THE TABLE, past the board's near edge —
 * the exact joint `strapCentres` puts its straps across, and for the same
 * reason (§19: the console is furniture on the table, not on the board).
 *
 * ITS FAR EDGE MEETS THE RIM where the straps start (`extent.height +
 * extent.border`, `strapCentres`' own `y`); its NEAR EDGE — "the one the
 * player's hands reach", per `bake.py`'s own comment on the brass rail — sits
 * `CONSOLE_BODY_HEIGHT` tiles further out, which is exactly as far onto the
 * table as the panel is authored to reach and no further.
 *
 * SPANS THE WHOLE FRAME, corner brass to corner brass (`-border` to
 * `width + border`), rather than a width measured off any one fitting. The
 * six DOM-anchored fittings it sits under are measured off live rects this
 * file cannot see — the portrait bezels ride the LEFT frame band, the log
 * well the RIGHT, the piles and the cradle somewhere across the middle
 * (§22.4, §22.5) — so a panel narrower than the frame would have to guess
 * which of those to clear and a panel spanning the whole frame cannot be
 * short for any of them. `CONSOLE_BODY_REPEAT_UNIT` is what makes that
 * affordable: the deck tiles along its width by construction, so covering a
 * wider run than one authored frame is the shape doing exactly what it was
 * baked to do rather than a stretch.
 *
 * RETURNS NULL RATHER THAN A DEGENERATE PLACEMENT, same discipline
 * `placeFurniture` uses — a board mid-resize handing back a non-finite extent
 * is the ordinary case for one frame, not an error worth a NaN vertex over.
 */
export function consoleBodyPlacement(
  extent: { width: number; height: number; border: number },
  thickness: number,
): ConsoleBodyPlacement | null {
  if (!Number.isFinite(extent.width) || !Number.isFinite(extent.border) || !Number.isFinite(extent.height)) {
    return null;
  }
  if (!Number.isFinite(thickness)) return null;
  const width = extent.width + extent.border * 2;
  if (width <= 0) return null;
  const y = extent.height + extent.border + CONSOLE_BODY_HEIGHT / 2;
  return {
    position: { x: extent.width / 2, y, z: -thickness },
    size: { x: width, y: CONSOLE_BODY_HEIGHT },
  };
}

// -------------------------------------------------------------------------
// HUD-ANCHORED FURNITURE (§19.1) — a fitting behind a measured DOM box
// -------------------------------------------------------------------------
//
// Everything above this line is authored against the FRAME: the sockets, the
// rail strip, the corner brass all sit at board coordinates this file chose,
// and need nothing from the DOM. §19.1's remaining fittings are the opposite
// case — each one exists to frame a specific widget, so where it goes is
// wherever the flexbox put that widget, and the only way to know is to measure.
//
// WHICH IS THE SAME PROBLEM `placeFigure` ALREADY SOLVES, pointed at a
// different element, and it is solved the same way rather than a second way:
// unproject the box through the camera the rank solve produced. The one
// difference is the orientation constant, and it is the whole difference —
// `buildVertexData` scales a STANDING quad's height by `zoom * sin` and a
// LYING one's by `zoom * cos`, so `placeFigure` divides by sin and this
// divides by cos. Getting that backwards is a 1.4x error at the shipping tilt
// that looks like a fitting that is merely "a bit too tall".
//
// A FITTING IS A LYING QUAD, and it covers its DOM box exactly. Both halves of
// that are decisions:
//
//   LYING, because every other piece of board furniture is (socket, rail
//   strip, corner brass) and because §19 puts the console ON the table rather
//   than standing up off it.
//
//   COVERING THE BOX, because a frame that does not line up with the thing it
//   frames is not a frame. The cost is worth stating: a lying quad stretched
//   by 1/cos in board y projects back to its DOM box's own aspect, so a round
//   bezel comes out CIRCULAR on screen rather than as the ellipse a real ring
//   lying on a tilted table would present. For a fitting whose whole job is to
//   surround a straight-on HUD widget that is the right trade; for anything
//   authored against the board it would be wrong, which is why the frame-fixed
//   furniture above does not go through here.
//
// -------------------------------------------------------------------------
// THE ASPECT TRAP, RE-MEASURED — AND IT IS SMALLER THAN §21.8 RECORDED
// -------------------------------------------------------------------------
//
// §21.8 left three fittings unwired behind two blockers. The first was real and
// is closed by this pass: `.lantern-arena` was `inset: 0` inside `.battlefield`,
// so the piles and the End Turn lantern sat over 100px below where the canvas
// ended. The host is `.battle-stage` now and the canvas reaches all of them.
//
// THE SECOND BLOCKER WAS ARITHMETIC, AND THE ARITHMETIC DOUBLE-COUNTED cos.
// §21.8 quotes "a 5.7x anisotropic stretch" for `log_well`, 2.1x for
// `pile_tray` and 2.5x for `lantern_cradle`. Those compare the DOM box's BOARD
// aspect against the bake's authored board aspect — but the box's board aspect
// already carries a 1/cos, put there by `placeFurniture` precisely so the quad
// projects back to the box. This file's own note above says so: *"a lying quad
// stretched by 1/cos in board y projects back to its DOM box's own aspect."*
// Comparing the stretched thing to the unstretched one counts the tilt twice.
//
// Done once, the distortion of the IMAGE — which is the only thing that can
// bend a brass band — is the ratio of the two SCREEN aspects, and the cos
// cancels out of it entirely:
//
//     distortion = (boxH / boxW) / (authoredH / authoredW)
//
// Verified against the published PNGs rather than derived and trusted: every
// one of them is an orthographic render at its authored board proportions, with
// no foreshortening baked in (`log_well.png` is 1024x573 for an authored
// 2.50 x 1.40 = 0.560; `pile_tray.png` 806x1024 for 0.96 x 1.22 = 1.271;
// `lantern_cradle.png` 1024x922 for 1.00 x 0.90). So texel-to-pixel scale is
// `boxW/pxW` across and `boxH/pxH` down, and their ratio is the expression
// above. Measured at 1350x857 in a real fight:
//
//   fitting          anchor                  box      authored   distortion
//   pile_tray        .pile-cardback          84x118   0.96x1.22    1.001
//   exhaust_grate    .pile-cardback          84x118   0.96x1.22    1.001
//   lantern_cradle   .lantern-turn           96x122   1.00x0.90    1.412
//   log_well         .battle-log-rail       216x431   2.50x1.40    3.557
//
// THE PILES ARE NOT A PROBLEM AT ALL, and the reason is an agreement nobody
// wrote down: `CARD_SLOT` is 0.64 x 0.90 — "card-shaped literally", says
// `build_pile_tray` — and `.pile-cardback` is 84 x 118. Both are 0.712. The
// bake and the DOM independently chose the same playing-card aspect, so putting
// the slot on the card back leaves 0.1% of distortion. That is the `BEZEL_BORE`
// situation exactly, one shape down: an authored fraction the engine can read
// backwards, and no eyeballing.
//
// SO THE THREE GET THREE DIFFERENT ANSWERS, and the differences are the
// measurements above rather than taste — see `FurnitureFit`.
//
// `board_corner_brass` STAYS AT ONE CORNER. Nothing in this pass changes the
// reason (see its call site): mirroring one oriented bake onto the other three
// needs a tangent-space flip the vertex format cannot express. The strap is the
// fitting that CAN honestly go on a seam now, because moving the host put a
// seam in frame — see `strapRun`.

/**
 * The anchor keys, stated here so `BattleScreen` and the builder cannot
 * disagree about them — the same argument the MATERIAL IDS block at the top of
 * this file makes. A typo in either half is otherwise a fitting that silently
 * never draws, which is indistinguishable from a bake that never loaded.
 */
export const HUD_PORTRAIT_ENEMY = 'portrait-enemy';
export const HUD_PORTRAIT_HERO = 'portrait-hero';
export const HUD_PILE_DRAW = 'pile-draw';
export const HUD_PILE_DISCARD = 'pile-discard';
export const HUD_PILE_EXHAUST = 'pile-exhaust';
export const HUD_END_TURN = 'end-turn';
export const HUD_LOG = 'log-well';

export const MAT_BEZEL = 'portraitBezel';
export const MAT_BEZEL_SMALL = 'portraitBezelSmall';
/** §19.1's remaining slots. Every one is `split()` — timber id, brass id. */
export const MAT_PILE_TRAY = 'pileTray';
export const MAT_PILE_TRAY_BRASS = 'pileTrayBrass';
export const MAT_EXHAUST = 'exhaustGrate';
export const MAT_EXHAUST_BRASS = 'exhaustGrateBrass';
export const MAT_CRADLE = 'lanternCradle';
export const MAT_CRADLE_BRASS = 'lanternCradleBrass';
export const MAT_LOG_WELL = 'logWell';
export const MAT_LOG_WELL_BRASS = 'logWellBrass';
/** The band across the joint where the board meets the table. Brass, no split. */
export const MAT_STRAP = 'brassStrap';

/**
 * What the two bezel bakes were framed at, in board units (`bake.py` SHAPES).
 *
 * They are ONE DESIGN at two sizes, not two designs — `build_portrait_bezel`
 * says so outright ("EVERY DIMENSION IS A FRACTION OF `frame_w`, which is what
 * actually makes the two sizes one design rather than two"). So the choice
 * between them is not a look choice, it is a TEXEL AND AO choice: the small
 * row carries a shorter AO distance because a fitting a third the size with a
 * distance tuned for the big one reads as sitting in a hole. Pick the bake
 * whose own frame is nearest the size actually being drawn and both stay in
 * the register they were authored for. See `pickAuthoredSize`.
 */
export const BEZEL_FRAME = 0.96;
export const BEZEL_SMALL_FRAME = 0.66;

/**
 * The bore, as a fraction of the bezel's own quad — 2/3, and it is AUTHORED
 * rather than measured off the PNG.
 *
 * `build_portrait_bezel`: *"the bore is exactly TWO THIRDS of the frame width
 * in both sizes ... That ratio is the deliverable as much as the geometry is:
 * the art the engine puts behind this is the bezel's own quad scaled by 2/3
 * about the same centre, at either size, with no table to look up."*
 *
 * Read the other way round, which is the direction this file needs it: to put
 * the bore ON a widget, draw the bezel at 3/2 of that widget's box. That is
 * `FurnitureBox.scale`, and it is why a bezel is the one fitting in §19.1's
 * table that needs no eyeballing — the bake and the engine agree on one number.
 */
export const BEZEL_BORE = 2 / 3;

/**
 * The smallest box worth drawing behind, in px.
 *
 * Same threshold `measure()` already applies to a `.bf-figure`, and it exists
 * for the same reason: a mid-transition layout hands back a zero-size rect, and
 * a zero divided into a board size is either a degenerate quad or — once it
 * reaches `unproject` with a zero zoom — a NaN. A NaN vertex does not draw
 * badly, it blanks the canvas for the rest of the session, which is why every
 * guard on this path returns NO SPRITE rather than a clamped one.
 */
export const MIN_FURNITURE_PX = 2;

/**
 * HOW A BAKE IS FITTED INTO THE QUAD ITS BOX ASKS FOR.
 *
 * One of three, chosen per fitting off the distortion measured in the block
 * above `HUD_PORTRAIT_ENEMY`, because the three fittings genuinely need three
 * different answers and a single policy would have to be wrong for two of them.
 *
 * `cover`   — the quad IS the box (times `scale`). What every fitting did
 *             before this pass, and still the right answer wherever the box and
 *             the bake already agree: the bezels (a round bore on a round chip)
 *             and the piles (0.712 against 0.712 — see the block above).
 *
 * `contain` — the quad keeps the bake's AUTHORED aspect, grown until it
 *             contains the box. Zero distortion by construction, at the cost of
 *             overhanging the box on one axis. For `lantern_cradle`, whose
 *             identity is a round base disc and two brass ears: 1.412x would
 *             turn the disc into a visible ellipse and there are no straight
 *             runs to slice, so this is the only one of the three that works.
 *
 * `slice`   — a 3x3 of UV windows: the four corners keep their size, the four
 *             runs stretch ALONG THEIR LENGTH ONLY, the middle takes the rest.
 *             `board.ts`'s `frameBands` does exactly this for `board_frame` and
 *             this is that idea pointed at a measured box. For `log_well` at
 *             3.557x, where the ornament is a rectangular escutcheon, a
 *             full-width brass header and four corner brackets — every one of
 *             them a straight run or a corner, which is precisely the shape
 *             nine-slicing exists for.
 */
export type FurnitureFit = 'cover' | 'contain' | 'slice';

/**
 * A bake's own frame, in board units — its row in `bake.py`'s SHAPES table.
 *
 * Restated here rather than imported, same as `board.ts`'s `BAKED_FRAME` and
 * for the same reason: nothing joins the two programs at runtime, so a change
 * on either side has to fail a test rather than a screenshot. Only the RATIO is
 * ever used, which is also the ratio of the published PNG's pixel dimensions —
 * so the test can check it against the file on disk.
 */
export interface AuthoredFrame {
  w: number;
  h: number;
}

/** One measured HUD box, and the fitting that goes behind it. */
export interface FurnitureBox {
  /** Material id of the fitting — or of its TIMBER half, when it is split. */
  id: string;
  /**
   * The brass half, drawn at the IDENTICAL rect. `bake.py`'s `split()` emits
   * both rows from one assembly at one frame precisely so this is legal.
   */
  brassId?: string;
  /**
   * Alternative authored sizes of the SAME fitting. When present the builder
   * replaces `id` with whichever of these was baked closest to the size being
   * drawn — see `BEZEL_FRAME` for why that is the right axis to choose on.
   */
  sizes?: readonly { id: string; frame: number }[];
  /** Centre of the measured box, px from the field's left / top edge. */
  cx: number;
  cy: number;
  /** The measured box, in the same px. */
  w: number;
  h: number;
  /**
   * How much bigger than the box the QUAD is. 1 covers the box exactly; a
   * bezel is 1/BEZEL_BORE so its bore lands on the box instead of its rim.
   */
  scale?: number;
  /**
   * The same, down the screen, when the bake's own opening is not square to its
   * frame. `log_well`'s well is 0.80 x 0.75 of the panel and `pile_tray`'s slot
   * is 0.667 x 0.738 of the tray, so reading either contract backwards needs two
   * numbers. Defaults to `scale`, which is every case that has one.
   */
  scaleY?: number;
  /** Default `cover`. See `FurnitureFit`. */
  fit?: FurnitureFit;
  /** The bake's authored frame. Required by `contain` and `slice`. */
  authored?: AuthoredFrame;
  /**
   * The rigid border a `slice` fit keeps, as a fraction of the TEXTURE, per
   * axis. Measured off the published brass PNG's own alpha — see `LOG_SLICE`.
   */
  slice?: { u: number; v: number };
}

export interface FurniturePlacement {
  /** Centre of the fitting, in tiles. */
  at: Vec2;
  /** Quad size in tiles. */
  width: number;
  height: number;
}

/**
 * A measured HUD box, as a fitting lying on the board.
 *
 * The exact inverse of what `buildVertexData` does to a LYING quad, for the
 * same reason `placeFigure` is the inverse for a standing one: `width` divides
 * by `zoom` and `height` by `zoom * cos(tilt)` because those are precisely the
 * two factors it will multiply back.
 *
 * RETURNS NULL RATHER THAN A DEGENERATE PLACEMENT. Every caller is in a frame
 * loop reading a live layout, so "the box is not there yet" is the ordinary
 * case and not an error — a fitting that skips one frame is invisible for
 * 16ms, where a NaN that reaches the camera is a dead canvas until reload.
 */
export function placeFurniture(f: FurnitureBox, cam: Camera): FurniturePlacement | null {
  if (!Number.isFinite(f.w) || !Number.isFinite(f.h)) return null;
  if (f.w < MIN_FURNITURE_PX || f.h < MIN_FURNITURE_PX) return null;
  if (!Number.isFinite(f.cx) || !Number.isFinite(f.cy)) return null;
  if (!Number.isFinite(cam.zoom) || cam.zoom <= 0) return null;
  const cos = Math.cos(cam.tilt);
  if (!Number.isFinite(cos) || cos <= 1e-3) return null;
  const scale = Number.isFinite(f.scale) && (f.scale as number) > 0 ? (f.scale as number) : 1;
  const scaleY = Number.isFinite(f.scaleY) && (f.scaleY as number) > 0 ? (f.scaleY as number) : scale;
  const at = unproject({ x: f.cx, y: f.cy }, cam, 0);
  if (!Number.isFinite(at.x) || !Number.isFinite(at.y)) return null;
  let width = (f.w * scale) / cam.zoom;
  let height = (f.h * scaleY) / (cam.zoom * cos);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  if (width <= 0 || height <= 0) return null;
  if (f.fit === 'contain') {
    const a = f.authored;
    // No authored frame, no aspect to keep. Falls through to `cover` rather
    // than guessing a ratio — a fitting drawn at the wrong aspect is exactly
    // the defect this mode exists to prevent.
    if (a && Number.isFinite(a.w) && Number.isFinite(a.h) && a.w > 0 && a.h > 0) {
      // The board-space height that draws the texture UNDISTORTED at a given
      // board width. The 1/cos is the same one `placeFurniture` puts in above:
      // a lying quad is squashed by cos on the way to the screen, so a board
      // rectangle has to be 1/cos taller than the authored one to arrive at the
      // authored SCREEN shape.
      const perWidth = a.h / a.w / cos;
      const tall = width * perWidth;
      if (tall >= height) height = tall;
      else width = height / perWidth;
      if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
    }
  }
  return { at, width, height };
}

/** One band of a sliced axis: where it starts, how long it is, and its UV span. */
export interface SliceBand {
  at: number;
  size: number;
  t0: number;
  t1: number;
}

/**
 * Cut one axis into rigid-band / stretched-middle / rigid-band.
 *
 * `board.ts`'s `frameBands` in general form, and deliberately the same shape so
 * the two can be read against each other: that one is hard-wired to
 * `BAKED_FRAME`'s numbers because the board frame is the only thing it cuts,
 * and this one takes the band as an argument because a fitting's comes from its
 * own bake.
 *
 * `band` is in the SAME UNITS as `span` (tiles); `frac` is the same band as a
 * fraction of the texture. Two numbers rather than one because the quad is not
 * drawn at the texture's own size — that is the entire point of slicing it.
 *
 * A span too short for two bands gets two half-spans and NO middle, which
 * compresses the corner ornament rather than overlapping the two bands. Both
 * are wrong; only one of them draws the same texels twice.
 */
export function sliceBands(at: number, span: number, band: number, frac: number): SliceBand[] {
  if (!Number.isFinite(at) || !Number.isFinite(span) || span <= 0) return [];
  const f = Number.isFinite(frac) ? Math.min(0.499, Math.max(1e-4, frac)) : 0.25;
  const b = Math.min(Number.isFinite(band) && band > 0 ? band : span / 4, span / 2);
  const out: SliceBand[] = [{ at, size: b, t0: 0, t1: f }];
  const middle = span - b * 2;
  // Skipped rather than clamped: a negative-width quad draws inside out.
  if (middle > 1e-6) out.push({ at: at + b, size: middle, t0: f, t1: 1 - f });
  out.push({ at: at + span - b, size: b, t0: 1 - f, t1: 1 });
  return out;
}

/**
 * A fitting as a 3x3 of UV windows instead of one stretched quad.
 *
 * THE BAND'S SIZE IS TAKEN OFF THE WIDTH, both times, and that is what keeps a
 * corner square. A corner cell is `slice.u` of the quad across; for the same
 * texels to be drawn at the same scale down the screen its board height must be
 * that width times the texture's own aspect and then divided by cos, because
 * cos is what the projection will multiply it back by. Get this from the height
 * instead and the corners are stretched exactly as much as the runs, which is
 * the thing being avoided.
 *
 * The middle cell is kept, unlike `frameRingSprites`' ring: the middle of a
 * `log_well` is the routed floor of the well and something has to draw it.
 */
export function sliceSprites(
  textureId: string,
  at: Vec2,
  width: number,
  height: number,
  authored: AuthoredFrame,
  slice: { u: number; v: number },
  cos: number,
): Sprite[] {
  const out: Sprite[] = [];
  if (!(authored.w > 0) || !(authored.h > 0) || !(cos > 1e-3)) return out;
  const bandW = width * slice.u;
  const bandH = (width * slice.v * (authored.h / authored.w)) / cos;
  const cols = sliceBands(at.x - width / 2, width, bandW, slice.u);
  const rows = sliceBands(at.y - height / 2, height, bandH, slice.v);
  for (const r of rows) {
    for (const c of cols) {
      if (!(c.size > 0) || !(r.size > 0)) continue;
      out.push({
        position: { x: c.at, y: r.at, z: 0 },
        size: { x: c.size, y: r.size },
        pivot: { x: 0, y: 0 },
        uv: { u0: c.t0, v0: r.t0, u1: c.t1, v1: r.t1 },
        textureId,
        layer: LAYER_DECAL,
      });
    }
  }
  return out;
}

/**
 * Of several authored sizes of one shape, the one baked closest to the size
 * being drawn.
 *
 * Pure and separate from the placement so the rule can be asserted without a
 * camera. Both branches are live at shipping breakpoints, which is the thing
 * that makes this a rule rather than dead generality: `--bf-chip` is
 * `calc(96 * var(--bf-scale))` against a ladder that CLAMPS at both ends while
 * `zoom` keeps growing with the viewport, so the chip's size in TILES moves a
 * long way across the band — the large bake wins at the desktop layout and the
 * small one wins once the scale ladder bottoms out on a short viewport.
 */
export function pickAuthoredSize(
  sizes: readonly { id: string; frame: number }[],
  widthTiles: number,
): string | null {
  let best: { id: string; frame: number } | null = null;
  for (const s of sizes) {
    if (!Number.isFinite(s.frame)) continue;
    if (!best || Math.abs(s.frame - widthTiles) < Math.abs(best.frame - widthTiles)) best = s;
  }
  return best ? best.id : null;
}

/**
 * The measured fittings, as sprites.
 *
 * `has` gates every one, exactly as the frame-fixed furniture is gated: a bake
 * that has not loaded (or does not exist) costs its own fitting and nothing
 * else, which is the same asynchrony rule `battleMaterials.ts` states at the
 * top. §21.7's lesson is that a gate nobody ever supplies a material to is a
 * gate that has never been exercised, so this one has a test that turns it off.
 *
 * `LAYER_DECAL`, not `LAYER_BOARD`, and it is not a formality. A fitting is
 * something RESTING on the surface rather than part of it — the same category
 * as a contact shadow or a piece's base, which is exactly what that layer was
 * introduced for. On `LAYER_BOARD` a fitting would sort against the floor tiles
 * by `y` and a tile one row nearer would slice its front edge off, which is the
 * defect `sprite.ts`'s layer comment already records happening to shadows.
 *
 * The brass half is pushed AFTER its timber at the identical rect. Both are on
 * one layer at one position, and `sortForPainting` is documented as stable, so
 * insertion order is the paint order and the fitting lands on its own panel.
 */
export function furnitureSprites(
  boxes: readonly FurnitureBox[],
  cam: Camera,
  has: (id: string) => boolean,
): Sprite[] {
  const out: Sprite[] = [];
  const cos = Math.cos(cam.tilt);
  for (const box of boxes) {
    const p = placeFurniture(box, cam);
    if (!p) continue;
    const chosen = box.sizes && box.sizes.length > 0 ? pickAuthoredSize(box.sizes, p.width) : box.id;
    if (!chosen) continue;
    const ids = box.brassId ? [chosen, box.brassId] : [chosen];
    // A `slice` fit with no authored frame or no border to keep has nothing to
    // slice ON, so it draws as one quad. Same fallback discipline as `contain`:
    // degrade to the previous behaviour, never to a guess.
    const sliced = box.fit === 'slice' && box.authored && box.slice;
    for (const id of ids) {
      if (!has(id)) continue;
      if (sliced) {
        out.push(...sliceSprites(id, p.at, p.width, p.height, box.authored!, box.slice!, cos));
        continue;
      }
      out.push({
        position: { x: p.at.x, y: p.at.y, z: 0 },
        size: { x: p.width, y: p.height },
        pivot: { x: 0.5, y: 0.5 },
        uv: FULL_UV,
        textureId: id,
        layer: LAYER_DECAL,
      });
    }
  }
  return out;
}

/**
 * The portrait chips' fittings, from whatever the component measured.
 *
 * Both chips take the SAME pair of bakes and the same bore scale — §19.1 asks
 * for "two sizes", and the two sizes are the two the layout produces at
 * different breakpoints, not one per combatant. A hero frame and an enemy
 * frame that differed would need `build_portrait_bezel` to be two designs, and
 * it is deliberately one.
 */
export const BEZEL_SIZES: readonly { id: string; frame: number }[] = [
  { id: MAT_BEZEL, frame: BEZEL_FRAME },
  { id: MAT_BEZEL_SMALL, frame: BEZEL_SMALL_FRAME },
];

/**
 * A HUD box as the component hands it over: centred, and already relative to
 * the field's own top-left corner rather than the page's.
 */
export interface MeasuredBox {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

/** A measured portrait chip, as a `FurnitureBox`. */
export function portraitBezelBox(rect: MeasuredBox): FurnitureBox {
  return {
    id: MAT_BEZEL,
    sizes: BEZEL_SIZES,
    scale: 1 / BEZEL_BORE,
    cx: rect.cx,
    cy: rect.cy,
    w: rect.w,
    h: rect.h,
  };
}

// -------------------------------------------------------------------------
// THE OTHER THREE SLOTS (§19.1), each with its own authored contract
// -------------------------------------------------------------------------

/** `bake.py` SHAPES: `pile_tray` / `exhaust_grate`, framed as a pair. */
export const PILE_FRAME: AuthoredFrame = { w: 0.96, h: 1.22 };
/** `lantern_cradle`. */
export const CRADLE_FRAME: AuthoredFrame = { w: 1.0, h: 0.9 };
/** `log_well`. */
export const LOG_FRAME: AuthoredFrame = { w: 2.5, h: 1.4 };
/** `brass_strap`. */
export const STRAP_FRAME: AuthoredFrame = { w: 0.9, h: 0.26 };

/**
 * `CARD_SLOT` as a fraction of the tray's own frame — the pile pair's `BEZEL_BORE`.
 *
 * `build_pile_tray` cuts a 0.64 x 0.90 recess in a body framed at 0.96 x 1.22,
 * and says why the recess is that shape: *"Card-shaped literally — 0.64 by 0.90
 * is a 0.71 aspect, which is a playing card. A square recess would read as a
 * coaster."* `.pile-cardback` is 84 x 118, which is 0.712. Read backwards, as
 * the bore is: to put the SLOT on the card back, draw the tray at the card
 * back's box divided by these two numbers — and because the two aspects agree to
 * a thousandth, doing so costs 0.1% of distortion rather than the 2.1x §21.8
 * recorded.
 *
 * `exhaust_grate` shares both numbers deliberately (`PILE_BODY` and `CARD_SLOT`
 * are module constants in `bake.py`, used by both builders) — §19.1 wants the
 * pair distinguished by SILHOUETTE, which means everything else must match.
 */
export const PILE_SLOT = { u: 0.64 / 0.96, v: 0.9 / 1.22 };

/**
 * `log_well`'s rigid border, per axis, as a fraction of the texture.
 *
 * MEASURED OFF `log_well_brass.png`'s OWN ALPHA, not computed from `bake.py`'s
 * numbers — §21.7's near/far corner mistake is the standing argument for
 * reading the finished asset rather than the source that produced it. The
 * column profile is flat at 0.121 coverage across the middle and rises to 0.91
 * inside u < 0.13 and u > 0.86 (the corner brackets); the row profile is flat at
 * 0.052 and rises to 0.13 outside v < 0.26 and v > 0.74 (the brackets' other
 * arms), with the full-width brass header at v 0.05..0.13 and the escutcheon's
 * lower run at v 0.87..0.93.
 *
 * Set just OUTSIDE where each profile goes flat, so every corner bracket is
 * wholly inside a rigid band and everything crossing a band boundary is a
 * straight run that only ever stretches along its own length.
 */
export const LOG_SLICE = { u: 0.155, v: 0.26 };

/**
 * `build_log_well`'s well, as a fraction of the panel: *"the well is 2.00 x
 * 1.05, which is exactly 0.80 by 0.75 of the frame, so the DOM box that carries
 * the log is the panel's own rect scaled by those two numbers."*
 *
 * ONLY THE U IS USED, and the deviation is measured rather than preferred.
 * Honouring both would draw the panel at 216/0.80 x 431/0.75 = 270 x 575 px;
 * the Chronicle's centre sits 240px down a 753px stage, so 575 runs 47px off the
 * top and the whole top brass bracket goes with it. Reading is horizontal, so
 * the axis that gets the contract is the one that puts the well's mouth on the
 * text's width; down the screen the panel covers the rail exactly and the log's
 * first and last lines sit on the well's lip instead of inside it.
 */
export const LOG_WELL_FRACTION = { u: 0.8, v: 0.75 };

/** A measured pile widget's card back, as the tray or grate behind it. */
export function pileTrayBox(rect: MeasuredBox, exhaust: boolean): FurnitureBox {
  return {
    id: exhaust ? MAT_EXHAUST : MAT_PILE_TRAY,
    brassId: exhaust ? MAT_EXHAUST_BRASS : MAT_PILE_TRAY_BRASS,
    // The slot contract, read backwards. `cover` rather than `contain` because
    // at 1.001 there is nothing to correct, and `contain` would round that 0.1%
    // into a quad that no longer sits on the card.
    scale: 1 / PILE_SLOT.u,
    scaleY: 1 / PILE_SLOT.v,
    authored: PILE_FRAME,
    cx: rect.cx,
    cy: rect.cy,
    w: rect.w,
    h: rect.h,
  };
}

/** The End Turn lantern's housing. */
export function lanternCradleBox(rect: MeasuredBox): FurnitureBox {
  return {
    id: MAT_CRADLE,
    brassId: MAT_CRADLE_BRASS,
    fit: 'contain',
    authored: CRADLE_FRAME,
    cx: rect.cx,
    cy: rect.cy,
    w: rect.w,
    h: rect.h,
  };
}

/** The Chronicle's recessed panel. */
export function logWellBox(rect: MeasuredBox): FurnitureBox {
  return {
    id: MAT_LOG_WELL,
    brassId: MAT_LOG_WELL_BRASS,
    fit: 'slice',
    authored: LOG_FRAME,
    slice: LOG_SLICE,
    scale: 1 / LOG_WELL_FRACTION.u,
    scaleY: 1,
    cx: rect.cx,
    cy: rect.cy,
    w: rect.w,
    h: rect.h,
  };
}

// -------------------------------------------------------------------------
// THE BUILD
// -------------------------------------------------------------------------

export interface BattleSceneOptions {
  camera: Camera;
  /** Seconds. Drives flicker; a fixed value gives a fixed frame. */
  time: number;
  /** Only ids present here are drawn — an unloaded texture is silently skipped. */
  materials: Map<string, Material>;
  figures: readonly FigureBox[];
  /**
   * The HUD boxes §19.1's fittings sit behind, measured this frame.
   *
   * Omitted or empty draws no fittings at all, which is what the flag-off path
   * and every existing test get — the arena is exactly what it was.
   */
  furniture?: readonly FurnitureBox[];
  /** The explicit uniform that replaces `lighting.css`'s `:has()` count. */
  vigor: { lit: number; total: number };
  /**
   * The opponent's vigor, when they have any. Duels do; monsters do not — see
   * `candleFrameRightX`. Omitted, the right rail is cut but stands empty.
   */
  enemyVigor?: { lit: number; total: number };
  /**
   * Board x for the candle rail. Omitted — and it should be — the rail sits on
   * the left frame band. See `CANDLE_FRAME_X` for why this is no longer taken
   * from a DOM measurement.
   */
  candleX?: number;
  /** Draw the painted backdrop standing behind the board. */
  backdrop?: boolean;
  ambient?: number;
  roomLamp?: number;
  lanternIntensity?: number;
}

const FULL_UV: UVRect = { u0: 0, v0: 0, u1: 1, v1: 1 };
const FLIP_UV: UVRect = { u0: 1, v0: 0, u1: 0, v1: 1 };

/** Window the shared tile texture per cell so neighbours do not visibly repeat. */
function cellUv(x: number, y: number): UVRect {
  const u = ((x % 4) + 4) % 4;
  const v = ((y % 4) + 4) % 4;
  return { u0: u / 4, v0: v / 4, u1: (u + 1) / 4, v1: (v + 1) / 4 };
}

/**
 * The arena lantern's brightness, from vigor.
 *
 * `BattleScreen`'s own comment is the spec: "the source hangs over the arena
 * and the candles go back to being a count of how much fuel is left. Vigor
 * still drives INTENSITY, so spend down to one candle and the room genuinely
 * darkens around you."
 *
 * ONE DELIBERATE DEPARTURE, stated rather than quietly tuned. The DOM path
 * uses `0.78 * ratio` with no floor, on Paul's instruction that "out means
 * out" — and it gets away with a genuinely zero light because `LightLayer`
 * runs at `ambient 0.52`, which is most of a lit room. This path runs at the
 * dungeon's ambient, so the same zero would black the fight out entirely at
 * the exact moment the player has to choose a card. The CANDLES still go fully
 * out — that is the rail Paul was talking about — and the lantern bottoms out
 * at a quarter rather than at nothing.
 *
 * AND THE CURVE IS BENT, which took a measurement to justify. A straight
 * `0.25 + 0.75 * ratio` looks like a strong dependence written down and is not
 * one on screen: the mean board luminance over a real fight moved from 87 at
 * three candles to 85 at two — a 2% change, which is nothing. AgX spends most
 * of its range compressing highlights, so a 25% cut in radiance near the top of
 * the curve is very nearly invisible. Raising `ratio` to a power puts the loss
 * where the eye still has resolution, and the same spend now costs real light.
 */
/**
 * How high the party's lantern hangs over the ring, and how far it carries.
 *
 * THE HEIGHT IS A LEGIBILITY DIAL, not a staging one, and `sprite.ts` says why
 * on `Sprite.billboard`: a piece's surface normal is the VIEW direction, so a
 * light directly overhead arrives near-edge-on to it and contributes almost
 * nothing, while the flat board underneath it is facing that light square on.
 * At z = 2 the measured result was a lit floor with pieces the same tone as it
 * — the boar's column read 92, 102, 80, 83 against a bare-board reference of
 * 92, 91, 87, 76, which is a figure you cannot see. Bringing the flame down
 * between the ranks tips the ratio the other way: less cosine on the ground,
 * much more on the standing art, and the pieces come off the board.
 */
export const LANTERN_HEIGHT = 1.15;
export const LANTERN_REACH = 5.6;

export function lanternForVigor(energy: number, maxEnergy: number, peak = 6.5): number {
  const ratio = maxEnergy > 0 ? Math.max(0, Math.min(1, energy / maxEnergy)) : 1;
  return peak * (0.2 + 0.8 * Math.pow(ratio, 1.4));
}

/** One frame of a fight, as a Scene. Rebuilt from state, never mutated. */
export function buildBattleScene(o: BattleSceneOptions): Scene {
  const cam = o.camera;
  const has = (id: string) => o.materials.has(id);
  const sprites: Sprite[] = [];
  const lights: Light[] = [];
  const extent = arenaExtent(cam);

  // --- the slab ----------------------------------------------------------
  sprites.push(
    ...boardSlabSprites(
      {
        width: extent.width,
        height: extent.height,
        border: extent.border,
        thickness: ARENA_THICKNESS,
        frameTextureId: 'frame',
        rimTextureId: 'rim',
        // BELOW the fittings, and see `BoardSlabOptions.rimLayer` for why the
        // default is wrong here specifically: the console's trays, grate and
        // cradle unproject to board y past the slab's near edge, so the rim is
        // BEHIND them and painting it last drew the board's own edge straight
        // across all three. Below `LAYER_BOARD` as well as below `LAYER_DECAL`,
        // because nothing on the slab's top surface projects into the rim's
        // band — it hangs off the near edge — so there is nothing for it to
        // lose a fight with.
        rimLayer: ARENA_RIM_LAYER,
        tableTextureId: 'table',
        shadowTextureId: 'blockshadow',
        tableGrain: 3.2,
      },
      cam,
    ),
  );

  // --- the floor ---------------------------------------------------------
  // A plain inlaid field. No occluder grid and no wall blocks: an arena is the
  // cleared ground a fight happens on, and §15's pieces have no volume to
  // occlude with anyway.
  const floorId = has(MAT_ARENA) ? MAT_ARENA : MAT_BLANK;
  for (let y = 0; y < extent.height; y++) {
    for (let x = 0; x < extent.width; x++) {
      sprites.push({
        position: { x, y, z: 0 },
        size: { x: 1, y: 1 },
        pivot: { x: 0, y: 0 },
        uv: floorId === MAT_ARENA ? cellUv(x, y) : FULL_UV,
        textureId: floorId,
        tint: floorId === MAT_ARENA ? undefined : [0.28, 0.26, 0.3, 1],
        layer: LAYER_BOARD,
      });
    }
  }

  // --- the painted backdrop, STANDING UP ---------------------------------
  // §8 item 6 is what makes this possible: while `BattleView.backdrop` was a
  // `ReactNode` the renderer could not have known there was an image, let
  // alone which one. As data it is a texture, and a texture can be a painted
  // flat standing at the back of the board — which is what a diorama is, and
  // is a better answer than the DOM `<img>` it replaces because it is LIT.
  //
  // `upright`, not `billboard`: a backdrop is a fixed vertical plane whose
  // normal points down-board at the viewer. A billboard would swing with the
  // camera, which is exactly what scenery must not do.
  //
  // IT STANDS ON THE BOARD'S FAR EDGE, not behind the frame, and that is a
  // framing decision rather than a detail. The camera's depth is set by the
  // row separation (see `arenaCamera`), which leaves about three tiles of view
  // above the enemy rank — enough for the flat OR for the frame and a strip of
  // table, not for both. A flat wins: it is the thing that says "diorama", it
  // is the only surface up there carrying any art, and the board's own edge is
  // then its base line, which is exactly how a scenery flat sits on a board.
  if (o.backdrop !== false && has(MAT_BACKDROP)) {
    sprites.push({
      position: { x: extent.width / 2, y: -0.05, z: 0 },
      size: { x: extent.width + extent.border * 2, y: BACKDROP_TILES },
      pivot: { x: 0.5, y: 1 },
      upright: true,
      uv: FULL_UV,
      textureId: MAT_BACKDROP,
      tint: [0.82, 0.82, 0.9, 1],
      // BELOW THE FITTINGS, above the floor. An upright quad takes
      // `LAYER_PIECE` from `layerOf`, which the flat only ever needed in order
      // to beat the tiles — every combatant is at board y >= ENEMY_RANK and the
      // flat stands at -0.05, so the painter sort puts it first among pieces
      // without any help. The fittings are the case that made the default
      // wrong: the Chronicle's DOM box reaches board y -1.1, past the flat's
      // base, so at `LAYER_PIECE` the flat painted a black rectangle across the
      // top quarter of `log_well` — including its brass header. Physically
      // defensible (the flat really does stand nearer the camera than that end
      // of the panel) and wrong for what a fitting IS: §1.2 gives the surface
      // under a DOM box to the renderer, and the surface under the Chronicle is
      // the well.
      layer: BACKDROP_LAYER,
    });
  }

  // --- the console body deck (§19.1, closing §22.5) -----------------------
  //
  // THE SLAB THE SIX DOM-ANCHORED FITTINGS ARE MOUNTED ON. Until this pass
  // `console_body` was baked and published with no consumer on either render
  // path, which is exactly §22.5's complaint: "the band the fittings sit on
  // is bare table." Frame-fixed like the corner brass and the strap below —
  // see `consoleBodyPlacement` for why it is not a `FurnitureBox` — so it
  // needs no DOM measurement of its own.
  //
  // TWO QUADS AT ONE RECT, timber then brass, same as every other split shape
  // in this file. `CONSOLE_BODY_LAYER` keeps it above the floor/slab and
  // below every fitting regardless of where any of the six unproject to — see
  // that constant's own doc for why the ordering cannot be left to the y-sort.
  {
    const deck = consoleBodyPlacement(extent, ARENA_THICKNESS);
    if (deck) {
      const repeatU = deck.size.x / CONSOLE_BODY_REPEAT_UNIT;
      for (const id of [MAT_CONSOLE_BODY, MAT_CONSOLE_BODY_BRASS]) {
        if (!has(id)) continue;
        sprites.push({
          position: deck.position,
          size: deck.size,
          pivot: { x: 0.5, y: 0.5 },
          uv: { u0: 0, v0: 0, u1: repeatU, v1: 1 },
          textureId: id,
          layer: CONSOLE_BODY_LAYER,
        });
      }
    }
  }

  // --- the far-left corner brass (§19.1) ----------------------------------
  //
  // ONE corner, not four. `board_corner_brass` (`tools/art/blender/bake.py`)
  // is baked for a single orientation — its own comment: "the far-left
  // corner. The other three are a row each — never a UV flip." A convex
  // chamfered corner's ALBEDO can be mirrored onto the other three corners by
  // flipping U, and would look fine; its NORMAL MAP cannot, because flipping
  // the UV samples the mirrored image without flipping the tangent-space X
  // the pixels encode, so the bevel would relight as if the corner curved the
  // wrong way the moment the lantern swung past it — exactly the "plausible
  // and lights wrong" failure `bake.py`'s header warns about elsewhere. Doing
  // this correctly needs either three more oriented bakes or a verified
  // red-channel flip, and neither exists yet, so the other three corners are
  // left bare rather than guessed at. See ENGINE_PLAN §21.7.
  if (has(MAT_CORNER_BRASS)) {
    const c = cornerBrassCentre(extent);
    sprites.push({
      position: { x: c.x, y: c.y, z: 0 },
      size: { x: CORNER_BRASS_SIZE, y: CORNER_BRASS_SIZE },
      pivot: { x: 0.5, y: 0.5 },
      uv: FULL_UV,
      textureId: MAT_CORNER_BRASS,
      layer: LAYER_BOARD,
    });
  }

  // --- the straps across the board-to-table joint (§19.1) ------------------
  //
  // "Wood with visible grain, brass with a soft bevel, STRAPS ACROSS THE SEAMS."
  // See `strapCentres` for why this seam is honest now and was not before.
  if (has(MAT_STRAP)) {
    for (const c of strapCentres(extent, ARENA_THICKNESS)) {
      sprites.push({
        position: c,
        size: { x: STRAP_FRAME.w, y: STRAP_FRAME.h },
        pivot: { x: 0.5, y: 0.5 },
        uv: FULL_UV,
        textureId: MAT_STRAP,
        layer: LAYER_DECAL,
      });
    }
  }

  // --- the HUD-anchored fittings (§19.1) ---------------------------------
  //
  // Before the pieces, so a combatant standing in front of one is drawn over
  // it — which the LAYER_DECAL/LAYER_PIECE split already guarantees, and the
  // ordering here only makes obvious.
  if (o.furniture && o.furniture.length > 0) {
    sprites.push(...furnitureSprites(o.furniture, cam, has));
  }

  // --- the pieces --------------------------------------------------------
  for (const f of o.figures) {
    const p = placeFigure(f, cam);
    const lift = f.acting ? 0.13 : 0;
    const felled = !!f.felled;
    const baseTint = felled
      ? ([0.32, 0.32, 0.36, 0.5] as const)
      : ([1, 1, 1, 1] as const);
    sprites.push(
      ...pieceBaseSprites(p.at, 'base', 'shadow', {
        radius: p.radius,
        thickness: 0.1,
        tint: [baseTint[0], baseTint[1], baseTint[2], baseTint[3]],
        shadow: { strength: felled ? 0.3 : 0.8, height: lift },
      }),
    );
    if (f.textureId && has(f.textureId)) {
      sprites.push({
        position: { x: p.at.x, y: p.at.y, z: 0.1 + lift },
        size: { x: p.width, y: p.height },
        pivot: { x: 0.5, y: 1 },
        billboard: true,
        uv: f.flip ? FLIP_UV : FULL_UV,
        textureId: f.textureId,
        tint: felled ? [0.42, 0.42, 0.46, 0.42] : undefined,
      });
    }
  }

  // --- the candles (§8 item 9) -------------------------------------------
  //
  // TWO RAILS, and only one of them is guaranteed to hold anything. The sockets
  // are cut on both frame bands whatever happens, because they are joinery; the
  // candles are seated only where a side has vigor to spend. See
  // `candleFrameRightX` for why that asymmetry is the honest answer rather than
  // a gap to be filled.
  //
  // `seed` is offset per rail so the two do not flicker in lockstep — mirrored
  // flames pulsing together reads as one animation stretched across the board
  // rather than as eight separate candles.
  const pushRail = (railX: number, vigor: { lit: number; total: number } | null, sockets: number, seed: number) => {
    // The timber the sockets are cut into — always drawn, whether or not this
    // side has any vigor, because it is joinery on the frame rather than a
    // readout of state. See `RAIL_STRIP_WIDTH`'s comment for the tiling.
    //
    // TWO QUADS AT ONE RECT, timber then brass. `bake.py`'s `split()` gives
    // both rows the same width, height and centre for exactly this — see
    // `MAT_RAIL_STRIP_BRASS`. They are pushed in that order and never sorted
    // apart, because `sortForPainting` is stable and they share a layer, a
    // position and a size.
    const length = RAIL_NEAR - RAIL_FAR;
    for (const stripId of [MAT_RAIL_STRIP, MAT_RAIL_STRIP_BRASS]) {
      if (!has(stripId)) continue;
      sprites.push({
        position: { x: railX, y: (RAIL_NEAR + RAIL_FAR) / 2, z: 0 },
        size: { x: RAIL_STRIP_WIDTH, y: length },
        pivot: { x: 0.5, y: 0.5 },
        uv: { u0: 0, v0: 0, u1: 1, v1: length / RAIL_STRIP_REPEAT_UNIT },
        textureId: stripId,
        layer: LAYER_BOARD,
      });
    }
    const socketSpots = candlePositions({ x: railX, total: sockets, lit: 0 });
    for (const spot of socketSpots) {
      if (!has(MAT_SOCKET)) break;
      sprites.push({
        position: { x: spot.x, y: spot.y, z: 0 },
        size: { x: CANDLE_WIDTH * 1.7, y: CANDLE_WIDTH * 1.7 },
        pivot: { x: 0.5, y: 0.5 },
        uv: FULL_UV,
        textureId: MAT_SOCKET,
        layer: LAYER_BOARD,
      });
    }
    if (!vigor) return;
    const rail: CandleRail = { x: railX, total: vigor.total, lit: vigor.lit };
    const spots = candlePositions(rail);
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i];
      const burning = i < rail.lit;
      sprites.push(
        contactShadowSprite(spot, 'shadow', { radius: CANDLE_WIDTH * 1.5, strength: 0.5, height: 0 }),
      );
      if (has(MAT_CANDLE)) {
        sprites.push({
          position: { x: spot.x, y: spot.y, z: 0 },
          size: { x: CANDLE_WIDTH, y: CANDLE_HEIGHT },
          pivot: { x: 0.5, y: 1 },
          upright: true,
          uv: FULL_UV,
          textureId: MAT_CANDLE,
          tint: burning ? undefined : [0.55, 0.53, 0.5, 1],
        });
      }
      if (!burning) continue;
      const centre: Vec3 = { x: spot.x, y: spot.y, z: CANDLE_HEIGHT + 0.06 };
      const size = 0.19;
      if (has('flame')) {
        const wob = flicker(i * 2.7 + seed, o.time, 0.1);
        sprites.push({
          position: { x: centre.x, y: centre.y - 0.02, z: centre.z },
          size: { x: size * wob, y: size * (2 - wob) },
          pivot: { x: 0.5, y: 1 },
          billboard: true,
          uv: FULL_UV,
          textureId: 'flame',
        });
      }
      lights.push(
        emitterLight(glowLightPosition(centre, size), {
          colour: [1, 0.58, 0.24],
          // A CANDLE LIGHTS ABOUT A HAND'S BREADTH, and the first pass did not.
          //
          // Paul: *"idk what these rays of light coming from the candles are.
          // it looks bad"* — and at 4.7x magnification they resolve as the
          // candles' own pools. The apex of every wedge sits exactly on a
          // flame. Nothing exotic: at `reach` 3.6 tiles each pool was three
          // times wider than the 1.2-tile frame band the candle stands on, so
          // it sprayed across the band and out over the field, and the 55°
          // tilt stretched the far half of each ellipse into a cone pointing
          // at the viewer. Big soft pools on a narrow dark strip read as
          // projected beams, not as candlelight.
          //
          // So the reach comes in to roughly the width of the band. It still
          // reaches the play area — Paul asked for that specifically — but as
          // a warm edge on the nearest tiles rather than as a searchlight.
          intensity: 1.05,
          reach: 2.0,
          // A wider source softens the core, which is what stops a small
          // bright light from having a hard rim where the falloff bottoms out.
          radius: 0.14,
          // AND IT HAS TO DANCE. 0.18 on a light this small was imperceptible;
          // a candle's whole character is that it is never still.
          flicker: 0.34,
          time: o.time,
          seed: i * 1.9 + 0.4 + seed,
        }),
      );
    }
  };

  // The rail is as long as the PLAYER's max vigor on both sides, so the board
  // is cut symmetrically even when only one side fills it.
  const railLength = Math.max(o.vigor.total, o.enemyVigor?.total ?? 0);
  pushRail(o.candleX ?? CANDLE_FRAME_X, o.vigor, railLength, 0);
  pushRail(candleFrameRightX(extent.width), o.enemyVigor ?? null, railLength, 11.3);

  // --- the light ---------------------------------------------------------
  // THE LANTERN THE PARTY CARRIED IN. Hung in the gap BETWEEN the two ranks,
  // for the reason `BattleScreen` already recorded against the DOM path: at
  // the top of the stage the enemies came back blown out and the hero was
  // still in the dark, which is the original complaint pointed the other way.
  //
  // THE HEIGHT AND THE REACH ARE THE WHOLE LOOK, and both were wrong on the
  // first pass in the same direction. Hung at z = 3.1 with a reach that grew
  // with the board, every tile was within a factor of 1.3 of every other tile's
  // distance to the flame, so the arena came out at one uniform brightness —
  // the "flat bright disc" `lighting.css` already names as the failure a
  // falloff exists to prevent, arrived at again from the other side. Dropping
  // it to two tiles up and FIXING the reach independently of the board's width
  // is what puts the corners in the dark and the fight in a pool.
  const midRank = (ENEMY_RANK + PARTY_RANK) / 2;
  lights.push({
    position: { x: extent.width / 2, y: midRank, z: LANTERN_HEIGHT },
    colour: [1, 0.66, 0.33],
    intensity: o.lanternIntensity ?? lanternForVigor(o.vigor.lit, o.vigor.total),
    radius: 0.22,
    reach: LANTERN_REACH,
  });

  // THE ROOM the board is sitting in (§15.1) — cool, raking, not part of the
  // fiction. Here it does more work than it does on the map: an arena has no
  // walls to stop it, so it is what keeps the far frame and the rim readable
  // when the vigor rail has burned down to nothing.
  const roomLamp = o.roomLamp ?? 0.14;
  if (roomLamp > 0) {
    lights.push({
      position: { x: -6, y: extent.height + 9, z: 16 },
      colour: [0.6, 0.68, 1],
      intensity: roomLamp,
      radius: 1.4,
      reach: Math.max(80, extent.width * 5),
      castsShadow: false,
    });
  }

  return makeScene(cam, {
    sprites,
    materials: o.materials,
    // AN EMPTY GRID, AND IT IS NOT A FORMALITY.
    //
    // An arena is cleared ground: §15's pieces have no volume to occlude with,
    // there are no wall blocks, and nothing on this board casts a cast shadow.
    // The obvious expression of that is `occluders: null`, and it is WRONG —
    // `renderer.ts:331` reads
    //
    //     useLighting = opts.lit && lights.length > 0 && scene.occluders !== null
    //
    // so a scene with no occluder grid is not "lit with nothing blocking", it
    // is NOT LIT AT ALL. The whole board came back at one flat albedo: a
    // measured horizontal profile across the field read 127, 125, 125, 121,
    // 126, 122, 128 — no falloff anywhere, which is exactly what an unlit
    // render looks like and is very easy to mistake for a light that is simply
    // too bright. An hour went into turning the lantern down.
    //
    // So the grid is present and empty. It costs one `Uint8Array` of
    // width*height zeroes, it says the true thing (there is a board, nothing on
    // it blocks light), and every ray marches to the light unobstructed.
    occluders: makeOccluderGrid(extent.width, extent.height),
    occluderHeight: 1,
    lights,
    time: o.time,
    // A hair over the map's 0.06 — `lighting.css` is right that a stone room
    // bounces and is not a moor at night — but only a hair. The first pass ran
    // 0.13 with a 0.5 room lamp and the two together lit the whole arena to a
    // flat wash that no amount of lantern falloff could carve back out.
    ambient: o.ambient ?? 0.07,
  });
}
