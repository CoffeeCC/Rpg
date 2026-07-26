// =========================================================================
// THE SCENE — the one thing the renderer is allowed to know about.
//
// `docs/ENGINE_PLAN.md` §2 states the rule this file exists to make real:
// `lantern/` never imports from `engine/` or `components/`, and never reads
// the DOM. It takes a Scene and draws it. It does not know what a monster is.
//
// Until now that rule was easy to keep because there was nothing to break it
// with — a box of parts (camera, batcher, bloom, tonemap) and no assembly. The
// Scene is the assembly's input, and defining it is what gives every later
// milestone somewhere to plug in rather than somewhere to be bolted on.
//
// EVERYTHING HERE IS IN WORLD UNITS — tiles, not pixels. That is the decision
// from LIGHTING_PLAN §12, and it is the one that keeps the projection a
// rendering choice rather than a fact baked through the whole engine. `zoom`
// on the Camera is the only number in the system that knows what a pixel is.
// =========================================================================

import type { Camera, Vec2, Vec3 } from './camera';
import type { Sprite } from './sprite';

export type RGB = [r: number, g: number, b: number];

/**
 * A surface's material. Keyed by the same id sprites batch on, so a batch is
 * exactly "the run of sprites that share a material" and nothing has to
 * reconcile two different notions of identity.
 *
 * Only `albedo` is consumed at M1. The rest are declared now because the
 * board-game model (§1.2) says every object answers one question — *what is
 * this made of?* — and a material with nowhere to record the answer would
 * mean re-plumbing every call site at M2.
 */
export interface Material {
  id: string;
  /** Base colour. Un-shaded — see the art brief; lighting painted in double-shades. */
  albedo: WebGLTexture | null;
  /** Tangent-space normals. M2. Null means "flat, facing the viewer". */
  normal?: WebGLTexture | null;
  /** What glows on its own. M6. Ember cracks, shrine glyphs, a boss's eyes. */
  emissive?: WebGLTexture | null;
  /**
   * How much of this material's ALBEDO glows on its own, before any light.
   *
   * The scalar stand-in for the `emissive` texture above, and the reason it
   * arrived early is ENGINE_PLAN §12's "very tiny" instruction taken
   * literally. A wisp has to look BRIGHT and light almost NOTHING — a pinprick
   * of green that says how dark the corridor is without making the corridor
   * legible. Those are two different numbers, and while a sprite is only ever
   * visible by the light falling on it they are forced to be one: turn the
   * wisp down until it lights nothing and it stops being visible; turn it up
   * until it reads and it is a second lantern.
   *
   * So the emitter's brightness lives here and its reach lives on the `Light`,
   * and they are free to disagree — which is what they physically do. Undefined
   * or 0 is an ordinary surface, which is every material that existed before.
   *
   * M6 replaces the scalar with the map; the shader term is the same one.
   */
  emissiveStrength?: number;
  /** How much of the normal map to apply, 0..2. Per-material, because derived
   *  normals need taming per asset and hand-authored ones do not. */
  normalStrength?: number;
  /** 0 matte, 1 mirror. Drives the specular lobe at M2. */
  roughness?: number;
  /**
   * WHAT THIS SURFACE IS MADE OF, PER PIXEL. One RGBA map, four properties:
   *
   *   R  roughness   0 mirror-bright, 1 matte. Sets the specular exponent.
   *   G  specular    how much lobe there is at all. 0 kills it outright.
   *   B  iridescence holo/foil amount. Drives the view-angle hue sweep.
   *   A  occlusion   ambient occlusion. Multiplies the ambient term only.
   *
   * WHY ONE TEXTURE AND NOT FOUR FIELDS. Everything Paul has asked for in the
   * last hour turns out to be the same missing capability, and none of it is
   * expressible as a per-material scalar:
   *
   *   "wherever there is wood joints meeting ... to be brass fittings, so we
   *    can play with reflective metal and the lighting"
   *   "Needs to have some shiny aspects like the borders and the backs"
   *   "would it be possible to add Real holographic artwork"
   *   "maybe even just on specific parts of the art so excentuate them"
   *
   * Brass beside oak, gilt beside card stock, foil on SOME of a card and not
   * the rest — each needs the shader to know what it is looking at where it is
   * looking, not once per draw. `roughness` above is a scalar and was never
   * read by anything; it stays as the fallback when there is no map.
   *
   * THE ALPHA CHANNEL PAYS FOR THE WHOLE THING ON ITS OWN. `bake.py` has been
   * emitting an AO pass for every shape since M0 and the lit shader never
   * sampled it — contact darkening in every groove, bolt head and mitre,
   * generated and thrown away. Folding it in here costs no new bake and no
   * extra fetch.
   *
   * Null or absent is the surface every material had before this existed: the
   * scalar uniforms, no iridescence, no occlusion.
   */
  material?: WebGLTexture | null;
  /**
   * How strongly this surface reads as SEPARATE TILES, 0..1.
   *
   * A board's floor is inlaid or printed pieces with edges between them; a
   * cave floor is one continuous rock texture. Same art either way — the
   * difference is a seam and a chamfer at every whole-tile boundary, and it
   * is the difference between "terrain you are inside" and "a board you are
   * looking at" (ENGINE_PLAN §11).
   *
   * A property of the MATERIAL, not of any one quad, so it costs a uniform
   * and no vertex bandwidth. Undefined or 0 leaves the surface continuous —
   * which is right for a table top, a piece, or a backdrop.
   */
  inlay?: number;
}

