// =========================================================================
// THE BRIDGE, on a real expedition.
//
// The point of these is not that a Scene comes out — it is that the SPECIFIC
// things ENGINE_PLAN §8 warns about are handled, and that each of them would
// fail if the handling were removed. Per LIGHTING_PLAN §10: prefer a test that
// REJECTS the old behaviour over one that describes the new.
//
//   §8 item 6   `isRevealed`/`isOpened`/`isBroken` are Array.includes. The
//               snapshot converts them ONCE, so the builder never scans.
//   §14.1       fog of war is a physical fact: an unexplored tile is present
//               and BLACK, not absent — absent shows the frame's timber.
//   §2 rule 1   nothing under `lantern/` may import `engine/`.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { gameReducer, initialGameState, type GameState } from '../../engine/game';
import { TILE } from '../../engine/systems/floors';
import { makeCamera } from '../../lantern/scene/camera';
import type { Material } from '../../lantern/scene/scene';
import { isSolid } from '../../lantern/scene/scene';
import {
  MAT_BLANK,
  MAT_GROUND,
  MAT_HERO,
  MAT_WALL,
  blockHeight,
  buildFloorScene,
  iconTextureId,
  objectIcon,
  resolvedTile,
  snapshotFloor,
  unitTextureId,
} from '../floorScene';

function expedition(): GameState {
  let state = gameReducer(initialGameState(), {
    type: 'CREATE_CHARACTER',
    name: 'Aria',
    race: 'Human',
    className: 'Warrior',
  });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
  return gameReducer(state, { type: 'ENTER_GATE', gateId: 'hollow' });
}

/** Every id the builder can ask for, so nothing is skipped for want of art. */
function allMaterials(): Map<string, Material> {
  const ids = [
    MAT_BLANK,
    MAT_GROUND,
    MAT_WALL,
    MAT_HERO,
    'shadow',
    'blockshadow',
    'base',
    'frame',
    'rim',
    'table',
    'flame',
    'mushroom',
    'wisp',
    'sprite:merchant',
    'sprite:tamer',
  ];
  const m = new Map<string, Material>();
  for (const id of ids) m.set(id, { id, albedo: null });
  return m;
}

const CAMERA = makeCamera({ centre: { x: 9, y: 7 }, zoom: 40, viewport: { x: 1280, y: 800 } });

describe('the snapshot pays the linear scans once', () => {
  it('turns the floor-scoped key arrays into bare Sets', () => {
    const state = expedition();
    const exp = state.expedition!;
    const snap = snapshotFloor(exp, state.player!, false);

    // `revealed` arrives as `${gate}:${floor}:${x},${y}`. Anything still
    // carrying the prefix means every lookup in the builder misses and the
    // whole board renders as fog — which is exactly what happened the first
    // time this was written against `openKey` instead of stripping.
    for (const key of snap.revealed) expect(key).toMatch(/^\d+,\d+$/);
    expect(snap.revealed.has(`${exp.x},${exp.y}`)).toBe(true);
    expect(snap.revealed.size).toBeGreaterThan(0);
  });

  it('keys of another floor never leak in', () => {
    const state = expedition();
    const exp = { ...state.expedition!, revealed: ['hollow:0:3,3', 'hollow:9:4,4', 'verdant:0:5,5'] };
    const snap = snapshotFloor(exp, state.player!, false);
    expect(snap.revealed.has('3,3')).toBe(true);
    expect(snap.revealed.has('4,4')).toBe(false);
    expect(snap.revealed.has('5,5')).toBe(false);
  });

  it('pads a ragged authored grid to a rectangle', () => {
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    for (const row of snap.rows) expect(row.length).toBe(snap.width);
  });
});

