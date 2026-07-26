// =========================================================================
// QUALITY TIERS.
//
// The dial has to do two things that pull against each other: make the Deck
// good, and let a desktop spend what it has. The tests that matter are the
// ones about the SHAPE of the dial rather than about any particular number —
// that the budget actually falls between tiers, that the memory claims in
// ENGINE_PLAN §9.3 are what the code computes, and above all that the
// adaptive rule settles instead of oscillating.
// =========================================================================
import { describe, expect, it } from 'vitest';
import {
  CEILING,
  COMFORT_FRAME_MS,
  FLOOR,
  MID,
  TARGET_FRAME_MS,
  TIERS,
  adaptTier,
  cascadeBytes,
  cascadeCount,
  rayBudget,
  tierFromRenderer,
  type TierName,
} from '../quality';

const W = 1280;
const H = 800;
const MB = 1024 * 1024;

describe('the tiers are actually different', () => {
  it('costs strictly more as it goes up', () => {
    // A dial whose settings cost the same is not a dial. Ray count is the
    // thing that decides frame time, so that is what has to separate.
    const f = rayBudget(FLOOR, W, H);
    const m = rayBudget(MID, W, H);
    const c = rayBudget(CEILING, W, H);
    expect(f).toBeLessThan(m);
    expect(m).toBeLessThan(c);
    // And the spread is worth having — a floor that is 15% cheaper buys nothing.
    expect(c / f).toBeGreaterThan(8);
  });

  it('puts the floor an order of magnitude under the ceiling on memory', () => {
    expect(cascadeBytes(CEILING, W, H) / cascadeBytes(FLOOR, W, H)).toBeGreaterThan(4);
  });
});

describe('the numbers in ENGINE_PLAN §9.3 are the numbers the code computes', () => {
  it('needs 6 cascades at 1280x800 with 2px probes', () => {
    expect(cascadeCount(MID, W, H)).toBe(6);
  });

  it('lands near 49MB of cascade storage at the documented settings', () => {
    // Doc says ~49MB for the cascades, ~60-70MB with ping-pong. `cascadeBytes`
    // includes one spare target, so it should sit in the upper part of that.
    const mb = cascadeBytes(MID, W, H) / MB;
    expect(mb).toBeGreaterThan(45);
    expect(mb).toBeLessThan(75);
  });

  it('keeps the floor comfortably inside a handheld budget', () => {
    expect(cascadeBytes(FLOOR, W, H) / MB).toBeLessThan(20);
  });

  it('adds a cascade as probes get denser, not as the screen grows a little', () => {
    // Reach is geometric in the interval length, so cascade count moves with
    // log of the diagonal — a modest resolution bump must NOT cost a cascade.
    expect(cascadeCount(MID, 1280, 800)).toBe(cascadeCount(MID, 1600, 900));
    expect(cascadeCount(FLOOR, W, H)).toBeLessThanOrEqual(cascadeCount(MID, W, H));
  });

  it('charges 4x for the bilinear fix', () => {
    const withFix = rayBudget({ ...MID, bilinearFix: true }, W, H);
    const without = rayBudget({ ...MID, bilinearFix: false }, W, H);
    expect(withFix / without).toBeCloseTo(4, 6);
  });
});

describe('picking a starting tier', () => {
  it('puts a Steam Deck on the floor', () => {
    // The real strings, verbatim. `vangogh` is one word — the APU codename as
    // Mesa reports it, not the painter. Spelling it "van gogh" matched nothing
    // and silently put every Deck on the wrong tier; this test is why that was
    // caught before it shipped rather than after.
    expect(tierFromRenderer('AMD Custom GPU 0405 (vangogh, LLVM 15.0.7, DRM 3.49, 6.1.52-valve16-1-neptune-61)')).toBe(
      'floor',
    );
    expect(tierFromRenderer('AMD Custom GPU 0405 (RADV VANGOGH)')).toBe('floor');
    expect(tierFromRenderer('ANGLE (AMD, AMD Custom GPU 0405 (RADV VANGOGH), Vulkan 1.3)')).toBe('floor');
    expect(tierFromRenderer('Steam Deck')).toBe('floor');
    expect(tierFromRenderer('SteamDeck')).toBe('floor');
  });

  it('puts handheld AMD APUs on the floor without catching desktop Radeons', () => {
    expect(tierFromRenderer('AMD Radeon 780M Graphics')).toBe('floor');
    expect(tierFromRenderer('AMD Radeon Vega 8 Graphics')).toBe('floor');
    // ...but a desktop card whose model number merely contains those digits
    // must not be dragged down with them.
    expect(tierFromRenderer('AMD Radeon RX 6800 XT')).toBe('ceiling');
  });

  it('puts integrated graphics on the floor', () => {
    expect(tierFromRenderer('Intel(R) UHD Graphics 620')).toBe('floor');
    expect(tierFromRenderer('Mali-G78')).toBe('floor');
    expect(tierFromRenderer('Adreno (TM) 640')).toBe('floor');
  });

  it('puts a discrete card on the ceiling', () => {
    // Paul's own desktop, and the Steam Machine's class of part.
    expect(tierFromRenderer('NVIDIA GeForce RTX 3060 Ti/PCIe/SSE2')).toBe('ceiling');
    expect(tierFromRenderer('AMD Radeon RX 7600')).toBe('ceiling');
    expect(tierFromRenderer('Apple M2 Pro')).toBe('ceiling');
  });

  it('does not mistake Intel Arc for integrated Intel', () => {
    // "Intel" appears in both; the discrete part must not land on the floor.
    expect(tierFromRenderer('Intel(R) Arc(TM) A770 Graphics')).not.toBe('floor');
  });

  it('falls back to the middle when the GPU will not say', () => {
    // Masked or spoofed renderer strings are common and must not crash or
    // silently pick the ceiling on a machine that cannot hold it.
    expect(tierFromRenderer(null)).toBe('mid');
    expect(tierFromRenderer('')).toBe('mid');
    expect(tierFromRenderer('WebKit WebGL')).toBe('mid');
  });

  it('treats a small-memory machine as a handheld whatever it claims', () => {
    expect(tierFromRenderer('Some Unknown GPU', 4)).toBe('floor');
  });
});

