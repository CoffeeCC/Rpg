// =========================================================================
// EMITTERS.
//
// Three kinds of claim get tested here, and the split is the interesting part.
//
//   GEOMETRY the light lands evenly on its own sprite, a wisp cannot escape
//            its tether, a wisp over the table still paints on top of it.
//            These are the ones a screenshot cannot check, because they are
//            true or false by a few percent and every failure looks like art.
//   DISCIPLINE nothing here casts, nothing here has a big reach. ENGINE_PLAN
//            §12.2's whole cost argument is "faint means small reach", so the
//            numbers that make it true belong in a test rather than in a
//            comment somebody will tune past.
//   SHAPE    the procedural pixels are the right shape. Cheap, and it is what
//            makes the art tunable without waiting on art.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  GLOW_FRONT,
  GLOW_LIFT,
  flamePixels,
  flicker,
  glowLightPosition,
  hashCoord,
  mushroomEmitter,
  mushroomPixels,
  mushroomSpots,
  sconceEmitter,
  wispEmitter,
  wispPaths,
  wispPixels,
  wispPosition,
  type WispPath,
} from '../scene/emitters';
import { DEFAULT_TILT } from '../scene/camera';
import { LAYER_PIECE, LAYER_TABLE, sortForPainting, spriteLayer, type Sprite } from '../scene/sprite';
import { makeOccluderGrid, setSolid } from '../scene/scene';

const ALL = [
  ['sconce', sconceEmitter({ x: 4, y: 4 })],
  ['mushroom', mushroomEmitter({ x: 4, y: 4 })],
  ['wisp', wispEmitter({ x: 4, y: 4, radiusX: 2, radiusY: 2, height: 0.9, speed: 0.3, seed: 1 }, 0)],
] as const;

describe('every emitter is a whisper', () => {
  it('casts nothing, which is where most of a light cost lives', () => {
    for (const [name, e] of ALL) {
      expect(e.light.castsShadow, `${name} casts`).toBe(false);
      expect(e.light.indirectOnly, `${name} is not indirectOnly`).toBe(true);
    }
  });

  it('reaches barely anywhere — the claim the whole cost model rests on', () => {
    // §12.2: "a mushroom lighting two tiles touches about a dozen tiles and
    // costs nothing anywhere else". If any of these creeps up, that sentence
    // stops being true and the bin occupancy goes with it. Half the lantern's
    // 7 tiles is the line: past that an emitter is a second light source
    // rather than a whisper, whatever its intensity says.
    for (const [name, e] of ALL) {
      expect(e.light.reach, `${name} reaches too far`).toBeLessThanOrEqual(3.5);
    }
    // Pinned individually, because the interesting failure is one of them
    // drifting up under cover of the shared bound above.
    expect(mushroomEmitter({ x: 0, y: 0 }).light.reach).toBeLessThanOrEqual(1.6);
    expect(sconceEmitter({ x: 0, y: 0 }).light.reach).toBeLessThanOrEqual(2.5);
    // THE WISP IS THE OUTLIER AND IT IS EARNED. The board sits half a tile
    // proud of the table, so a wisp that drifts past the rim is 1.4 tiles
    // above the wood — and at reach 1.9 the falloff window had eaten four
    // fifths of it before it arrived. Measured: the core read 100/255 against
    // a 3.5 background and the ring of table around it read 3.9 against 3.6.
    // A bright dot lighting nothing. Reach is what decides whether a light
    // lands at all, and it is not the same dial as intensity.
    expect(wispEmitter({ x: 0, y: 0, radiusX: 1, radiusY: 1, height: 0.9, speed: 0.3, seed: 1 }, 0).light.reach)
      .toBeLessThanOrEqual(3.5);
  });

  it('is far dimmer than the lantern, which sits around 9', () => {
    for (const [name, e] of ALL) {
      expect(e.light.intensity, `${name} competes with the lantern`).toBeLessThan(2);
    }
  });

  it('comes with something to look at. A light with no sprite is a bug report waiting', () => {
    for (const [name, e] of ALL) expect(e.sprites.length, `${name} has no sprite`).toBeGreaterThan(0);
  });
});

