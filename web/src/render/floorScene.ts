// =========================================================================
// THE BRIDGE — game state in, `Scene` out.
//
// This is the ONLY file in the project that knows about both worlds, and that
// is precisely why it exists. ENGINE_PLAN §2 rule 1:
//
//   "`lantern/` never imports from `engine/` or `components/`. It takes a
//    Scene and draws it. It does not know what a monster is."
//
// A renderer that reached into `engine/` would be untestable headless and
// unportable to the next game; a game that reached into `lantern/` would have
// its rules shaped by a projection. So the coupling gets a room of its own,
// and the whole of it is a PURE FUNCTION — an `Expedition` and a `Character`
// in, sprite lists and lights out. No GL, no DOM, no React, no clock but the
// `time` it is handed.
//
// TWO THINGS THAT ARE DELIBERATE AND EASY TO UNDO BY ACCIDENT:
//
// 1. THE SETS. `isRevealed` / `isOpened` / `isBroken` are `Array.includes`
//    over floor-scoped string keys (`floors.ts:135-145`). At DOM render rates
//    — a handful of renders per move — ~250 linear scans is invisible. At 60
//    fps it is the frame budget, and ENGINE_PLAN §8 item 6 calls it out by
//    name. `snapshotFloor` converts them ONCE per state change, into bare
//    "x,y" keys with the floor prefix already stripped, and every hot loop
//    below reads a `Set`. `floors.ts` is not touched: its signatures are the
//    game's, and this is a rendering concern.
//
// 2. THE FOG IS BLACK GEOMETRY, not an absent draw. An unrevealed tile gets an
//    opaque black quad rather than simply being skipped, because the board is
//    a physical slab (`board.ts`) and skipping the tile would show the FRAME's
//    timber through the hole. ENGINE_PLAN §14.1: fog of war is a physical
//    fact, not a UI convention — so the unexplored board is present, and dark.
// =========================================================================

import type { Character } from '../engine/entities/Character';
import type { FloorUnit, Expedition } from '../engine/systems/floors';
import { TILE, floorOf, lanternRadius } from '../engine/systems/floors';
import { BALANCE } from '../engine/data/balance';

import type { Camera } from '../lantern/scene/camera';
import { makeScene, makeOccluderGrid, setSolid, type Light, type Material, type Scene } from '../lantern/scene/scene';
import { LAYER_BOARD, type Sprite, type UVRect } from '../lantern/scene/sprite';
import { pieceBaseSprites, wallBlockSprites, contactShadowSprite } from '../lantern/scene/piece';
import { boardSlabSprites } from '../lantern/scene/board';
import { mushroomEmitter, mushroomSpots, sconceEmitter, wispEmitter, wispPaths, hashCoord } from '../lantern/scene/emitters';

// -------------------------------------------------------------------------
// MATERIAL IDS — stated once, so the builder and the loader cannot disagree
// -------------------------------------------------------------------------

export const MAT_GROUND = 'ground';
export const MAT_WALL = 'wall';
export const MAT_HERO = 'hero';
/** A 1x1 opaque white texel. Tinted black, it is the fog; it is also anything
 *  that needs a flat quad and no art. */
export const MAT_BLANK = 'blank';

/** The icon a tile shows when it is not plain floor, or null for plain floor. */
export function objectIcon(tile: string): string | null {
  switch (tile) {
    case TILE.START:
      return 'door';
    case TILE.STAIRS:
      return 'stairs';
    case TILE.BOSS:
      return 'boss';
    case TILE.BREAKABLE:
      return 'barrel';
    case TILE.CHEST:
      return 'chest';
    case TILE.SHRINE:
      return 'shrine';
    case TILE.EVENT:
      return 'event';
    case TILE.SECRET:
      return 'secret';
    default:
      return null;
  }
}

export function iconTextureId(icon: string): string {
  return `icon:${icon}`;
}

/** Which painted figure stands on a unit's plinth. */
export function unitTextureId(unit: FloorUnit): string {
  if (unit.kind === 'merchant') return 'sprite:merchant';
  if (unit.kind === 'tamer') return 'sprite:tamer';
  return unit.speciesId ? `monster:${unit.speciesId}` : 'sprite:tamer';
}