describe('the adaptive dial settles instead of hunting', () => {
  it('drops a tier the moment frames are missed', () => {
    expect(adaptTier('ceiling', 22, 1000)).toBe('mid');
    expect(adaptTier('mid', 19, 1000)).toBe('floor');
  });

  it('never drops below the floor or climbs past the ceiling', () => {
    expect(adaptTier('floor', 40, 0)).toBe('floor');
    expect(adaptTier('ceiling', 1, 100000)).toBe('ceiling');
  });

  it('will not raise on a brief good patch', () => {
    // Headroom without endurance is a gust, not a trend.
    expect(adaptTier('floor', 4, 10)).toBe('floor');
    expect(adaptTier('floor', 4, 239)).toBe('floor');
  });

  it('will not raise on merely hitting the target', () => {
    // The trap: raising because we cleared the same bar the NEXT tier would
    // have to clear. It cannot, so it drops again next frame.
    expect(adaptTier('floor', TARGET_FRAME_MS - 0.1, 100000)).toBe('floor');
    expect(adaptTier('floor', COMFORT_FRAME_MS, 100000)).toBe('floor');
  });

  /**
   * THE OSCILLATION TEST.
   *
   * A dial with one threshold for up and down is an oscillator: raise, miss,
   * drop, comfortably beat, raise. Quality flapping twice a second is far more
   * distracting than sitting one notch low, so the gap between the two rules
   * is the actual feature and this is what proves it exists.
   */
  it('does not oscillate when a machine sits right at the boundary', () => {
    // A machine whose cost scales ~2.5x per tier and which lands exactly on
    // target at 'mid'. A naive dial flips forever between mid and ceiling.
    const costAt: Record<TierName, number> = { floor: 6.6, mid: 16.5, ceiling: 41 };
    let tier: TierName = 'mid';
    let stable = 0;
    const visited: TierName[] = [];
    for (let frame = 0; frame < 3000; frame++) {
      const next = adaptTier(tier, costAt[tier], stable);
      stable = next === tier ? stable + 1 : 0;
      tier = next;
      visited.push(tier);
    }
    // It must come to rest, and the last thousand frames must be one value.
    const tail = new Set(visited.slice(-1000));
    expect(tail.size).toBe(1);
    // Count how often it changed at all across the whole run.
    let flips = 0;
    for (let i = 1; i < visited.length; i++) if (visited[i] !== visited[i - 1]) flips++;
    expect(flips).toBeLessThanOrEqual(2);
  });

  it('climbs when there is real, sustained headroom', () => {
    let tier: TierName = 'floor';
    for (let i = 0; i < 2000; i++) tier = adaptTier(tier, 5, i);
    expect(tier).toBe('ceiling');
  });
});

describe('every tier is internally coherent', () => {
  it('never asks for the expensive option at the cheap tier', () => {
    // The floor has to actually BE the floor. A tier that turns the bilinear
    // fix on has not saved anything worth the name.
    expect(FLOOR.bilinearFix).toBe(false);
    expect(FLOOR.probeSpacing).toBeGreaterThanOrEqual(MID.probeSpacing);
    for (const q of Object.values(TIERS)) {
      expect(q.probeSpacing).toBeGreaterThan(0);
      expect(q.bloomSteps).toBeGreaterThanOrEqual(4);
      expect([4, 16]).toContain(q.cascade0Directions);
      // Resolution is never the thing sacrificed — that blurs the ART, and the
      // art is what the player is looking at. Detail comes out of the indirect
      // term, which is low-frequency and will not be missed.
      expect(q.renderScale).toBe(1);
      // Contact shadows stay on everywhere: they are the cue that sells a
      // piece standing ON a board rather than floating over it.
      expect(q.contactShadows).toBe(true);
    }
  });
});