/**
 * A light on the board.
 *
 * `radius` is the flame's PHYSICAL SIZE and it is not cosmetic: a light of
 * zero size casts a knife-edge shadow, which is why point lights read as
 * cutouts. Sampling across the radius is the reason penumbrae exist. The old
 * engine learned this the hard way (`lightEngine.ts`), and the number carries
 * over rather than being rediscovered.
 *
 * NOT CONSUMED AT M1. The renderer draws sprites, bloom and tonemap only.
 * Declared here so M2's direct pass and M5's cascade solver have an agreed
 * shape to read, and so a scene builder written today does not need changing
 * when they land.
 */
export interface Light {
  /** World position. `z` is height ABOVE the board — a hung lantern has z > 0. */
  position: Vec3;
  colour: RGB;
  /** Peak radiance. Well above 1: that is the point of an HDR pipeline. */
  intensity: number;
  /** Flame size in tiles. Drives penumbra width. */
  radius: number;
  /** Where the light stops mattering, in tiles. Culling and falloff window. */
  reach: number;
  /**
   * Contributes to the indirect solve only, casting no sharp shadow.
   *
   * The escape hatch from LIGHTING_PLAN §4 Phase 5, inverted to a default:
   * the vector direct pass costs O(lights) and the lattice costs O(1) in
   * lights, so a shrine down a corridor should be free by default and only
   * promoted into the direct pass deliberately.
   */
  indirectOnly?: boolean;
  /**
   * March the occupancy grid for this light. Default true.
   *
   * False is not a cheat, it is a statement about what the light IS. Two
   * kinds want it. The faint emitters of ENGINE_PLAN §12.2 — a glowing
   * mushroom, a drifting wisp — should not throw a hard-edged shadow across
   * a room, because a dim source physically does not. And the ROOM LIGHT the
   * board is sitting in is outside the fiction entirely: it falls on the
   * table, the rim and the frame, and the dungeon's own walls have no
   * business occluding it.
   *
   * It is also where most of a light's cost goes, which is what makes "many
   * faint ones" affordable at all.
   */
  castsShadow?: boolean;
}

/**
 * What blocks light, as an occupancy grid in TILE space.
 *
 * Not a list of rectangles measured off the DOM — that was the old engine's
 * approach and LIGHTING_PLAN §12 retired it for three reasons: it forced
 * axis-aligned bounding boxes, it tied the light to the projection, and
 * `getBoundingClientRect` on a transformed element returns the box rather than
 * the shape, which on a fog-of-war grid is a lie about what you can see.
 *
 * A grid is exact. A tile is solid or it is not. It also deletes the
 * `occluderPad` fudge, which only ever existed because CSS put a 2px gap
 * between two cells that represent one continuous wall.
 */
export interface OccluderGrid {
  width: number;
  height: number;
  /** Row-major, length `width * height`. Non-zero blocks light. */
  solid: Uint8Array;
}

export function makeOccluderGrid(width: number, height: number): OccluderGrid {
  return { width, height, solid: new Uint8Array(Math.max(0, width * height)) };
}

/** Bounds-checked read. Off-grid counts as SOLID — see `isSolid`. */
export function isSolid(grid: OccluderGrid, x: number, y: number): boolean {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  // Outside the floor is rock, not open sky. Treating it as empty would let
  // light leak in around the edge of every map and would make the boundary
  // the brightest thing on screen.
  if (ix < 0 || iy < 0 || ix >= grid.width || iy >= grid.height) return true;
  return grid.solid[iy * grid.width + ix] !== 0;
}

export function setSolid(grid: OccluderGrid, x: number, y: number, solid: boolean): void {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= grid.width || iy >= grid.height) return;
  grid.solid[iy * grid.width + ix] = solid ? 1 : 0;
}