describe('the light lands on its own sprite', () => {
  /**
   * A billboard's world normal at the shipping tilt, from the lit shader:
   * texture +z maps to the view direction, which is (0, sin, cos).
   */
  const N = { x: 0, y: Math.sin(DEFAULT_TILT), z: Math.cos(DEFAULT_TILT) };

  function ndlAtCorners(centre: { x: number; y: number; z: number }, size: number): number[] {
    const lp = glowLightPosition(centre, size);
    const half = size / 2;
    const out: number[] = [];
    // The quad spans x and z around the centre at a CONSTANT y — see
    // buildVertexData: a standing quad is all at one depth and spans height.
    for (const dx of [-half, 0, half]) {
      for (const dz of [-half, 0, half]) {
        const t = { x: lp.x - (centre.x + dx), y: lp.y - centre.y, z: lp.z - (centre.z + dz) };
        const len = Math.hypot(t.x, t.y, t.z);
        out.push((N.x * t.x + N.y * t.y + N.z * t.z) / len);
      }
    }
    return out;
  }

  it('never leaves a corner of the quad facing away, at any size', () => {
    // THE FAILURE THIS EXISTS FOR: put the light in the sprite's own plane and
    // every fragment above it faces 90 degrees away and goes black — a flame
    // with a bright waist and a dark tongue. It looks like bad art.
    for (const size of [0.2, 0.34, 0.5, 1]) {
      const ndl = ndlAtCorners({ x: 3, y: 3, z: 0.6 }, size);
      expect(Math.min(...ndl), `size ${size}`).toBeGreaterThan(0.75);
    }
  });

  it('is brightest dead centre, so the sprite reads as a glow rather than a card', () => {
    const ndl = ndlAtCorners({ x: 3, y: 3, z: 0.6 }, 0.34);
    expect(ndl[4]).toBeCloseTo(Math.max(...ndl), 6);
  });

  it('scales its offset with the sprite, so a tiny emitter keeps its light on it', () => {
    const small = glowLightPosition({ x: 0, y: 0, z: 0 }, 0.2);
    expect(small.y).toBeCloseTo(0.2 * GLOW_FRONT, 6);
    expect(small.z).toBeCloseTo(0.2 * GLOW_LIFT, 6);
    // A fixed offset would put a 0.2-tile mushroom's light a third of a tile
    // in front of it, which reads as the glow having come loose.
    expect(small.y).toBeLessThan(0.2);
  });
});

describe('flicker', () => {
  it('stays inside its stated range, so a light cannot flash or go negative', () => {
    for (let i = 0; i < 400; i++) {
      const v = flicker(2.5, i * 0.017, 0.2);
      expect(v).toBeGreaterThanOrEqual(0.8 - 1e-9);
      expect(v).toBeLessThanOrEqual(1.2 + 1e-9);
    }
  });

  it('is exactly 1 when off, so a steady light is bit-for-bit steady', () => {
    expect(flicker(1, 0.3, 0)).toBe(1);
    expect(flicker(1, 12.7, 0)).toBe(1);
  });

  it('is deterministic and differs per seed', () => {
    expect(flicker(1, 3.3)).toBe(flicker(1, 3.3));
    expect(flicker(1, 3.3)).not.toBe(flicker(2, 3.3));
  });

  it('has no visible period — two sconces do not pulse together', () => {
    // Harmonic rates give a strobe the eye locks onto in about a second.
    const a = flicker(1, 5);
    let matches = 0;
    for (let i = 1; i < 500; i++) if (Math.abs(flicker(1, 5 + i * 0.05) - a) < 1e-4) matches++;
    expect(matches).toBeLessThan(12);
  });
});