describe('the tile resolve matches what the DOM path draws', () => {
  it('an opened chest is floor and a smashed barrel is floor', () => {
    const state = expedition();
    const exp = state.expedition!;
    const snap = snapshotFloor(exp, state.player!, false);
    // Find one of each on the authored floor.
    let chest: { x: number; y: number } | null = null;
    let barrel: { x: number; y: number } | null = null;
    for (let y = 0; y < snap.height; y++) {
      for (let x = 0; x < snap.width; x++) {
        if (snap.rows[y][x] === TILE.CHEST) chest ??= { x, y };
        if (snap.rows[y][x] === TILE.BREAKABLE) barrel ??= { x, y };
      }
    }
    expect(chest).not.toBeNull();
    expect(barrel).not.toBeNull();
    const far = { x: -9, y: -9 };
    expect(resolvedTile(snap, chest!.x, chest!.y, far)).toBe(TILE.CHEST);
    snap.opened.add(`${chest!.x},${chest!.y}`);
    expect(resolvedTile(snap, chest!.x, chest!.y, far)).toBe(TILE.FLOOR);
    snap.broken.add(`${barrel!.x},${barrel!.y}`);
    expect(resolvedTile(snap, barrel!.x, barrel!.y, far)).toBe(TILE.FLOOR);
  });

  it('a secret is only itself while you are standing beside it', () => {
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    snap.rows[2] = TILE.SECRET + snap.rows[2].slice(1);
    expect(resolvedTile(snap, 0, 2, { x: 9, y: 9 })).toBe(TILE.FLOOR);
    expect(resolvedTile(snap, 0, 2, { x: 1, y: 2 })).toBe(TILE.SECRET);
  });

  it('every non-floor tile the DOM screen draws an icon for has one here', () => {
    // The DOM path's TILE_VIEW carries an icon for exactly these. A tile that
    // resolves to something with no icon renders as bare ground on the canvas
    // and the player loses the affordance entirely — silently.
    for (const tile of [TILE.START, TILE.STAIRS, TILE.BOSS, TILE.BREAKABLE, TILE.CHEST, TILE.SHRINE, TILE.EVENT, TILE.SECRET]) {
      expect(objectIcon(tile)).not.toBeNull();
    }
    expect(objectIcon(TILE.FLOOR)).toBeNull();
    expect(objectIcon(TILE.WALL)).toBeNull();
    // Spawn markers are drawn as UNITS, not as tiles.
    expect(objectIcon(TILE.ENEMY)).toBeNull();
    expect(objectIcon(TILE.MERCHANT)).toBeNull();
  });
});