// -------------------------------------------------------------------------
// THE SNAPSHOT — the linear scans, paid once
// -------------------------------------------------------------------------

export interface FloorSnapshot {
  gateId: string;
  floorIndex: number;
  /** Tile rows, padded to `width` with WALL so ragged authored grids are square. */
  rows: string[];
  width: number;
  height: number;
  /** Bare "x,y" keys — the floor prefix is already stripped. */
  revealed: Set<string>;
  opened: Set<string>;
  broken: Set<string>;
  units: FloorUnit[];
  /** Where the reducer says the hero is. The renderer glides toward it. */
  heroTile: { x: number; y: number };
  /** Pool radius in tiles — the same expression `FloorScreen` gives LightLayer. */
  lightCells: number;
  bossDefeated: boolean;
}

function bareKeys(scoped: readonly string[], prefix: string): Set<string> {
  const out = new Set<string>();
  for (const key of scoped) if (key.startsWith(prefix)) out.add(key.slice(prefix.length));
  return out;
}

/**
 * Everything the builder needs, with every `Array.includes` already paid for.
 *
 * Cheap enough to run per state change and far too expensive to run per tile
 * per frame, which is exactly what the DOM path does today — see the note at
 * the top of the file. Call it from a `useMemo` keyed on the arrays' identity;
 * the reducer is immutable, so identity changes exactly when the contents do.
 */
export function snapshotFloor(exp: Expedition, player: Character, bossDefeated: boolean): FloorSnapshot {
  const floor = floorOf(exp);
  const width = Math.max(1, ...floor.grid.map((r) => r.length));
  const height = floor.grid.length;
  const rows = floor.grid.map((r) => (r.length >= width ? r : r + TILE.WALL.repeat(width - r.length)));
  const prefix = `${exp.gateId}:${exp.floorIndex}:`;
  return {
    gateId: exp.gateId,
    floorIndex: exp.floorIndex,
    rows,
    width,
    height,
    revealed: bareKeys(exp.revealed, prefix),
    opened: bareKeys(exp.opened, prefix),
    broken: bareKeys(exp.broken, prefix),
    // NOTE: `litTiles` is deliberately NOT called here. On the DOM path it
    // decides which tiles look lit; on this one the lantern is a real light
    // and the shader answers that question per fragment. Calling it anyway
    // would be a BFS per state change to produce a Set nothing reads.
    units: exp.units,
    heroTile: { x: exp.x, y: exp.y },
    // Stated once in FloorScreen and mirrored here on purpose: the pool's
    // radius IS the move budget (see the comment on `reachCells` there), so
    // the light closing in as movement is spent is a game reading, not a
    // lighting one, and it must survive the port.
    lightCells: exp.movLeft + 0.7 + (lanternRadius(player) - BALANCE.lanternRadius),
    bossDefeated,
  };
}

export function tileAtSnapshot(snap: FloorSnapshot, x: number, y: number): string {
  if (y < 0 || y >= snap.height) return TILE.WALL;
  const row = snap.rows[y];
  if (x < 0 || x >= row.length) return TILE.WALL;
  return row[x];
}

/**
 * What a tile RESOLVES to once the expedition's history is applied.
 *
 * The same collapse `FloorScreen` performs inline: an opened chest is floor, a
 * smashed barrel is floor, a spawn marker whose unit is alive is floor (the
 * unit is drawn separately), a defeated gate warden is floor, and a secret is
 * only itself while you are standing next to it.
 */
export function resolvedTile(snap: FloorSnapshot, x: number, y: number, heroTile: { x: number; y: number }): string {
  const ch = tileAtSnapshot(snap, x, y);
  const key = `${x},${y}`;
  if (ch === TILE.WALL || ch === TILE.FLOOR) return ch;
  if (snap.opened.has(key) && (ch === TILE.CHEST || ch === TILE.SHRINE || ch === TILE.EVENT || ch === TILE.BOSS || ch === TILE.SECRET)) {
    return TILE.FLOOR;
  }
  if (ch === TILE.BREAKABLE && snap.broken.has(key)) return TILE.FLOOR;
  if (ch === TILE.SECRET) {
    const adjacent = Math.abs(x - heroTile.x) + Math.abs(y - heroTile.y) === 1;
    return adjacent ? ch : TILE.FLOOR;
  }
  if (ch === TILE.BOSS && snap.bossDefeated) return TILE.FLOOR;
  if (ch === TILE.ENEMY || ch === TILE.MINIBOSS || ch === TILE.TAMER || ch === TILE.MERCHANT) return TILE.FLOOR;
  return ch;
}

