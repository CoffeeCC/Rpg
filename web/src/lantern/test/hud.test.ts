// =========================================================================
// THE DEBUG HUD — the pure half (FrameTimer, TierAdapter, formatHud).
//
// `GpuTimer` needs a real driver and is exercised visually through
// `lantern-forge.html`, the same split `program.test.ts` documents for
// `ProgramCache`.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { FrameTimer, TierAdapter, formatHud } from '../debug/hud';

describe('FrameTimer', () => {
  it('reports 0 with nothing pushed yet', () => {
    const t = new FrameTimer();
    expect(t.p50).toBe(0);
    expect(t.p99).toBe(0);
    expect(t.count).toBe(0);
  });

  it('THE REPRO: a single dropped frame among 49 good ones is invisible to p50 but not to p99', () => {
    const t = new FrameTimer(200);
    for (let i = 0; i < 49; i++) t.push(10);
    t.push(100); // one hitch — a frame that missed vsync badly
    expect(t.p50).toBeCloseTo(10, 6);
    // An average would also miss this: (49*10 + 100)/50 = 11.8, which reads
    // as "fine". p99 must not.
    const mean = (49 * 10 + 100) / 50;
    expect(t.p99).toBeGreaterThan(mean * 5);
    expect(t.p99).toBeCloseTo(100, 6);
  });

  it('drops the oldest sample once past capacity', () => {
    const t = new FrameTimer(4);
    for (let i = 0; i < 4; i++) t.push(1);
    expect(t.count).toBe(4);
    expect(t.p50).toBe(1);
    // Four more pushes fully evict the original run of 1s.
    for (const v of [10, 20, 30, 40]) t.push(v);
    expect(t.count).toBe(4);
    expect(t.p50).toBeGreaterThan(1);
  });

  it('percentile is monotonic in p', () => {
    const t = new FrameTimer(50);
    for (let i = 0; i < 50; i++) t.push(i);
    let prev = -Infinity;
    for (const p of [0, 0.1, 0.5, 0.9, 0.99, 1]) {
      const v = t.percentile(p);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it('reset empties the window', () => {
    const t = new FrameTimer();
    t.push(50);
    t.reset();
    expect(t.count).toBe(0);
    expect(t.p99).toBe(0);
  });
});

describe('TierAdapter', () => {
  it('holds the initial tier until the window has enough samples to trust', () => {
    const timer = new FrameTimer(128);
    const adapter = new TierAdapter('ceiling', timer, 30);
    for (let i = 0; i < 29; i++) {
      timer.push(50); // would demand a drop, if it were trusted yet
      expect(adapter.tick()).toBe('ceiling');
    }
  });

  it('drops immediately once the window is trusted and frames are missed', () => {
    const timer = new FrameTimer(128);
    const adapter = new TierAdapter('ceiling', timer, 10);
    for (let i = 0; i < 10; i++) timer.push(6); // fill the window comfortably under target
    adapter.tick();
    expect(adapter.tier).toBe('ceiling');
    timer.push(30); // one bad frame moves p99 into the drop zone
    expect(adapter.tick()).toBe('mid');
  });

  it('resets the stability count on every actual change, so the climb-back needs its own sustained run', () => {
    const timer = new FrameTimer(300);
    const adapter = new TierAdapter('floor', timer, 5);
    for (let i = 0; i < 5; i++) timer.push(5);
    adapter.tick();
    // A merely long history is not the same as a long STABLE one — feed a
    // huge window of good frames but keep re-triggering the floor via one
    // bad frame each round, and it must never climb.
    for (let round = 0; round < 5; round++) {
      for (let i = 0; i < 50; i++) {
        timer.push(4);
        adapter.tick();
      }
      timer.push(40); // never lets stableFrames build past this
      adapter.tick();
    }
    expect(adapter.tier).toBe('floor');
  });

  it('does climb given a real sustained stretch of headroom', () => {
    const timer = new FrameTimer(400);
    const adapter = new TierAdapter('floor', timer, 5);
    let last: string = 'floor';
    for (let i = 0; i < 2000; i++) {
      timer.push(4); // well under COMFORT_FRAME_MS
      last = adapter.tick();
    }
    expect(last).toBe('ceiling');
  });
});

describe('formatHud', () => {
  it('renders every field, and spells out n/a rather than "null"', () => {
    const text = formatHud({
      tier: 'mid',
      frameMs: 12.345,
      p50: 10,
      p99: 15.5,
      drawCalls: 7,
      lightCount: 1,
      gpuMs: null,
    });
    expect(text).toContain('mid');
    expect(text).toContain('12.35'); // rounds, not truncates
    expect(text).toContain('n/a');
    expect(text).not.toContain('null');
  });

  it('renders a real GPU time when one is available', () => {
    const text = formatHud({
      tier: 'ceiling',
      frameMs: 8,
      p50: 8,
      p99: 9,
      drawCalls: 3,
      lightCount: 0,
      gpuMs: 2.5,
    });
    expect(text).toContain('2.50 ms');
  });
});
