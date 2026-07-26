// =========================================================================
// QUALITY TIERS — one renderer, three very different machines.
//
// Paul is shipping to the Steam Deck, the Steam Machine, his own Windows/
// NVIDIA desktop, and the open web. That is not one spec with a fallback; it
// is a SPREAD, and the honest way to build for a spread is to pick a floor and
// a ceiling and make both of them good.
//
//   FLOOR    the Steam Deck. This setting has to be GOOD, not merely
//            playable. If the cheap tier looks bad, the game looks bad,
//            because handhelds are where it will mostly be played.
//   CEILING  the Steam Machine and desktop GPUs. Where the expensive
//            options — the bilinear fix, base-16 cascade 0 — are on.
//
// The dial exists from M1 rather than being retrofitted, for a reason the
// research made concrete: the radiance cascade cost is dominated by RAY COUNT,
// and the bilinear fix alone is 4x rays. A knob added after the fact tends to
// be a resolution slider bolted onto whatever was already built; a knob
// designed in shapes what gets built.
//
// See docs/ENGINE_PLAN.md §9.2 and §9.3 for where every number came from.
// =========================================================================

export type TierName = 'floor' | 'mid' | 'ceiling';

export interface Quality {
  name: TierName;

  // --- radiance cascades (M5) -------------------------------------------
  /**
   * Cascade-0 probe spacing in canvas px. Memory and ray count both scale as
   * 1/d0^2, so this is the single most powerful knob in the renderer:
   * 2 -> ~49MB and ~6.1M ray intervals, 4 -> ~12MB and ~1.5M.
   */
  probeSpacing: number;
  /** Directions at cascade 0. 16 fits the circular-harmonic basis properly; 4 does not. */
  cascade0Directions: 4 | 16;
  /**
   * The bilinear fix — 4x rays on every cascade but the topmost.
   *
   * Off at the floor and that is a real loss, not a formality: ringing is
   * worst with small high-opacity emitters, which is precisely a lantern in
   * the dark. Expect the Deck to show some, and expect to spend time on
   * cheaper mitigations for that tier specifically.
   */
  bilinearFix: boolean;

  // --- post ---------------------------------------------------------------
  /** Downsample steps in the bloom mip chain. Fewer = a tighter, less atmospheric glow. */
  bloomSteps: number;
  /** Render scale for the lighting targets. 1 = full res. */
  renderScale: number;

  // --- direct lighting ----------------------------------------------------
  /** Samples across the flame's disc for penumbra. Carried over from lightEngine. */
  flameSamples: number;
  /** Short-range SDF march for contact shadows, until HRC lands. */
  contactShadows: boolean;
}

/**
 * The Deck, and anything that measures like it.
 *
 * `renderScale` stays at 1 deliberately while `probeSpacing` doubles. Dropping
 * resolution blurs the ART, which is the thing the player is actually looking
 * at; dropping probe density blurs only the INDIRECT light, which is
 * low-frequency to begin with and is the thing least likely to be missed.
 * Given a choice about where to lose detail, lose it in the term that has none.
 */
export const FLOOR: Quality = {
  name: 'floor',
  probeSpacing: 4,
  cascade0Directions: 4,
  bilinearFix: false,
  bloomSteps: 5,
  renderScale: 1,
  flameSamples: 7,
  contactShadows: true,
};

export const MID: Quality = {
  name: 'mid',
  probeSpacing: 2,
  cascade0Directions: 4,
  bilinearFix: false,
  bloomSteps: 6,
  renderScale: 1,
  flameSamples: 9,
  contactShadows: true,
};

export const CEILING: Quality = {
  name: 'ceiling',
  probeSpacing: 2,
  cascade0Directions: 16,
  bilinearFix: true,
  bloomSteps: 7,
  renderScale: 1,
  flameSamples: 11,
  contactShadows: true,
};

export const TIERS: Record<TierName, Quality> = { floor: FLOOR, mid: MID, ceiling: CEILING };

/**
 * Roughly how many ray intervals a tier costs per frame, at a given size.
 *
 * Not a benchmark — a budget, so the dial can be reasoned about before any of
 * the cascade code exists. `4 * W * H / d0^2` texels per cascade, constant
 * across cascades by construction (alpha=4 doubles probe spacing per axis
 * exactly as it quadruples ray count), times cascade count, times 4 if the
 * bilinear fix is on.
 */