// -------------------------------------------------------------------------
// THE BUILD
// -------------------------------------------------------------------------

export interface FloorSceneOptions {
  camera: Camera;
  /** Seconds. Drives flicker and drift; a fixed value gives a fixed frame. */
  time: number;
  /** Where the hero PIECE is right now, mid-glide. Usually not his tile. */
  heroAt: { x: number; y: number };
  /** Only ids present here are drawn — an unloaded texture is silently skipped. */
  materials: Map<string, Material>;
  ambient?: number;
  lanternIntensity?: number;
  roomLamp?: number;
  /** §12.4's faint scenery. Off is a legal, duller board. */
  emitters?: boolean;
  mushroomDensity?: number;
  sconceDensity?: number;
  wispCount?: number;
}

/** Frame width around the play area, in tiles. Matches the harness's slab. */
export const BOARD_BORDER = 1.35;
export const BOARD_THICKNESS = 0.5;
/** The shortest a wall block can stand. Fed to `Scene.occluderHeight`. */
export const BLOCK_MIN_HEIGHT = 0.66;

/**
 * Per-block height, hashed off the tile.
 *
 * Blocks all exactly one height read as an extrusion of the floor plan; a few
 * percent of variation reads as separate objects somebody placed. Hashed, not
 * random, for the reason every generator in this engine is: a frame must be a
 * pure function of state, or no pixel diff in this project means anything.
 */
export function blockHeight(x: number, y: number): number {
  return BLOCK_MIN_HEIGHT + hashCoord(x, y, 41) * 0.13;
}

/** Window the shared tile texture per cell so neighbours do not visibly repeat. */
function cellUv(x: number, y: number): UVRect {
  const u = ((x % 4) + 4) % 4;
  const v = ((y % 4) + 4) % 4;
  return { u0: u / 4, v0: v / 4, u1: (u + 1) / 4, v1: (v + 1) / 4 };
}

const FULL_UV: UVRect = { u0: 0, v0: 0, u1: 1, v1: 1 };

/**
 * One frame of a real expedition floor, as a Scene.
 *
 * Rebuilt from state every frame rather than mutated in place — the same
 * discipline the game's reducer keeps, and the reason the renderer can be
 * stateless about the world and still survive a lost GL context.
 */
