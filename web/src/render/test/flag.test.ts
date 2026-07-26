// =========================================================================
// THE FLAG, AND THE CADENCE.
//
// ENGINE_PLAN §4's arrangement only holds if `dom` is the answer to every
// question that is not exactly `r=lantern`. A flag that could be turned on by
// a typo, a stale link or a leftover parameter would mean the default path is
// not really the default — and the default path is the game Paul plays daily.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { debugFrom, renderModeFrom } from '../flag';
import { STEP_MS, glidePosition, lerp, stepProgress } from '../walk';

describe('?r=lantern', () => {
  it('turns the canvas on, and only for that exact value', () => {
    expect(renderModeFrom('?r=lantern')).toBe('lantern');
    expect(renderModeFrom('?foo=1&r=lantern&bar=2')).toBe('lantern');
    expect(renderModeFrom('r=lantern')).toBe('lantern');
    expect(renderModeFrom('?r=LANTERN')).toBe('lantern');
    expect(renderModeFrom('?r= lantern ')).toBe('lantern');
  });

  it('falls back to the DOM map for everything else', () => {
    for (const q of ['', '?', '?r=', '?r=dom', '?r=lantrn', '?renderer=lantern', '?lantern', '?r=lantern2', '?x=y']) {
      expect(renderModeFrom(q)).toBe('dom');
    }
  });

  it('ignores a hash, which is where a router would put its state', () => {
    expect(renderModeFrom('?r=lantern#/floor')).toBe('lantern');
    expect(renderModeFrom('#r=lantern')).toBe('dom');
  });

  it('gates the HUD separately, so the flag alone is a clean frame', () => {
    expect(debugFrom('?r=lantern')).toBe(false);
    expect(debugFrom('?r=lantern&debug=1')).toBe(true);
    expect(debugFrom('?debug=0')).toBe(false);
  });
});

describe('one step, three consumers', () => {
  it('is linear across the tile', () => {
    expect(stepProgress(0)).toBe(0);
    expect(stepProgress(STEP_MS / 2)).toBeCloseTo(0.5, 9);
    expect(stepProgress(STEP_MS)).toBe(1);
  });

  it('clamps rather than overshooting a queued walk', () => {
    expect(stepProgress(-50)).toBe(0);
    expect(stepProgress(STEP_MS * 4)).toBe(1);
    expect(lerp(3, 7, stepProgress(STEP_MS * 4))).toBe(7);
  });

  it('puts the piece BETWEEN tiles part way through a step', () => {
    // The whole reason the glide survives the port: the hero is the light, so
    // a piece that jumps takes every shadow in the room with it. Landing on
    // the destination tile immediately would be indistinguishable from having
    // no glide at all, which is the bug this is here to reject.
    const g = { fromX: 2, fromY: 2, toX: 2, toY: 3, start: 1000 };
    expect(glidePosition(g, 1000)).toEqual({ x: 2, y: 2 });
    const mid = glidePosition(g, 1000 + STEP_MS / 2);
    expect(mid.y).toBeGreaterThan(2);
    expect(mid.y).toBeLessThan(3);
    expect(glidePosition(g, 1000 + STEP_MS)).toEqual({ x: 2, y: 3 });
    // A frame that arrives late must not overshoot into the next tile.
    expect(glidePosition(g, 1000 + STEP_MS * 9)).toEqual({ x: 2, y: 3 });
  });

  it('still agrees with the stylesheet', () => {
    // floor.css is the one copy no import can keep honest, and the two have to
    // agree or a multi-tile walk either stutters or snaps at each tile. This
    // is the check that catches somebody retuning the CSS alone.
    const css = readFileSync(fileURLToPath(new URL('../../floor.css', import.meta.url)), 'utf8');
    const glide = /\.hero-walker\.glide\s*\{[^}]*transition:\s*transform\s+(\d+)ms/.exec(css);
    expect(glide).not.toBeNull();
    expect(Number(glide![1])).toBe(STEP_MS);
    const gait = /\.hero-walker\.glide\s+\.hero-walker-art\s*\{[^}]*animation:\s*hero-gait\s+(\d+)ms/.exec(css);
    expect(gait).not.toBeNull();
    expect(Number(gait![1])).toBe(STEP_MS);
  });
});