export function rayBudget(q: Quality, width: number, height: number): number {
  const texels = (4 * width * height) / (q.probeSpacing * q.probeSpacing);
  const cascades = cascadeCount(q, width, height);
  return texels * cascades * (q.bilinearFix ? 4 : 1);
}

/**
 * How many cascades are needed to reach across the screen.
 *
 * Intervals tile the ray as a geometric series with ratio 4, so total reach
 * after `n` cascades is `t0 * (4^n - 1) / 3`. Solve for reach >= the screen
 * diagonal. Beyond that you are paying for rays that leave the screen.
 */
export function cascadeCount(q: Quality, width: number, height: number): number {
  const diagonal = Math.hypot(width, height);
  const t0 = q.probeSpacing;
  return Math.max(1, Math.ceil(Math.log((3 * diagonal) / t0 + 1) / Math.log(4)));
}

/** Bytes of cascade storage, RGBA16F, including one ping-pong target. */
export function cascadeBytes(q: Quality, width: number, height: number): number {
  const texels = (4 * width * height) / (q.probeSpacing * q.probeSpacing);
  const dirScale = q.cascade0Directions / 4;
  return texels * 8 * (cascadeCount(q, width, height) + 1) * dirScale;
}

/**
 * What the GPU says it is.
 *
 * `UNMASKED_RENDERER_WEBGL` is a hint and nothing more — it is spoofed, masked
 * or generic on plenty of machines, which is exactly why it only picks a
 * STARTING tier here. The frame timer is the authority; see `adaptTier`.
 */
export function tierFromRenderer(renderer: string | null, deviceMemoryGb?: number): TierName {
  const r = (renderer ?? '').toLowerCase();
  // The Deck and its relatives.
  //
  // `vangogh` is ONE WORD — it is the codename of the Deck's APU as Mesa
  // reports it, e.g. "AMD Custom GPU 0405 (vangogh, LLVM 15.0.7, DRM 3.49,
  // ...)". Spelling it "van gogh" after the painter matches nothing and puts
  // every Deck on the wrong tier, which is the one machine this function most
  // needs to get right. `custom gpu 0405` is the same part by device id, kept
  // as a second way in because ANGLE and driver updates reword these strings.
  if (/vangogh|custom gpu 0405|steam ?deck/.test(r)) return 'floor';
  // Handheld and thin-and-light AMD APUs of the same class.
  if (/radeon.*\b(680m|780m|880m|890m)\b|vega \d/.test(r)) return 'floor';
  // Anything that self-identifies as integrated, plus Apple's low end.
  if (/\b(intel|uhd|iris|hd graphics)\b/.test(r) && !/arc/.test(r)) return 'floor';
  if (/adreno|mali|powervr|apple a\d/.test(r)) return 'floor';
  // Discrete parts that are comfortably past the floor.
  if (/rtx|radeon rx|arc a\d|apple m[1-9]/.test(r)) return 'ceiling';
  // A small-memory machine is a handheld or a thin client whatever it claims.
  if (deviceMemoryGb != null && deviceMemoryGb <= 4) return 'floor';
  return 'mid';
}

/** Frame-time band we are aiming to stay inside, in ms. 60fps with headroom. */
export const TARGET_FRAME_MS = 16.6;
export const COMFORT_FRAME_MS = 13.0;

/**
 * Move the dial based on what the frame timer actually measured.
 *
 * Asymmetric on purpose, and the asymmetry is the whole design:
 *
 *   DOWN is fast and eager — one bad window and the tier drops, because a
 *   player who is dropping frames is having a worse time right now.
 *   UP is slow and reluctant, and requires a much larger margin than the
 *   threshold it would have to clear afterwards.
 *
 * Without that gap the two rules form an oscillator: raise the tier, miss the
 * target, drop it, comfortably beat the target, raise it again — and a
 * renderer that changes quality twice a second is far more distracting than
 * one that is simply a notch too low. The hysteresis is what makes the dial
 * settle rather than hunt.
 */
export function adaptTier(current: TierName, p99FrameMs: number, stableFrames: number): TierName {
  const order: TierName[] = ['floor', 'mid', 'ceiling'];
  const i = order.indexOf(current);
  if (p99FrameMs > TARGET_FRAME_MS && i > 0) return order[i - 1];
  // Raising needs a sustained run AND real headroom — not merely hitting the
  // target, which is the level the next tier up would have to hit too.
  if (p99FrameMs < COMFORT_FRAME_MS * 0.75 && stableFrames > 240 && i < order.length - 1) {
    return order[i + 1];
  }
  return current;
}
