// =========================================================================
// THE SCENE.
//
// This is the renderer's entire input, so the properties worth testing are
// the ones a wrong answer would make invisible rather than loud: culling that
// drops something the player can see, and an occupancy grid that lets light
// through a wall or around the edge of the map.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { makeCamera, project, visibleBounds } from '../scene/camera';
import type { Sprite } from '../scene/sprite';
import {
  cullLights,
  cullSprites,
  isSolid,
  makeOccluderGrid,
  makeScene,
  setSolid,
  tileSprite,
  type Light,
} from '../scene/scene';

const UV = { u0: 0, v0: 0, u1: 1, v1: 1 };
const CAM = makeCamera({ centre: { x: 10, y: 6 }, zoom: 48, viewport: { x: 1280, y: 800 } });

describe('the occupancy grid', () => {
  it('reads back what was written', () => {
    const g = makeOccluderGrid(8, 5);
    expect(isSolid(g, 3, 2)).toBe(false);
    setSolid(g, 3, 2, true);
    expect(isSolid(g, 3, 2)).toBe(true);
    setSolid(g, 3, 2, false);
    expect(isSolid(g, 3, 2)).toBe(false);
  });

  it('treats everything outside the floor as SOLID', () => {
    // The alternative is a very visible bug: open sky around the map means
    // light leaks in at every edge and the boundary becomes the brightest
    // thing on screen. Outside a dungeon floor is rock.
    const g = makeOccluderGrid(4, 4);
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [4, 0],
      [0, 4],
      [99, 99],
      [-99, -99],
    ]) {
      expect(isSolid(g, x, y), `(${x},${y}) must be solid`).toBe(true);
    }
  });

  it('floors fractional coordinates rather than rounding them', () => {
    // A light at x=2.9 is inside tile 2, not tile 3. Rounding would make the
    // occluder the player sees and the occluder the light uses disagree by a
    // tile at every half-boundary.
    const g = makeOccluderGrid(4, 4);
    setSolid(g, 2, 1, true);
    expect(isSolid(g, 2.0, 1.0)).toBe(true);
    expect(isSolid(g, 2.9, 1.9)).toBe(true);
    expect(isSolid(g, 3.0, 1.0)).toBe(false);
  });

  it('ignores writes outside the grid instead of corrupting a neighbour', () => {
    // Row-major indexing without a bounds check writes (-1, 2) into the end
    // of row 1 — a wall appearing on the opposite side of the map.
    const g = makeOccluderGrid(4, 4);
    setSolid(g, -1, 2, true);
    setSolid(g, 4, 2, true);
    expect([...g.solid].every((v) => v === 0)).toBe(true);
  });
});

describe('culling keeps everything the player can see', () => {
  const bounds = visibleBounds(CAM);

  it('keeps every sprite that actually lands on screen', () => {
    // The failure this prevents is the worst kind: geometry that is simply
    // missing, with nothing on screen to suggest why.
    const sprites: Sprite[] = [];
    for (let y = -8; y < 24; y++) for (let x = -8; x < 32; x++) sprites.push(tileSprite(x, y, 'tile', UV));
    const kept = new Set(cullSprites(sprites, bounds));
    for (const s of sprites) {
      const p = project(s.position, CAM);
      const onScreen = p.x >= 0 && p.x <= CAM.viewport.x && p.y >= 0 && p.y <= CAM.viewport.y;
      if (onScreen) expect(kept.has(s), `dropped a visible sprite at ${s.position.x},${s.position.y}`).toBe(true);
    }
  });

  it('actually culls — it is not just returning everything', () => {
    // A cull that keeps everything passes the test above trivially.
    const sprites: Sprite[] = [];
    for (let y = -40; y < 60; y++) for (let x = -40; x < 80; x++) sprites.push(tileSprite(x, y, 'tile', UV));
    const kept = cullSprites(sprites, bounds);
    expect(kept.length).toBeLessThan(sprites.length / 3);
    expect(kept.length).toBeGreaterThan(0);
  });

  it('keeps a tall piece whose feet are below the viewport', () => {
    // A piece standing just off the bottom edge still pokes into view. Culling
    // on the pivot alone makes pieces pop in as the camera scrolls, which
    // reads as a streaming bug rather than a culling one.
    const tall: Sprite = {
      position: { x: 10, y: bounds.maxY - 0.5, z: 0 },
      size: { x: 1, y: 4 },
      pivot: { x: 0.5, y: 1 },
      uv: UV,
      textureId: 'hero',
    };
    expect(cullSprites([tall], bounds)).toHaveLength(1);
  });

  it('keeps a piece held high above the board', () => {
    // Height moves a sprite UP the screen, so something standing below the
    // viewport with z > 0 can be visible when its footprint is not.
    const lifted: Sprite = {
      position: { x: 10, y: bounds.maxY - 0.2, z: 2 },
      size: { x: 1, y: 1 },
      uv: UV,
      textureId: 'lamp',
    };
    expect(cullSprites([lifted], bounds)).toHaveLength(1);
  });

  it('drops what is genuinely far away', () => {
    const far = tileSprite(500, 500, 'tile', UV);
    expect(cullSprites([far], bounds)).toHaveLength(0);
  });
});

describe('light culling respects reach, not just position', () => {
  const bounds = visibleBounds(CAM);
  const light = (x: number, y: number, reach: number): Light => ({
    position: { x, y, z: 1 },
    colour: [1, 0.6, 0.3],
    intensity: 8,
    radius: 0.2,
    reach,
  });

  it('keeps an off-screen light whose glow reaches on screen', () => {
    // The repro for culling on position alone: a lantern just past the edge
    // still lights the tiles inside it, and dropping it makes a lit corridor
    // go dark the instant its source scrolls off.
    const justOff = light(bounds.maxX + 3, 6, 10);
    expect(cullLights([justOff], bounds)).toHaveLength(1);
  });

  it('drops a light whose reach ends before the viewport', () => {
    expect(cullLights([light(bounds.maxX + 50, 6, 2)], bounds)).toHaveLength(0);
  });
});

describe('a default scene is legal and inert', () => {
  it('has no lights, no occluders and a night that is not black', () => {
    const s = makeScene(CAM);
    expect(s.sprites).toEqual([]);
    expect(s.lights).toEqual([]);
    expect(s.occluders).toBeNull();
    // Not black: darkening warm art toward pure black greys it out. This is
    // carried over from lightEngine.ts, where it was learned rather than picked.
    expect(s.night.some((c) => c > 0)).toBe(true);
    expect(Math.max(...s.night)).toBeLessThan(0.1);
    // Blue-ish, like night actually is.
    expect(s.night[2]).toBeGreaterThan(s.night[0]);
  });
});
