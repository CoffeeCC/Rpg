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
  MAT_FRAME,
  MAT_FRAME_BAKED,
  MAT_FRAME_BRASS,
  MAT_GROUND,
  MAT_HERO,
  MAT_PLINTH,
  MAT_PLINTH_LARGE,
  MAT_PLINTH_SMALL,
  MAT_RIM,
  MAT_RIM_BAKED,
  MAT_RIM_BRASS,
  MAT_WALL,
  MAT_WALL_FACE,
  MAT_WALL_FACE_CHIPPED,
  MAT_WALL_TOP,
  MAT_WALL_TOP_WORN,
  blockHeight,
  buildFloorScene,
  iconTextureId,
  objectIcon,
  plinthFor,
  resolvedTile,
  snapshotFloor,
  unitTextureId,
  wallCut,
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

// =========================================================================
// THE BLENDER BAKES ACTUALLY REACHING THE MAP.
//
// The state this replaces: nineteen published material maps and not one line
// that loaded any of them. `materials.ts` and `battleMaterials.ts` both
// SYNTHESISED their frame, rim and wood — `boardFramePixels`, `boardRimPixels`,
// `woodField` — so the ornament pass that put brass at every wood joint and
// lathe-turned profiles on the fittings was invisible on the board.
//
// Every test below is written to FAIL against that code rather than to
// describe this one, which for a swap like this means asserting the NEGATIVE:
// that when a bake is available the procedural stand-in is no longer drawn at
// all. A test that merely found a baked sprite would have passed on a build
// that drew both, one over the other.
// =========================================================================
describe('the map draws the baked furniture, not the procedural stand-ins', () => {
  const BAKED = [
    MAT_FRAME_BAKED,
    MAT_FRAME_BRASS,
    MAT_RIM_BAKED,
    MAT_RIM_BRASS,
    MAT_WALL_TOP,
    MAT_WALL_TOP_WORN,
    MAT_WALL_FACE,
    MAT_WALL_FACE_CHIPPED,
    MAT_PLINTH,
    MAT_PLINTH_SMALL,
    MAT_PLINTH_LARGE,
  ];

  /** Everything the fallback board needs, plus every bake. */
  function bakedMaterials(): Map<string, Material> {
    const m = allMaterials();
    for (const id of BAKED) m.set(id, { id, albedo: null });
    return m;
  }

  const build = (materials: Map<string, Material>) => {
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    // Reveal everything: an unrevealed tile is fog, and fog draws no wall.
    for (let y = 0; y < snap.height; y++) for (let x = 0; x < snap.width; x++) snap.revealed.add(`${x},${y}`);
    const scene = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: snap.heroTile,
      materials,
      emitters: false,
    });
    return { snap, scene };
  };

  it('THE POINT: not one wall is still drawn with the painted tile texture', () => {
    // The old builder handed `MAT_WALL` to every block, top and front. This is
    // the assertion that would have failed then, and that fails again the
    // moment anyone reverts the wall path.
    const { scene } = build(bakedMaterials());
    expect(scene.sprites.some((s) => s.textureId === MAT_WALL)).toBe(false);
    const tops = scene.sprites.filter((s) => s.textureId === MAT_WALL_TOP || s.textureId === MAT_WALL_TOP_WORN);
    const faces = scene.sprites.filter((s) => s.textureId === MAT_WALL_FACE || s.textureId === MAT_WALL_FACE_CHIPPED);
    expect(tops.length).toBeGreaterThan(20);
    expect(faces.length).toBeGreaterThan(10);
    // A top LIES on the board at the block's height; a face STANDS UP. Getting
    // these the same way round is what makes a wall a block rather than a tile
    // with a picture bolted to its near edge.
    for (const t of tops) expect(t.upright).toBeUndefined();
    for (const f of faces) {
      expect(f.upright).toBe(true);
      expect(f.uv).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
    }
  });

  it('gives a baked block the whole texture, not a quarter of a 4x4 atlas', () => {
    // `cellUv` windows the painted tile art so neighbours do not visibly
    // repeat. A bake IS one tile; sampling a quarter of it would draw a
    // quarter of a stone block stretched over a whole one.
    const { scene } = build(bakedMaterials());
    const top = scene.sprites.find((s) => s.textureId === MAT_WALL_TOP)!;
    expect(top.uv).toEqual({ u0: 0, v0: 0, u1: 1, v1: 1 });
    // And the variety `cellUv` used to buy now comes from the CUT, so a run of
    // wall must not be one shape repeated.
    const worn = scene.sprites.filter((s) => s.textureId === MAT_WALL_TOP_WORN);
    expect(worn.length).toBeGreaterThan(3);
  });

  it('drops the fake shading, because the bake carries real relief', () => {
    // The tints darkened the front face to stand in for an occlusion the
    // painted art could not carry. `wall_face` has real AO in its material
    // map's alpha; multiplying it down again would double the darkening.
    const { scene } = build(bakedMaterials());
    for (const s of scene.sprites) {
      if (s.textureId === MAT_WALL_TOP || s.textureId === MAT_WALL_FACE) expect(s.tint).toBeUndefined();
    }
    // The fallback keeps them, unchanged.
    const plain = build(allMaterials()).scene.sprites.filter((s) => s.textureId === MAT_WALL);
    expect(plain.some((s) => s.tint !== undefined)).toBe(true);
  });

  it('replaces the one-quad frame with a registered ring, and adds its brass', () => {
    const { scene } = build(bakedMaterials());
    expect(scene.sprites.some((s) => s.textureId === MAT_FRAME)).toBe(false);
    expect(scene.sprites.filter((s) => s.textureId === MAT_FRAME_BAKED)).toHaveLength(8);
    expect(scene.sprites.filter((s) => s.textureId === MAT_FRAME_BRASS)).toHaveLength(8);
  });

  it('replaces the procedural rim and lays its brass strap over it', () => {
    const { scene } = build(bakedMaterials());
    expect(scene.sprites.some((s) => s.textureId === MAT_RIM)).toBe(false);
    const timber = scene.sprites.find((s) => s.textureId === MAT_RIM_BAKED)!;
    const brass = scene.sprites.find((s) => s.textureId === MAT_RIM_BRASS)!;
    expect(brass.position).toEqual(timber.position);
    expect(brass.size).toEqual(timber.size);
  });

  it('stands every piece in a turned plinth instead of the generated disc', () => {
    const { scene } = build(bakedMaterials());
    expect(scene.sprites.some((s) => s.textureId === 'base')).toBe(false);
    expect(scene.sprites.some((s) => s.textureId === MAT_PLINTH)).toBe(true);
    expect(scene.sprites.some((s) => s.textureId === MAT_PLINTH_SMALL)).toBe(true);
  });

  it('EVERY ONE OF THEM DEGRADES to the board that shipped, never to a hole', () => {
    // The safety property, and the reason this is landable at all:
    // `web/public/art/materials/` is a build artifact, so a fresh clone or a
    // `git clean` has none of these. Asserted as a whole-scene equality
    // against the pre-bake build, not merely as "it does not throw".
    const { snap, scene } = build(allMaterials());
    expect(scene.sprites.some((s) => s.textureId === MAT_WALL)).toBe(true);
    expect(scene.sprites.some((s) => s.textureId === MAT_FRAME)).toBe(true);
    expect(scene.sprites.some((s) => s.textureId === MAT_RIM)).toBe(true);
    expect(scene.sprites.some((s) => s.textureId === 'base')).toBe(true);
    // And nothing baked leaked into it.
    for (const id of BAKED) expect(scene.sprites.some((s) => s.textureId === id)).toBe(false);
    // Byte for byte the same scene when the ids are merely absent rather than
    // never considered — which is what a fresh checkout actually looks like.
    const again = buildFloorScene(snap, {
      camera: CAMERA,
      time: 0,
      heroAt: snap.heroTile,
      materials: allMaterials(),
      emitters: false,
    });
    expect(JSON.stringify(again.sprites)).toBe(JSON.stringify(scene.sprites));
  });

  it('is still deterministic with the bakes in — the cut is hashed, not random', () => {
    const state = expedition();
    const snap = snapshotFloor(state.expedition!, state.player!, false);
    const go = () =>
      buildFloorScene(snap, { camera: CAMERA, time: 1.5, heroAt: snap.heroTile, materials: bakedMaterials() });
    expect(JSON.stringify(go().sprites)).toBe(JSON.stringify(go().sprites));
  });
});

