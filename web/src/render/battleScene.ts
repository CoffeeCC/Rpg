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
import { LAYER_BOARD, type Sprite, type UVRect } from '../lantern/scene/sprite';
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

/** Board fixture ids that are not yet requested by anything — see ENGINE_PLAN §21.7. */
export const MAT_RAIL_STRIP = 'railStrip';
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
    });
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
    if (has(MAT_RAIL_STRIP)) {
      const length = RAIL_NEAR - RAIL_FAR;
      sprites.push({
        position: { x: railX, y: (RAIL_NEAR + RAIL_FAR) / 2, z: 0 },
        size: { x: RAIL_STRIP_WIDTH, y: length },
        pivot: { x: 0.5, y: 0.5 },
        uv: { u0: 0, v0: 0, u1: 1, v1: length / RAIL_STRIP_REPEAT_UNIT },
        textureId: MAT_RAIL_STRIP,
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
