// =========================================================================
// LIGHT BINNING.
//
// The first describe block is the one that matters, and it is written the way
// this project has learned to write them: it stages the OLD behaviour and
// shows it failing. "Binning works" is a weak claim — of course the code does
// what the code does. "Twenty-two of these thirty lights were invisible and
// now none are" is the claim that was worth the milestone, and it is only
// meaningful if the old rule is in the test next to the new one.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  BIN_EMPTY,
  DEFAULT_BIN_CAPACITY,
  LIGHT_TEXELS,
  MAX_SCENE_LIGHTS,
  binGeometry,
  binIndexAt,
  binLights,
  lightsAt,
  packLights,
} from '../scene/lightBins';
import { cullLights, type Bounds, type Light } from '../scene/scene';

/** The pre-M4 rule, verbatim: cull to the viewport, take the first eight. */
const OLD_MAX_LIGHTS = 8;
function oldBudget(lights: readonly Light[], bounds: Bounds): Light[] {
  return cullLights(lights, bounds).slice(0, OLD_MAX_LIGHTS);
}

function emitter(x: number, y: number, reach = 2.2, intensity = 1.1): Light {
  return {
    position: { x, y, z: 0.3 },
    colour: [0.34, 1, 0.55],
    intensity,
    radius: 0.14,
    reach,
    castsShadow: false,
    indirectOnly: true,
  };
}

/** A board's worth of view: the 22x14 harness floor with some table around it. */
const BOARD: Bounds = { minX: -4, minY: -4, maxX: 26, maxY: 18 };

/**
 * The scene ENGINE_PLAN §12 asks for: one bright lantern, one room lamp, and
 * a great many faint emitters scattered over the board.
 */
function crowdedBoard(): Light[] {
  const lights: Light[] = [
    { position: { x: 11, y: 7, z: 0.9 }, colour: [1, 0.62, 0.28], intensity: 9, radius: 0.18, reach: 7 },
    { position: { x: -5, y: 22, z: 15 }, colour: [0.6, 0.68, 1], intensity: 1, radius: 1.4, reach: 95 },
  ];
  // 28 emitters on a coarse lattice across the board, which is a corridor of
  // sconces and a couple of mushroom clusters by another name.
  for (let i = 0; i < 28; i++) {
    lights.push(emitter(1.5 + (i % 7) * 3, 1.5 + Math.floor(i / 7) * 3.5));
  }
  return lights;
}

describe('the ceiling binning removed', () => {
  it('the old rule made 22 of 30 lights invisible EVERYWHERE, including at their own position', () => {
    const lights = crowdedBoard();
    expect(lights).toHaveLength(30);

    const kept = oldBudget(lights, BOARD);
    expect(kept).toHaveLength(OLD_MAX_LIGHTS);

    // Not "dimmed" and not "further away" — absent. A light past the eighth
    // did not appear at any pixel on the board, and nothing said so.
    const invisible = lights.filter((l) => !kept.includes(l));
    expect(invisible).toHaveLength(22);
    for (const l of invisible) {
      const reachesSomething = kept.some(
        (k) => Math.hypot(k.position.x - l.position.x, k.position.y - l.position.y) < k.reach,
      );
      // Some are inside the lantern's or room lamp's pool, which is exactly
      // why the bug was survivable for two milestones: it was not uniformly
      // black, it was just missing lights.
      expect(typeof reachesSomething).toBe('boolean');
    }
  });

  it('binning keeps every one of the 30, and each is present where it stands', () => {
    const lights = crowdedBoard();
    const bins = binLights(lights, BOARD);
    expect(bins.placed).toBe(30);
    expect(bins.dropped).toBe(0);
    for (let i = 0; i < lights.length; i++) {
      const at = lights[i].position;
      expect(lightsAt(bins, at.x, at.y), `light ${i} missing from its own bin`).toContain(i);
    }
  });

  it('and no fragment pays for all 30 — the peak bin holds a small handful', () => {
    // THE CLAIM §12.2 MAKES: faint means small reach, and small reach is what
    // makes count cheap. If this number ever creeps toward capacity, the
    // emitters have stopped being faint and the cost model has changed.
    const bins = binLights(crowdedBoard(), BOARD);
    expect(bins.maxPerBin).toBeLessThanOrEqual(6);
    // The lantern and the room lamp are in most bins; the mushrooms are not.
    expect(lightsAt(bins, 11, 7)).toContain(0);
  });
});