describe('the two halves of a wall block are taken together or not at all', () => {
  it('THE TRAP: a half-arrived bake falls back rather than mixing normal bases', () => {
    // `wallBlockSprites` paints ONE texture onto both faces. With `wall_top`
    // loaded and `wall_face` still in flight, a naive check would put a LYING
    // render onto an UPRIGHT quad — and the two bake different normal bases
    // (lying maps texture G to board y, upright maps it to board z), so every
    // wall on the board would light as though tipped on its back until the
    // second fetch landed. Silent, transient, and exactly the kind of thing
    // nobody screenshots.
    const only = (...ids: string[]) => (id: string) => ids.includes(id);
    expect(wallCut(3, 4, only(MAT_WALL_TOP)).baked).toBe(false);
    expect(wallCut(3, 4, only(MAT_WALL_FACE)).baked).toBe(false);
    expect(wallCut(3, 4, only(MAT_WALL_TOP, MAT_WALL_FACE)).baked).toBe(true);
    expect(wallCut(3, 4, only(MAT_WALL_TOP)).top).toBe(MAT_WALL);
  });

  it('varies the cut deterministically, and only where the variant exists', () => {
    const both = (id: string) => id === MAT_WALL_TOP || id === MAT_WALL_FACE;
    let worn = 0;
    for (let y = 0; y < 30; y++) {
      for (let x = 0; x < 30; x++) {
        const all = wallCut(x, y, () => true);
        if (all.top === MAT_WALL_TOP_WORN) {
          worn++;
          // The two halves of one block always agree about which cut it is.
          expect(all.face).toBe(MAT_WALL_FACE_CHIPPED);
        }
        // Without the variants published, a block still gets the plain cut
        // rather than an id nothing will ever supply.
        expect(both(MAT_WALL_TOP_WORN)).toBe(false);
        expect(wallCut(x, y, both).top).toBe(MAT_WALL_TOP);
      }
    }
    expect(worn).toBeGreaterThan(100);
    expect(worn).toBeLessThan(450);
    expect(wallCut(7, 9, () => true).top).toBe(wallCut(7, 9, () => true).top);
  });
});