export function buildFloorScene(snap: FloorSnapshot, o: FloorSceneOptions): Scene {
  const has = (id: string) => o.materials.has(id);
  const sprites: Sprite[] = [];
  const lights: Light[] = [];

  // --- the occupancy grid ------------------------------------------------
  // Walls only. A barrel is a painted object standing in the middle of a tile,
  // not the tile — the DOM path had to special-case that with a separate
  // occluder selector, and on a grid the honest answer is that it is too small
  // to be a tile-sized occluder at all.
  const grid = makeOccluderGrid(snap.width, snap.height);
  for (let y = 0; y < snap.height; y++) {
    for (let x = 0; x < snap.width; x++) {
      if (tileAtSnapshot(snap, x, y) === TILE.WALL) setSolid(grid, x, y, true);
    }
  }

  // --- the slab ----------------------------------------------------------
  sprites.push(
    ...boardSlabSprites(
      {
        width: snap.width,
        height: snap.height,
        border: BOARD_BORDER,
        thickness: BOARD_THICKNESS,
        frameTextureId: 'frame',
        rimTextureId: 'rim',
        tableTextureId: 'table',
        shadowTextureId: 'blockshadow',
        tableGrain: 3.2,
      },
      o.camera,
    ),
  );

  // --- the tiles ---------------------------------------------------------
  for (let y = 0; y < snap.height; y++) {
    for (let x = 0; x < snap.width; x++) {
      const key = `${x},${y}`;
      if (!snap.revealed.has(key)) {
        // Fog: present, and dark. See the file header — an absent quad would
        // show the frame's timber through the hole in the board.
        sprites.push({
          position: { x, y, z: 0 },
          size: { x: 1, y: 1 },
          pivot: { x: 0, y: 0 },
          uv: FULL_UV,
          textureId: MAT_BLANK,
          tint: [0, 0, 0, 1],
          layer: LAYER_BOARD,
        });
        continue;
      }
      const raw = tileAtSnapshot(snap, x, y);
      if (raw === TILE.WALL) {
        const h = blockHeight(x, y);
        const ahead = tileAtSnapshot(snap, x, y + 1);
        // A face buried behind a taller neighbour costs a quad and a batch
        // break to draw something nobody can see — but ONLY if the neighbour
        // is at least as tall, or the sliver that shows through is whatever is
        // under the board, which reads as a bright glitch line.
        const front = ahead !== TILE.WALL || blockHeight(x, y + 1) < h;
        sprites.push(
          ...wallBlockSprites(
            { x, y },
            {
              textureId: MAT_WALL,
              height: h,
              topUv: cellUv(x, y),
              frontUv: { u0: cellUv(x, y).u0, v0: 0.5, u1: cellUv(x, y).u1, v1: 1 },
              front,
              topTint: [0.88, 0.88, 0.92, 1],
              frontTint: [0.78, 0.78, 0.84, 1],
              shadowTextureId: 'blockshadow',
              shadowStrength: 0.55,
            },
          ),
        );
        continue;
      }

      sprites.push({
        position: { x, y, z: 0 },
        size: { x: 1, y: 1 },
        pivot: { x: 0, y: 0 },
        uv: cellUv(x, y),
        textureId: MAT_GROUND,
      });

      const tile = resolvedTile(snap, x, y, snap.heroTile);
      const icon = objectIcon(tile);
      if (icon) {
        const id = iconTextureId(icon);
        if (has(id)) {
          // A thing standing ON the tile, so it gets the same three-part
          // treatment a piece gets minus the plinth: shadow, then figure.
          // Without the contact shadow it reads as a sticker (§15.1).
          sprites.push(
            contactShadowSprite({ x: x + 0.5, y: y + 0.5 }, 'shadow', { radius: 0.34, strength: 0.62, height: 0 }),
            {
              position: { x: x + 0.5, y: y + 0.5, z: 0 },
              size: { x: 0.78, y: 0.78 },
              pivot: { x: 0.5, y: 1 },
              billboard: true,
              uv: FULL_UV,
              textureId: id,
            },
          );
        }
      }
    }
  }

  // --- the pieces --------------------------------------------------------
  for (const unit of snap.units) {
    if (!snap.revealed.has(`${unit.x},${unit.y}`)) continue;
    const id = unitTextureId(unit);
    sprites.push(...pieceBaseSprites({ x: unit.x + 0.5, y: unit.y + 0.5 }, 'base', 'shadow', { radius: 0.36 }));
    if (has(id)) {
      sprites.push({
        position: { x: unit.x + 0.5, y: unit.y + 0.5, z: 0.11 },
        size: { x: 1.0, y: 1.0 },
        pivot: { x: 0.5, y: 1 },
        billboard: true,
        uv: FULL_UV,
        textureId: id,
      });
    }
  }

  // The hero, at his INTERPOLATED position — see `render/walk.ts`. The reducer
  // has already moved him; the piece is still on its way, and so is the light,
  // which is the entire reason the glide was worth keeping.
  const hero = { x: o.heroAt.x + 0.5, y: o.heroAt.y + 0.5 };
  sprites.push(...pieceBaseSprites(hero, 'base', 'shadow', { radius: 0.4, thickness: 0.11 }));
  if (has(MAT_HERO)) {
    sprites.push({
      position: { x: hero.x, y: hero.y, z: 0.11 },
      size: { x: 1.1, y: 1.55 },
      pivot: { x: 0.5, y: 1 },
      billboard: true,
      uv: FULL_UV,
      textureId: MAT_HERO,
    });
  }

  // --- the light ---------------------------------------------------------
  // THE LAST LANTERN. One bright source, carried, above the piece's head.
  lights.push({
    position: { x: hero.x, y: hero.y, z: 0.9 },
    colour: [1, 0.62, 0.28],
    // 7, not the harness's 9, and the difference is the REACH rather than a
    // change of taste. `lightCells` on a real floor is around 4.7 tiles
    // against the harness's 7, and a shorter falloff window puts more of the
    // same radiance on the tiles nearest the flame — so the pool came out
    // near-white on stone that should read as lit sandstone.
    intensity: o.lanternIntensity ?? 7,
    radius: 0.18,
    // The pool ends exactly where the walk ends, which is the reading
    // FloorScreen's `reachCells` established and this must not quietly change.
    reach: Math.max(2, snap.lightCells),
  });

  // THE ROOM the board is sitting in, not the dungeon (§15.1). It casts, which
  // is what keeps it out of the fiction: raking from the near-left, the slab's
  // own border blocks shadow the interior from it completely, so it lands on
  // the table, the rim and the frame and stops dead at the wall.
  // Dimmer than the harness's 1.0, and for a reason the harness could not see:
  // its board had a solid ring of border blocks, so the lamp genuinely stopped
  // at the wall. A REAL floor's outer wall is one block tall and the lamp sits
  // 15 tiles up, so the ray from an interior tile clears it almost at once and
  // a cold wash reaches the dungeon floor — which is precisely the thing §12
  // says must not happen. Lowered rather than removed, because without it the
  // rim, the frame and the table are lit by ambient alone and every bit of
  // §11's edge work is invisible.
  const roomLamp = o.roomLamp ?? 0.32;
  if (roomLamp > 0) {
    lights.push({
      position: { x: -5, y: snap.height + 8, z: 15 },
      colour: [0.6, 0.68, 1],
      intensity: roomLamp,
      radius: 1.4,
      reach: Math.max(95, snap.width * 4),
    });
  }

  // --- the scenery (§12.4) ----------------------------------------------
  if (o.emitters !== false) {
    const revealedOnly = (x: number, y: number) => snap.revealed.has(`${Math.floor(x)},${Math.floor(y)}`);

    for (const spot of mushroomSpots(grid, { density: o.mushroomDensity ?? 0.3 })) {
      if (!revealedOnly(spot.x, spot.y)) continue;
      const e = mushroomEmitter(spot, { time: o.time, seed: spot.x * 3.1 + spot.y });
      if (has('mushroom')) sprites.push(...e.sprites);
      lights.push(e.light);
    }

    const sconceDensity = o.sconceDensity ?? 0.12;
    if (sconceDensity > 0) {
      for (let y = 0; y < snap.height; y++) {
        for (let x = 0; x < snap.width; x++) {
          if (tileAtSnapshot(snap, x, y) !== TILE.WALL) continue;
          // Only where the block actually draws a front face, or the flame is
          // a light floating inside solid rock.
          if (tileAtSnapshot(snap, x, y + 1) === TILE.WALL) continue;
          if (!snap.revealed.has(`${x},${y + 1}`)) continue;
          if (hashCoord(x, y, 17) > sconceDensity) continue;
          const e = sconceEmitter({ x, y }, { time: o.time, seed: x * 1.7 + y * 2.3 });
          if (has('flame')) sprites.push(...e.sprites);
          lights.push(e.light);
        }
      }
    }

    const wispCount = o.wispCount ?? 5;
    if (wispCount > 0) {
      const paths = wispPaths(grid, { count: wispCount, radius: 2.6 });
      for (const path of paths) {
        const e = wispEmitter(path, o.time);
        if (has('wisp')) sprites.push(...e.sprites);
        lights.push(e.light);
      }
    }
  }

  return makeScene(o.camera, {
    sprites,
    materials: o.materials,
    occluders: grid,
    occluderHeight: BLOCK_MIN_HEIGHT,
    lights,
    time: o.time,
    ambient: o.ambient ?? 0.06,
  });
}