describe('the scene', () => {
  it('marks every wall solid in the occupancy grid', () => {
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const scene = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: snap.heroTile,
      materials: allMaterials(),
    });
    const grid = scene.occluders!;
    expect(grid.width).toBe(snap.width);
    expect(grid.height).toBe(snap.height);
    let walls = 0;
    for (let y = 0; y < snap.height; y++) {
      for (let x = 0; x < snap.width; x++) {
        const solid = snap.rows[y][x] === TILE.WALL;
        expect(isSolid(grid, x, y)).toBe(solid);
        if (solid) walls++;
      }
    }
    expect(walls).toBeGreaterThan(20);
  });

  it('draws unexplored tiles as BLACK GEOMETRY, not as nothing', () => {
    // ENGINE_PLAN §14.1. Skipping the quad is the obvious implementation and
    // it is wrong: the board is a slab with a frame under the tile grid, so a
    // hole in the grid shows TIMBER where the dungeon has not been explored.
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const scene = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: snap.heroTile,
      materials: allMaterials(),
      emitters: false,
    });
    const fog = scene.sprites.filter((s) => s.textureId === MAT_BLANK);
    const unrevealed = snap.width * snap.height - snap.revealed.size;
    expect(unrevealed).toBeGreaterThan(0);
    expect(fog.length).toBe(unrevealed);
    for (const s of fog) expect(s.tint).toEqual([0, 0, 0, 1]);
  });

  it('does not draw a single tile of the floor the lantern has not reached', () => {
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const scene = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: snap.heroTile,
      materials: allMaterials(),
      emitters: false,
    });
    for (const s of scene.sprites) {
      if (s.textureId !== MAT_GROUND) continue;
      expect(snap.revealed.has(`${s.position.x},${s.position.y}`)).toBe(true);
    }
  });

  it('carries the hero lantern at the interpolated position, not the tile', () => {
    // The glide is the reason soft shadows are visible at all — a hero who
    // teleports is a lantern that teleports. If the light snapped to the tile
    // while the piece slid, they would visibly separate mid-step.
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const mid = { x: snap.heroTile.x + 0.5, y: snap.heroTile.y };
    const scene = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: mid,
      materials: allMaterials(),
      emitters: false,
    });
    const lantern = scene.lights[0];
    expect(lantern.position.x).toBeCloseTo(mid.x + 0.5, 6);
    expect(lantern.position.y).toBeCloseTo(mid.y + 0.5, 6);
    expect(lantern.position.z).toBeGreaterThan(0);
    const figure = scene.sprites.find((s) => s.textureId === MAT_HERO)!;
    expect(figure.position.x).toBeCloseTo(lantern.position.x, 6);
    expect(figure.billboard).toBe(true);
  });

  it('the pool ends where the walk ends', () => {
    // FloorScreen's `reachCells` reading: the lantern's radius IS the move
    // budget, so spending movement closes the light in. Losing that on the
    // canvas path would be a gameplay regression dressed as a lighting change.
    const state = expedition();
    const exp = state.expedition!;
    const full = snapshotFloor(exp, state.player!, false);
    const spent = snapshotFloor({ ...exp, movLeft: 1 }, state.player!, false);
    expect(spent.lightCells).toBeLessThan(full.lightCells);
    const reach = (s: typeof full) =>
      buildFloorScene(s, { camera: CAMERA, time: 0, heroAt: s.heroTile, materials: allMaterials(), emitters: false })
        .lights[0].reach;
    expect(reach(spent)).toBeLessThan(reach(full));
  });

  it('is deterministic — the same state and time give identical sprites', () => {
    // Every pixel-diff measurement in this project depends on it, and one
    // `Math.random` in a placement helper would silently end that.
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const build = () =>
      buildFloorScene(snap, { camera: CAMERA, time: 3.25, heroAt: snap.heroTile, materials: allMaterials() });
    const a = build();
    const b = build();
    expect(a.sprites.length).toBe(b.sprites.length);
    expect(JSON.stringify(a.sprites)).toBe(JSON.stringify(b.sprites));
    expect(JSON.stringify(a.lights)).toBe(JSON.stringify(b.lights));
  });

  it('skips sprites whose art has not loaded, and keeps their light', () => {
    // Textures arrive asynchronously and `SpriteBatcher.draw` already skips a
    // batch it has no texture for — but a builder that emitted the sprite
    // anyway would break BATCHING, since the batch still consumes vertices.
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const bare = new Map<string, Material>();
    const scene = buildFloorScene(snap, { camera: CAMERA, time: 0, heroAt: snap.heroTile, materials: bare });
    expect(scene.sprites.some((s) => s.textureId === MAT_HERO)).toBe(false);
    expect(scene.sprites.some((s) => s.textureId === 'wisp')).toBe(false);
    // The lantern is not art and must be there regardless.
    expect(scene.lights.length).toBeGreaterThan(0);
  });

  it('lifts the eight-light ceiling in practice, not just in principle', () => {
    // ENGINE_PLAN §18: the old rule was eight lights ON SCREEN, TOTAL. A real
    // floor with emitters goes past that immediately, so this is the assertion
    // that the game path actually benefits from the binning work.
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    // Reveal the whole floor so the emitters are eligible.
    for (let y = 0; y < snap.height; y++) for (let x = 0; x < snap.width; x++) snap.revealed.add(`${x},${y}`);
    const scene = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: snap.heroTile,
      materials: allMaterials(),
      mushroomDensity: 0.5,
      sconceDensity: 0.3,
      wispCount: 6,
    });
    expect(scene.lights.length).toBeGreaterThan(8);
  });
});

describe('identity helpers', () => {
  it('gives each kind of unit its own texture id', () => {
    expect(unitTextureId({ id: 'a', kind: 'merchant', x: 0, y: 0, label: '', mov: 3 })).toBe('sprite:merchant');
    expect(unitTextureId({ id: 'b', kind: 'tamer', x: 0, y: 0, label: '', mov: 3 })).toBe('sprite:tamer');
    expect(unitTextureId({ id: 'c', kind: 'enemy', x: 0, y: 0, label: '', speciesId: 'slimeA', mov: 3 })).toBe(
      'monster:slimeA',
    );
    expect(iconTextureId('chest')).toBe('icon:chest');
  });

  it('varies block height without ever going below the shadow floor', () => {
    // `Scene.occluderHeight` is told the SHORTEST a block can be. A block
    // shorter than that is shadowed by its own neighbours and a run of wall
    // reads as a black trench.
    let min = Infinity;
    let max = -Infinity;
    for (let y = 0; y < 20; y++) {
      for (let x = 0; x < 20; x++) {
        const h = blockHeight(x, y);
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
    }
    expect(min).toBeGreaterThanOrEqual(0.66);
    expect(max).toBeLessThan(0.8);
    expect(max - min).toBeGreaterThan(0.05);
    // Deterministic: the same tile is the same height forever.
    expect(blockHeight(4, 7)).toBe(blockHeight(4, 7));
  });
});