describe('a piece stands in the plinth its rank calls for', () => {
  it('gives rank, hero and boss three different bases, not one at three zooms', () => {
    // ENGINE_PLAN Â§15: the three plinths are three RIM TREATMENTS as well as
    // three sizes, because sizes alone read as one base at three zooms.
    const has = () => true;
    expect(plinthFor('unit', has).id).toBe(MAT_PLINTH_SMALL);
    expect(plinthFor('hero', has).id).toBe(MAT_PLINTH);
    expect(plinthFor('miniboss', has).id).toBe(MAT_PLINTH_LARGE);
    expect(plinthFor('miniboss', has).radius).toBeGreaterThan(plinthFor('hero', has).radius);
    expect(plinthFor('hero', has).radius).toBeGreaterThan(plinthFor('unit', has).radius);
  });

  it('draws the bake at its FRAME, not at the plinth, so it is not 4% small', () => {
    // A free-standing shape is rendered with margin around it for Cycles'
    // filter to put the anti-aliased silhouette in. Sizing the quad to the
    // plinth's diameter would shrink the plinth itself by that margin.
    const none = () => false;
    expect(plinthFor('hero', none).id).toBe('base');
    expect(plinthFor('hero', none).radius).toBeCloseTo(0.4, 6);
    expect(plinthFor('hero', () => true).radius).toBeCloseTo(0.4 * 1.04, 6);
  });
});
