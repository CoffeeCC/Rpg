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
  /** How much of the normal map to apply, 0..2. Per-material, because derived
   *  normals need taming per asset and hand-authored ones do not. */
  normalStrength?: number;
  /** 0 matte, 1 mirror. Drives the specular lobe at M2. */
  roughness?: number;
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