/**
 * One frame's worth of world, and the renderer's entire input.
 *
 * Rebuilt from game state each frame rather than mutated in place — the same
 * discipline the game's reducer already keeps. A frame is a pure function of
 * state plus time, which is what makes the renderer testable without a game
 * and the game playable without a renderer.
 */
export interface Scene {
  camera: Camera;
  /** Painter order is derived, not authored. See `sortForPainting`. */
  sprites: Sprite[];
  /** Keyed by `Sprite.textureId`. A sprite whose material is missing is skipped. */
  materials: Map<string, Material>;
  /** M2+. Empty is legal and means "fully lit", not "black". */
  lights: Light[];
  /** M5+. Null means nothing blocks anything. */
  occluders: OccluderGrid | null;
  /**
   * How tall a solid tile in `occluders` stands, in tiles.
   *
   * The grid says WHERE, not how tall, and that was invisible until walls
   * became blocks with visible tops (ENGINE_PLAN §12.1): a receiver standing
   * on top of the wall layer cannot be shadowed BY the wall layer, but a flat
   * grid shadows it from every neighbour and a whole run of wall goes black.
   * One number closes it.
   *
   * KNOWN EXPIRY: §14 takes the map vertical, so blocks stop all being the
   * same height and this becomes a per-tile column height on `OccluderGrid`.
   * `traceShadow` is already shaped for that swap; see the note there.
   */
  occluderHeight: number;
  /**
   * Colour of unlit ground. Not black.
   *
   * Night outdoors is a desaturated blue — the eye's own low-light response
   * plus skylight — and darkening warm art toward pure black greys it out,
   * while darkening it toward this keeps it looking like a place at night
   * rather than a photo with the brightness pulled down. Carried over from
   * `lightEngine.ts`, where it was learned rather than chosen.
   */
  night: RGB;
  /**
   * Light left where nothing reaches, 0..1.
   *
   * A stopgap with a death sentence already written: LIGHTING_PLAN §2 deletes
   * it at M5, when the radiance lattice supplies the real thing. Until then a
   * flat constant is an honest placeholder and a dishonest shadow.
   */
  ambient: number;
  /** Seconds since start. Drives flicker; deterministic for a given value. */
  time: number;
}

export function makeScene(camera: Camera, partial: Partial<Scene> = {}): Scene {
  return {
    camera,
    sprites: partial.sprites ?? [],
    materials: partial.materials ?? new Map(),
    lights: partial.lights ?? [],
    occluders: partial.occluders ?? null,
    occluderHeight: partial.occluderHeight ?? 1,
    night: partial.night ?? [6 / 255, 9 / 255, 18 / 255],
    ambient: partial.ambient ?? 0.18,
    time: partial.time ?? 0,
  };
}

/**
 * Drop sprites the camera cannot see, before any GPU work is done.
 *
 * The single most valuable thing a renderer does on a big floor: a dungeon
 * level is ~250 tiles plus props, and most of them are off screen. Culling on
 * the CPU against `visibleBounds` costs a comparison each; drawing them costs
 * a quad each plus everything downstream.
 *
 * Sprites are culled on the box they actually occupy, not their anchor point —
 * a tall piece whose feet are below the viewport still pokes into it, and
 * culling on the pivot alone makes pieces pop in at the bottom edge.
 */
export function cullSprites(sprites: readonly Sprite[], bounds: Bounds): Sprite[] {
  const out: Sprite[] = [];
  for (const s of sprites) {
    const pivot = s.pivot ?? { x: 0.5, y: 1 };
    const minX = s.position.x - s.size.x * pivot.x;
    const maxX = minX + s.size.x;
    // `size.y` extends UP from the pivot in board terms, and height above the
    // board pushes further up the screen still — both widen the far edge.
    const maxY = s.position.y + s.size.y * (1 - pivot.y);
    const minY = s.position.y - s.size.y * pivot.y - s.position.z;
    if (maxX < bounds.minX || minX > bounds.maxX) continue;
    if (maxY < bounds.minY || minY > bounds.maxY) continue;
    out.push(s);
  }
  return out;
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Lights the camera cannot see cannot light anything it can. */
export function cullLights(lights: readonly Light[], bounds: Bounds): Light[] {
  return lights.filter(
    (l) =>
      l.position.x + l.reach >= bounds.minX &&
      l.position.x - l.reach <= bounds.maxX &&
      l.position.y + l.reach >= bounds.minY &&
      l.position.y - l.reach <= bounds.maxY,
  );
}

/** Convenience for scene builders: a tile-sized sprite sitting on the board. */
export function tileSprite(x: number, y: number, textureId: string, uv: Sprite['uv']): Sprite {
  return {
    position: { x, y, z: 0 },
    size: { x: 1, y: 1 } as Vec2,
    pivot: { x: 0, y: 0 },
    uv,
    textureId,
  };
}