describe('a wisp is on a tether, not behind a fence', () => {
  const path: WispPath = { x: 10, y: 6, radiusX: 2.5, radiusY: 1.8, height: 0.9, speed: 0.34, seed: 1.4 };

  it('never exceeds its leash, by construction rather than by clamping', () => {
    // The amplitudes of the two octaves sum to exactly 1, which is the whole
    // guarantee. A clamp would also work and would occasionally flat-spot the
    // path against its own boundary, which looks like the wisp hitting glass.
    for (let i = 0; i < 4000; i++) {
      const p = wispPosition(path, i * 0.05);
      expect(Math.abs(p.x - path.x)).toBeLessThanOrEqual(path.radiusX + 1e-9);
      expect(Math.abs(p.y - path.y)).toBeLessThanOrEqual(path.radiusY + 1e-9);
      expect(Math.abs(p.z - path.height)).toBeLessThanOrEqual(0.16 + 1e-9);
    }
  });

  it('actually USES the leash — a wisp pinned near its centre is not drifting', () => {
    let far = 0;
    for (let i = 0; i < 4000; i++) {
      const p = wispPosition(path, i * 0.05);
      if (Math.hypot(p.x - path.x, p.y - path.y) > path.radiusY) far++;
    }
    expect(far).toBeGreaterThan(400);
  });

  it('moves smoothly — a jump between frames reads as a teleport', () => {
    let maxStep = 0;
    for (let i = 0; i < 2000; i++) {
      const a = wispPosition(path, i / 60);
      const b = wispPosition(path, (i + 1) / 60);
      maxStep = Math.max(maxStep, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
    }
    // Tiles per frame at 60fps. An amble, not a dart.
    expect(maxStep).toBeLessThan(0.06);
  });

  it('is not an ellipse — one sine per axis reads as a track within seconds', () => {
    // A pure ellipse returns to its start after exactly one period of the
    // slower axis. The second octave is what breaks that.
    const period = (2 * Math.PI) / (path.speed * 0.6180339887);
    const a = wispPosition(path, 0);
    const b = wispPosition(path, period);
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(0.2);
  });

  it('is deterministic, which is what makes a pixel diff possible at all', () => {
    expect(wispPosition(path, 12.34)).toEqual(wispPosition(path, 12.34));
  });
});

describe('a wisp out over the table still draws on top of it', () => {
  it('paints after the table even though it is far behind it in board y', () => {
    // THE ONE CASE THE LAYER CONSTANTS EXIST FOR, stated as a test: a sprite
    // above the TABLE but not above the BOARD. A y-sort alone buries the wisp,
    // because the table quad is centred on the whole visible region and sorts
    // by a y far in front of a wisp that has drifted off the far rim.
    const table: Sprite = {
      position: { x: 11, y: 20, z: -0.5 },
      size: { x: 40, y: 40 },
      pivot: { x: 0.5, y: 1 },
      uv: { u0: 0, v0: 0, u1: 1, v1: 1 },
      textureId: 'table',
      layer: LAYER_TABLE,
    };
    const strayed = wispEmitter(
      { x: 11, y: -3, radiusX: 1, radiusY: 1, height: 0.9, speed: 0.3, seed: 2 },
      0,
    ).sprites[0];
    expect(spriteLayer(strayed)).toBe(LAYER_PIECE);
    expect(strayed.position.y).toBeLessThan(table.position.y);
    const order = sortForPainting([strayed, table]);
    expect(order[0]).toBe(table);
    expect(order[1]).toBe(strayed);
  });

  it('places roughly a third of a board worth of wisps near or past the rim', () => {
    // The payoff Paul asked for. If every centre lands comfortably inside the
    // board, none of them ever gets out over the wood and the whole point of
    // the tether is unexercised.
    const grid = makeOccluderGrid(22, 14);
    const paths = wispPaths(grid, { count: 12 });
    const strays = paths.filter(
      (p) =>
        p.x - p.radiusX < 0 || p.x + p.radiusX > grid.width || p.y - p.radiusY < 0 || p.y + p.radiusY > grid.height,
    );
    expect(strays.length).toBeGreaterThanOrEqual(4);
    // ...but not all of them, or the board itself has no wisps over it.
    expect(paths.some((p) => p.x > 2 && p.x < grid.width - 2)).toBe(true);
  });

  it('gives every wisp its own speed, so they do not pulse as one object', () => {
    const speeds = wispPaths(makeOccluderGrid(22, 14), { count: 6 }).map((p) => p.speed);
    expect(new Set(speeds.map((s) => s.toFixed(4))).size).toBe(6);
  });
});

describe('mushrooms grow in corners', () => {
  /** A room with one interior wall stub, so there are real corners and real corridor. */
  function room(): ReturnType<typeof makeOccluderGrid> {
    const g = makeOccluderGrid(12, 10);
    for (let x = 0; x < 12; x++) {
      setSolid(g, x, 0, true);
      setSolid(g, x, 9, true);
    }
    for (let y = 0; y < 10; y++) {
      setSolid(g, 0, y, true);
      setSolid(g, 11, y, true);
    }
    for (let y = 3; y < 7; y++) setSolid(g, 5, y, true);
    return g;
  }

  it('never puts one inside a wall', () => {
    const g = room();
    for (const s of mushroomSpots(g, { density: 1 })) {
      expect(g.solid[Math.floor(s.y) * g.width + Math.floor(s.x)]).toBe(0);
    }
  });

  it('picks angles, not corridors — a straight wall run grows nothing', () => {
    // A tile with solid neighbours on OPPOSITE sides is a corridor, and a
    // mushroom every other tile down a corridor reads as installed lighting
    // rather than as something that grew.
    const corridor = makeOccluderGrid(9, 3);
    for (let x = 0; x < 9; x++) {
      setSolid(corridor, x, 0, true);
      setSolid(corridor, x, 2, true);
    }
    const spots = mushroomSpots(corridor, { density: 1 });
    // Only the two ends are corners; the middle of the run is not.
    expect(spots.length).toBeLessThanOrEqual(2);
  });

  it('tucks into the angle rather than sitting in the middle of the tile', () => {
    const g = room();
    const spots = mushroomSpots(g, { density: 1 });
    expect(spots.length).toBeGreaterThan(3);
    for (const s of spots) {
      const offset = Math.hypot((s.x % 1) - 0.5, (s.y % 1) - 0.5);
      expect(offset).toBeGreaterThan(0.1);
    }
  });

  it('is identical every call, and thins unevenly rather than by a stride', () => {
    const g = room();
    expect(mushroomSpots(g)).toEqual(mushroomSpots(g));
    const dense = mushroomSpots(g, { density: 1 }).length;
    const sparse = mushroomSpots(g, { density: 0.4 }).length;
    expect(sparse).toBeLessThan(dense);
    expect(sparse).toBeGreaterThan(0);
  });

  it('hashCoord is deterministic, in range, and differs per tile', () => {
    for (let i = 0; i < 200; i++) {
      const v = hashCoord(i % 17, Math.floor(i / 17), 3);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
    expect(hashCoord(4, 5, 1)).toBe(hashCoord(4, 5, 1));
    expect(hashCoord(4, 5, 1)).not.toBe(hashCoord(5, 4, 1));
  });
});

describe('the procedural pixels', () => {
  function alphaAt(px: Uint8Array, size: number, u: number, v: number): number {
    const x = Math.min(size - 1, Math.max(0, Math.round(u * (size - 1))));
    const y = Math.min(size - 1, Math.max(0, Math.round(v * (size - 1))));
    return px[(y * size + x) * 4 + 3];
  }

  it('are the right length, which is checked before upload anyway but fails better here', () => {
    for (const px of [flamePixels(32), mushroomPixels(32), wispPixels(32)]) {
      expect(px).toHaveLength(32 * 32 * 4);
    }
  });

  it('fade to nothing at the sprite edge, so a square quad has no visible corner', () => {
    for (const px of [flamePixels(64), mushroomPixels(64), wispPixels(64)]) {
      expect(alphaAt(px, 64, 0.02, 0.02)).toBe(0);
      expect(alphaAt(px, 64, 0.98, 0.98)).toBe(0);
      expect(alphaAt(px, 64, 0.98, 0.02)).toBe(0);
    }
  });

  it('a flame comes to a point at the top and is widest low down', () => {
    const size = 96;
    const px = flamePixels(size);
    const widthAt = (v: number) => {
      let n = 0;
      for (let x = 0; x < size; x++) if (px[(Math.round(v * (size - 1)) * size + x) * 4 + 3] > 40) n++;
      return n;
    };
    expect(widthAt(0.12)).toBeLessThan(widthAt(0.5));
    expect(widthAt(0.5)).toBeLessThan(widthAt(0.8));
    // ...and it has a hot core that can clear a bloom threshold. A uniformly
    // orange flame never blooms, which is most of what makes a fire look fake.
    const mid = (Math.round(0.75 * (size - 1)) * size + size / 2) * 4;
    expect(px[mid]).toBeGreaterThan(200);
    expect(px[mid + 1]).toBeGreaterThan(150);
  });

  it('a mushroom is brightest under the cap, which is what makes it a cap', () => {
    const size = 96;
    const px = mushroomPixels(size);
    const green = (u: number, v: number) => {
      const x = Math.round(u * (size - 1));
      const y = Math.round(v * (size - 1));
      return px[(y * size + x) * 4 + 1];
    };
    expect(green(0.5, 0.44)).toBeGreaterThan(green(0.5, 0.2));
    // And it has a stem: something opaque below the cap, on the centre line.
    expect(alphaAt(px, size, 0.5, 0.85)).toBeGreaterThan(120);
    // ...which is narrow. A wide one is a pillar.
    expect(alphaAt(px, size, 0.78, 0.85)).toBe(0);
  });

  it('a wisp is a tight core inside a wide halo, not one fuzzy ball', () => {
    const size = 96;
    const px = wispPixels(size);
    const c = Math.floor(size / 2);
    const at = (r: number) => px[(c * size + Math.round(c + r * c)) * 4 + 3];
    const core = at(0);
    const mid = at(0.35);
    const rim = at(0.75);
    expect(core).toBeGreaterThan(200);
    expect(mid).toBeLessThan(core * 0.6);
    expect(rim).toBeLessThan(mid);
    expect(rim).toBeGreaterThan(0);
    // The core is whiter than the halo, which is what lets the bloom threshold
    // catch the centre and not the whole sprite.
    const rgbAt = (r: number) => px[(c * size + Math.round(c + r * c)) * 4];
    expect(rgbAt(0)).toBeGreaterThan(rgbAt(0.5));
  });
});