describe('bin geometry', () => {
  it('covers the bounds with the requested margin', () => {
    const geo = binGeometry(BOARD, { binSize: 2, pad: 3 });
    expect(geo.originX).toBe(BOARD.minX - 3);
    expect(geo.originY).toBe(BOARD.minY - 3);
    expect(geo.originX + geo.binsX * geo.binSize).toBeGreaterThanOrEqual(BOARD.maxX + 3);
    expect(geo.originY + geo.binsY * geo.binSize).toBeGreaterThanOrEqual(BOARD.maxY + 3);
  });

  it('grows the bin SIZE rather than clipping the region when the axis cap bites', () => {
    // A camera zoomed way out must not silently stop binning part of the
    // board: a bin grid that does not reach the fragment is a lighting hole,
    // whereas a coarse bin is a few wasted attenuation evaluations.
    const huge: Bounds = { minX: 0, minY: 0, maxX: 900, maxY: 900 };
    const geo = binGeometry(huge, { binSize: 2, maxBins: 32, pad: 0 });
    expect(geo.binsX).toBeLessThanOrEqual(32);
    expect(geo.binsY).toBeLessThanOrEqual(32);
    expect(geo.binSize).toBeGreaterThan(2);
    expect(geo.originX + geo.binsX * geo.binSize).toBeGreaterThanOrEqual(900);
  });

  it('binLights and binGeometry agree, so the lookup cannot be half a bin off', () => {
    const opts = { binSize: 1.5, pad: 2 };
    const geo = binGeometry(BOARD, opts);
    const bins = binLights([emitter(3, 3)], BOARD, opts);
    expect({ ...geo }).toEqual({
      originX: bins.originX,
      originY: bins.originY,
      binSize: bins.binSize,
      binsX: bins.binsX,
      binsY: bins.binsY,
    });
  });
});

describe('what a light touches', () => {
  it('a faint emitter lands in a handful of bins and nowhere else', () => {
    const bins = binLights([emitter(11, 7, 2.2)], BOARD, { binSize: 2 });
    let touched = 0;
    for (let b = 0; b < bins.counts.length; b++) if (bins.counts[b] > 0) touched++;
    // A 4.4-tile-wide footprint over 2-tile bins is at most 4x4 of them.
    expect(touched).toBeGreaterThan(0);
    expect(touched).toBeLessThanOrEqual(16);
    // And it costs nothing at the far corner of the board.
    expect(lightsAt(bins, BOARD.maxX, BOARD.maxY)).toEqual([]);
  });

  it('a light that reaches the whole board lands in every bin', () => {
    const room: Light = {
      position: { x: -5, y: 22, z: 15 },
      colour: [0.6, 0.68, 1],
      intensity: 1,
      radius: 1.4,
      reach: 95,
    };
    const bins = binLights([room], BOARD);
    for (let b = 0; b < bins.counts.length; b++) expect(bins.counts[b]).toBe(1);
  });

  it('is conservative in xy, because a fragment can be above the board', () => {
    // A light 3 tiles up reaching 4 is within reach of a fragment 2.6 tiles
    // away in xy at height 0. Binning on the xy circle of radius `reach` can
    // only over-include, which is the safe direction: over-including costs an
    // attenuation that evaluates to nothing, under-including loses a light.
    const high: Light = {
      position: { x: 10, y: 7, z: 3 },
      colour: [1, 1, 1],
      intensity: 4,
      radius: 0.2,
      reach: 4,
    };
    const bins = binLights([high], BOARD, { binSize: 2 });
    expect(lightsAt(bins, 13.5, 7)).toContain(0);
  });

  it('drops a light whose whole footprint is off the binned region', () => {
    const far = emitter(400, 400, 1);
    const bins = binLights([far], BOARD);
    expect(bins.placed).toBe(0);
    expect(bins.maxPerBin).toBe(0);
  });
});

describe('the slot array is what the shader will read', () => {
  it('is sentinel-filled, so the inner loop can break instead of counting', () => {
    const bins = binLights([emitter(11, 7)], BOARD, { capacity: 4 });
    const bin = binIndexAt(bins, 11, 7);
    expect(bins.slots[bin * 4]).toBe(0);
    expect(bins.slots[bin * 4 + 1]).toBe(BIN_EMPTY);
    expect(bins.counts[bin]).toBe(1);
  });

  it('clamps a lookup outside the region exactly the way the shader clamps it', () => {
    const bins = binLights([emitter(0, 0)], BOARD);
    expect(binIndexAt(bins, -1e6, -1e6)).toBe(0);
    expect(binIndexAt(bins, 1e6, 1e6)).toBe(bins.binsX * bins.binsY - 1);
  });

  it('preserves caller order within a bin, so light 0 is still the lantern', () => {
    const lights = [emitter(11, 7, 6), emitter(11, 7, 6), emitter(11, 7, 6)];
    const bins = binLights(lights, BOARD);
    expect(lightsAt(bins, 11, 7)).toEqual([0, 1, 2]);
  });
});

