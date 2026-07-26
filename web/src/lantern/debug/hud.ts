// =========================================================================
// THE DEBUG HUD — landing in M1, not when it is needed.
//
// ENGINE_PLAN §5.3 and §9.2: perf on the Deck is the risk most likely to
// bite, and the mitigation is "the debug HUD lands in M1... cascade count and
// resolution are dials from the first day they exist." §9.2 adds the reason
// this file exists rather than living inline in a render loop: "wire
// EXT_disjoint_timer_query_webgl2 into the M1 debug HUD so any future
// revisit is driven by numbers rather than fashion."
//
// Three pieces, deliberately separated by how testable they are:
//
//   FrameTimer   pure. A ring buffer and a percentile, nothing else.
//   TierAdapter  pure. Turns a FrameTimer's p99 into `quality.ts`'s
//                `adaptTier` calls, owning the stableFrames counter that
//                function needs and that nothing built it yet.
//   GpuTimer     NOT pure — a thin wrapper around
//                EXT_disjoint_timer_query_webgl2, whose whole shape is
//                "issue now, read back a few frames later, never block".
//                Untestable without a driver, so kept minimal and out of the
//                way of everything above, which is not.
//
// WHY P99 AND NOT AN AVERAGE. A single dropped frame among ninety-nine good
// ones barely moves a mean — the player felt a stutter the number cannot
// see. `test/hud.test.ts` stages exactly that frame and shows p50 blind to
// it while p99 is not, which is the concrete case for why `adaptTier`
// (quality.ts) is built on p99 rather than on anything an average would give
// it.
// =========================================================================
import { adaptTier, type TierName } from '../quality';

/**
 * A fixed-capacity window of recent frame times, in ms.
 *
 * `shift()` is O(n) on a 128-deep array — irrelevant at one push per frame,
 * and far simpler to read (and to get right) than a ring index. If this ever
 * shows up in a profile, that is a good problem: it means everything else
 * got cheap enough to notice.
 */
export class FrameTimer {
  private readonly samples: number[] = [];
  private readonly capacity: number;

  constructor(capacity = 128) {
    this.capacity = Math.max(1, capacity);
  }

  push(ms: number): void {
    this.samples.push(ms);
    if (this.samples.length > this.capacity) this.samples.shift();
  }

  get count(): number {
    return this.samples.length;
  }

  /** `p` in [0,1]. Nearest-rank on a sorted copy — simple, and exact at the sample counts a HUD deals in. */
  percentile(p: number): number {
    if (this.samples.length === 0) return 0;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
  }

  get p50(): number {
    return this.percentile(0.5);
  }

  get p99(): number {
    return this.percentile(0.99);
  }

  reset(): void {
    this.samples.length = 0;
  }
}

/**
 * Feeds a FrameTimer's p99 into `quality.ts`'s `adaptTier`, owning the
 * `stableFrames` counter that function's signature requires and resetting it
 * on every actual tier change — the hysteresis `adaptTier` is built around
 * only works if something upstream keeps that count honestly.
 */
export class TierAdapter {
  private readonly timer: FrameTimer;
  private tierValue: TierName;
  private stableFrames = 0;
  /** Below this many samples the window is too new to trust; hold the tier. */
  private readonly minSamples: number;

  constructor(initial: TierName, timer: FrameTimer, minSamples = 30) {
    this.tierValue = initial;
    this.timer = timer;
    this.minSamples = minSamples;
  }

  get tier(): TierName {
    return this.tierValue;
  }

  /** Call once per frame, after this frame's time has been pushed into the timer. */
  tick(): TierName {
    if (this.timer.count < this.minSamples) {
      this.stableFrames++;
      return this.tierValue;
    }
    const next = adaptTier(this.tierValue, this.timer.p99, this.stableFrames);
    if (next !== this.tierValue) {
      this.tierValue = next;
      this.stableFrames = 0;
    } else {
      this.stableFrames++;
    }
    return this.tierValue;
  }
}

export interface HudStats {
  tier: TierName;
  frameMs: number;
  p50: number;
  p99: number;
  drawCalls: number;
  lightCount: number;
  /** null when EXT_disjoint_timer_query_webgl2 is unavailable or no result has arrived yet. */
  gpuMs: number | null;
  /**
   * Whether the LIT path ran this frame, rather than flat albedo.
   *
   * Reported because "the lighting looks like it is not doing anything" and
   * "the lighting pass did not run" are indistinguishable on screen, and
   * chasing the first when it is the second is an hour gone.
   */
  lit?: boolean;
}

/** Plain text, matching the block `lantern-forge.html`'s `#stats` panel already renders. */
export function formatHud(s: HudStats): string {
  const gpu = s.gpuMs == null ? 'n/a' : `${s.gpuMs.toFixed(2)} ms`;
  return (
    `tier       ${s.tier}\n` +
    `frame      ${s.frameMs.toFixed(2)} ms\n` +
    `p50 / p99  ${s.p50.toFixed(2)} / ${s.p99.toFixed(2)} ms\n` +
    `draws      ${s.drawCalls}\n` +
    `lights     ${s.lightCount}\n` +
    `path       ${s.lit ? 'lit' : 'albedo only'}\n` +
    `gpu        ${gpu}`
  );
}

/**
 * `EXT_disjoint_timer_query_webgl2` results arrive asynchronously and can be
 * invalidated by a `GPU_DISJOINT_EXT` event (a clock reset, a power-state
 * change) between issue and read. This wrapper hides both: `begin`/`end`
 * bracket the GPU work, `poll` is safe to call every frame whether or not a
 * result is ready, and a disjoint result is silently dropped rather than
 * reported as a bogus timing. `ms` holds the last GOOD result, so callers
 * always have something to show even on a frame with nothing new.
 *
 * The extension's own type is not in lib.dom.d.ts, hence the `any` — no
 * amount of local typing makes an untyped browser API safer to call, and a
 * hand-rolled interface here would just be one more thing to keep in sync.
 */
export class GpuTimer {
  private readonly gl: WebGL2RenderingContext;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly ext: any;
  private active: WebGLQuery | null = null;
  private readonly pending: WebGLQuery[] = [];
  private lastMs = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  }

  get available(): boolean {
    return !!this.ext;
  }

  get ms(): number {
    return this.lastMs;
  }

  /** Bracket the frame's GPU work with `begin()`/`end()`. No-op without the extension. */
  begin(): void {
    if (!this.ext || this.active) return;
    const q = this.gl.createQuery();
    if (!q) return;
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  end(): void {
    if (!this.ext || !this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Drain whatever results are ready. Cheap when nothing is — one non-blocking query per pending item. */
  poll(): void {
    if (!this.ext) return;
    const gl = this.gl;
    while (this.pending.length > 0) {
      const q = this.pending[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
      const ns = gl.getQueryParameter(q, gl.QUERY_RESULT) as number;
      gl.deleteQuery(q);
      this.pending.shift();
      if (!disjoint) this.lastMs = ns / 1e6;
    }
  }

  dispose(): void {
    if (this.active) this.gl.deleteQuery(this.active);
    for (const q of this.pending) this.gl.deleteQuery(q);
    this.pending.length = 0;
    this.active = null;
  }
}