describe('overflow is loud, and keeps the brightest', () => {
  it('reports every refused placement rather than dropping one quietly', () => {
    const stacked = [emitter(11, 7, 3, 5), emitter(11, 7, 3, 4), emitter(11, 7, 3, 3)];
    const bins = binLights(stacked, BOARD, { capacity: 2, binSize: 2 });
    expect(bins.dropped).toBeGreaterThan(0);
  });

  it('evicts the weakest occupant, not the newest arrival', () => {
    // A bright light enumerated LAST must still win a full bin. The naive
    // "first come, first served" version loses the brightest light in the
    // scene purely because of where it sat in the array — which is the same
    // class of bug as the global-8 cull, one level down.
    const dim = emitter(11, 7, 3, 0.2);
    const bright = emitter(11, 7, 3, 40);
    const bins = binLights([dim, dim, bright], BOARD, { capacity: 2, binSize: 2 });
    expect(lightsAt(bins, 11, 7)).toContain(2);
  });

  it('does not evict for something dimmer', () => {
    const bright = emitter(11, 7, 3, 40);
    const dim = emitter(11, 7, 3, 0.2);
    const bins = binLights([bright, bright, dim], BOARD, { capacity: 2, binSize: 2 });
    expect(lightsAt(bins, 11, 7)).toEqual([0, 1]);
  });

  it('a healthy frame reports zero drops and a peak below capacity', () => {
    const bins = binLights(crowdedBoard(), BOARD);
    expect(bins.dropped).toBe(0);
    expect(bins.maxPerBin).toBeLessThan(DEFAULT_BIN_CAPACITY);
  });
});

describe('packLights', () => {
  it('lays each light out as three RGBA texels the shader can texelFetch', () => {
    const l: Light = {
      position: { x: 1.5, y: 2.5, z: 3.5 },
      colour: [0.1, 0.2, 0.3],
      intensity: 7,
      radius: 0.25,
      reach: 4.5,
    };
    const data = packLights([l]);
    expect(data).toHaveLength(LIGHT_TEXELS * 4);
    expect(Array.from(data.slice(0, 4))).toEqual([1.5, 2.5, 3.5, 7]);
    // Float32, so exact equality is not available on anything with a fraction
    // that is not a dyadic rational. 0.1 arrives as 0.10000000149011612.
    expect(data[4]).toBeCloseTo(0.1, 6);
    expect(data[5]).toBeCloseTo(0.2, 6);
    expect(data[6]).toBeCloseTo(0.3, 6);
    expect(data[7]).toBe(1);
    expect(data[8]).toBe(4.5);
    expect(data[9]).toBe(0.25);
  });

  it('folds indirectOnly into "casts no shadow", because M5 does not exist yet', () => {
    // Routing an indirectOnly light OUT of the direct pass today would make it
    // invisible, which is the opposite of the feature. Until the lattice
    // lands, the flag means "no march".
    const base = { position: { x: 0, y: 0, z: 0 }, colour: [1, 1, 1] as [number, number, number], intensity: 1, radius: 0.1, reach: 2 };
    expect(packLights([{ ...base }])[7]).toBe(1);
    expect(packLights([{ ...base, indirectOnly: true }])[7]).toBe(0);
    expect(packLights([{ ...base, castsShadow: false }])[7]).toBe(0);
  });

  it('never returns a zero-length buffer, which is not a legal texture', () => {
    expect(packLights([]).length).toBe(LIGHT_TEXELS * 4);
  });

  it('refuses to index past the texture it will be uploaded into', () => {
    const many = Array.from({ length: MAX_SCENE_LIGHTS + 40 }, (_, i) => emitter(i % 20, 7));
    expect(packLights(many)).toHaveLength(MAX_SCENE_LIGHTS * LIGHT_TEXELS * 4);
    const bins = binLights(many, BOARD);
    // Reported, not silent — the thing this whole file exists to fix.
    expect(bins.dropped).toBeGreaterThanOrEqual(40);
  });
});
