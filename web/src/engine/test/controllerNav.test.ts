import { describe, it, expect } from 'vitest';
import {
  AXIS_DOMINANCE,
  DEFAULT_DEADZONE,
  DEFAULT_REPEAT,
  IDLE_REPEAT,
  KEY_BUTTON,
  KEY_DIR,
  PAD_BUTTON,
  PAD_DPAD,
  applyDeadzone,
  buttonEdges,
  padDirection,
  pressedEdges,
  readPadButtons,
  rightStickScroll,
  stepRepeat,
  stickDirection,
  type NavDir,
  type PadLike,
} from '../../nav/input';
import {
  CROSS_PENALTY,
  crossAxisMiss,
  isFullyVisible,
  isInDirection,
  pickInDirection,
  pickWrapAround,
  rectCenter,
  scrollNeededFor,
  type NavRect,
} from '../../nav/geometry';

// ===========================================================================
// Controller navigation — input interpretation and focus geometry.
//
// SCOPE, stated honestly. This project's vitest runs in the plain `node`
// environment: there is no DOM, and the Gamepad API does not exist in jsdom
// anyway. So nav/ is split such that everything easy to get wrong is a pure
// function, and that is what these tests cover:
//
//   * deadzone shaping and stick→direction quantisation
//   * auto-repeat timing (the state machine, driven by an injected clock)
//   * button edge detection and the physical→semantic button map
//   * directional focus resolution and minimum-scroll math
//
// What these tests CANNOT cover, and what therefore still needs a human with
// a pad in their hands: that Steam Input actually reports standard mapping on
// a Deck, that focus moves where it looks like it should on the real
// battlefield, and that the ring is visible against every backdrop.
// ===========================================================================

const rect = (left: number, top: number, w = 100, h = 40): NavRect => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

function fakePad(buttons: number[], axes: number[] = [0, 0, 0, 0]): PadLike {
  return {
    buttons: buttons.map((v) => ({ pressed: v >= 1, value: v })),
    axes,
  };
}

// ---------------------------------------------------------------------------
describe('deadzones', () => {
  it('treats resting drift as centred', () => {
    // A worn Deck stick at rest. Every one of these must read as no input.
    for (const [x, y] of [
      [0, 0],
      [0.12, 0],
      [0, -0.2],
      [0.2, 0.2],
      [-0.24, 0.18],
    ]) {
      expect(applyDeadzone(x, y).magnitude, `${x},${y}`).toBe(0);
      expect(stickDirection(x, y), `${x},${y}`).toBeNull();
    }
  });

  it('is radial, not per-axis', () => {
    // (0.3, 0.3) is magnitude 0.42 — plainly deflected — even though neither
    // axis alone clears the 0.35 threshold. A per-axis deadzone would drop it.
    expect(Math.hypot(0.3, 0.3)).toBeGreaterThan(DEFAULT_DEADZONE.inner);
    expect(applyDeadzone(0.3, 0.3).magnitude).toBeGreaterThan(0);
  });

  it('rescales the surviving range so response is continuous at the edge', () => {
    const justInside = applyDeadzone(DEFAULT_DEADZONE.inner + 0.001, 0);
    expect(justInside.magnitude).toBeLessThan(0.02);
    const full = applyDeadzone(1, 0);
    expect(full.magnitude).toBe(1);
    // Monotonic in between.
    const a = applyDeadzone(0.5, 0).magnitude;
    const b = applyDeadzone(0.7, 0).magnitude;
    expect(b).toBeGreaterThan(a);
  });

  it('never reports magnitude above 1 even past the outer edge', () => {
    expect(applyDeadzone(1.4, 1.4).magnitude).toBe(1);
  });

  it('preserves direction while rescaling magnitude', () => {
    const v = applyDeadzone(-0.8, 0.6);
    expect(v.x).toBeLessThan(0);
    expect(v.y).toBeGreaterThan(0);
    // Same ratio as the input: only the length changed.
    expect(v.x / v.y).toBeCloseTo(-0.8 / 0.6, 5);
  });
});

// ---------------------------------------------------------------------------
describe('stick → direction', () => {
  it('quantises the four cardinals, with screen-coordinate Y', () => {
    expect(stickDirection(1, 0)).toBe('right');
    expect(stickDirection(-1, 0)).toBe('left');
    expect(stickDirection(0, 1)).toBe('down'); // gamepad +Y is down
    expect(stickDirection(0, -1)).toBe('up');
  });

  it('lets the dominant axis win a lopsided diagonal', () => {
    expect(stickDirection(0.9, 0.3)).toBe('right');
    expect(stickDirection(0.3, -0.9)).toBe('up');
  });

  it('refuses to guess on a true diagonal', () => {
    // 45° exactly: flip-flopping here on sensor noise is what makes a menu
    // feel possessed. No answer is the honest answer.
    expect(stickDirection(0.8, 0.8)).toBeNull();
    expect(stickDirection(-0.7, 0.7)).toBeNull();
  });

  it('has a hysteresis band, not a knife edge', () => {
    // Just inside the dominance ratio → no direction; clearly past it → one.
    const ratio = AXIS_DOMINANCE;
    expect(stickDirection(0.8, 0.8 / (ratio * 0.98))).toBeNull();
    expect(stickDirection(0.8, 0.8 / (ratio * 1.4))).toBe('right');
  });
});

// ---------------------------------------------------------------------------
describe('auto-repeat', () => {
  const cfg = DEFAULT_REPEAT;

  it('fires immediately on a fresh press', () => {
    const step = stepRepeat(IDLE_REPEAT, 'down', 1000, cfg);
    expect(step.fire).toBe(true);
    expect(step.repeat).toBe(false);
  });

  it('does not fire again during the initial delay', () => {
    let s = stepRepeat(IDLE_REPEAT, 'down', 0, cfg).state;
    for (let t = 16; t < cfg.delayMs; t += 16) {
      const step = stepRepeat(s, 'down', t, cfg);
      expect(step.fire, `t=${t}`).toBe(false);
      s = step.state;
    }
  });

  it('repeats at the configured interval once the delay elapses', () => {
    let s = stepRepeat(IDLE_REPEAT, 'down', 0, cfg).state;
    const fires: number[] = [];
    for (let t = 16; t <= 1600; t += 16) {
      const step = stepRepeat(s, 'down', t, cfg);
      s = step.state;
      if (step.fire) {
        expect(step.repeat).toBe(true);
        fires.push(t);
      }
    }
    expect(fires[0]).toBeGreaterThanOrEqual(cfg.delayMs);
    expect(fires[0]).toBeLessThan(cfg.delayMs + 32);
    // Steady cadence thereafter, to within one polled frame.
    for (let i = 1; i < fires.length; i++) {
      const gap = fires[i] - fires[i - 1];
      expect(gap).toBeGreaterThanOrEqual(cfg.intervalMs);
      expect(gap).toBeLessThan(cfg.intervalMs + 32);
    }
  });

  it('gives exactly one move per tap, however fast the tapping', () => {
    let s = IDLE_REPEAT;
    let fires = 0;
    // press / release / press / release ... every other frame.
    for (let i = 0; i < 40; i++) {
      const dir: NavDir | null = i % 2 === 0 ? 'right' : null;
      const step = stepRepeat(s, dir, i * 16, cfg);
      s = step.state;
      if (step.fire) fires++;
    }
    expect(fires).toBe(20);
  });

  it('resets the delay when the direction changes mid-hold', () => {
    let s = stepRepeat(IDLE_REPEAT, 'down', 0, cfg).state;
    // Hold long enough to be in the fast phase.
    s = stepRepeat(s, 'down', cfg.delayMs + 10, cfg).state;
    expect(s.repeating).toBe(true);
    // Roll to a new direction: fires at once, and is NOT still repeating.
    const changed = stepRepeat(s, 'left', cfg.delayMs + 20, cfg);
    expect(changed.fire).toBe(true);
    expect(changed.repeat).toBe(false);
    expect(changed.state.repeating).toBe(false);
    // ...and must serve out a fresh delay before repeating again.
    expect(stepRepeat(changed.state, 'left', cfg.delayMs + 120, cfg).fire).toBe(false);
  });

  it('returns to idle on release', () => {
    const held = stepRepeat(IDLE_REPEAT, 'up', 0, cfg).state;
    expect(stepRepeat(held, null, 50, cfg).state).toEqual(IDLE_REPEAT);
  });
});

// ---------------------------------------------------------------------------
describe('buttons', () => {
  it('detects rising edges only', () => {
    expect(pressedEdges([false, false], [true, false])).toEqual([0]);
    expect(pressedEdges([true, false], [true, false])).toEqual([]);
    expect(pressedEdges([true, false], [false, true])).toEqual([1]);
    expect(pressedEdges([], [true, true])).toEqual([0, 1]);
  });

  it('maps physical indices to the documented semantic names', () => {
    // If this table ever changes, CONTROLLER.md's button map is a lie.
    expect(PAD_BUTTON[0]).toBe('confirm'); // A
    expect(PAD_BUTTON[1]).toBe('cancel'); // B
    expect(PAD_BUTTON[2]).toBe('alt'); // X
    expect(PAD_BUTTON[3]).toBe('info'); // Y
    expect(PAD_BUTTON[4]).toBe('prevTab'); // LB
    expect(PAD_BUTTON[5]).toBe('nextTab'); // RB
    expect(PAD_BUTTON[9]).toBe('start'); // Menu
    expect(PAD_DPAD[12]).toBe('up');
    expect(PAD_DPAD[15]).toBe('right');
    // D-pad indices must never also be semantic buttons.
    for (const i of Object.keys(PAD_DPAD)) expect(PAD_BUTTON[Number(i)]).toBeUndefined();
  });

  it('reads an analog trigger that never sets `pressed`', () => {
    const pad = fakePad([0, 0, 0, 0, 0, 0, 0.9, 0]);
    expect(pad.buttons[6].pressed).toBe(false);
    expect(readPadButtons(pad)[6]).toBe(true);
    expect(buttonEdges([], readPadButtons(pad))).toContain('pageUp');
  });

  it('ignores a barely-brushed trigger', () => {
    expect(readPadButtons(fakePad([0, 0, 0, 0, 0, 0, 0.2, 0]))[6]).toBe(false);
  });

  it('emits semantic edges in index order and only once per press', () => {
    const a = readPadButtons(fakePad([1, 1]));
    expect(buttonEdges([], a)).toEqual(['confirm', 'cancel']);
    expect(buttonEdges(a, a)).toEqual([]);
  });

  it('prefers the D-pad over the stick when both are pushed', () => {
    const pressed: boolean[] = [];
    pressed[14] = true; // D-pad left
    expect(padDirection(pressed, [1, 0])).toBe('left');
    expect(padDirection([], [1, 0])).toBe('right');
  });

  it('falls back to the stick when the D-pad is idle', () => {
    expect(padDirection([], [0, -0.9])).toBe('up');
    expect(padDirection([], [0.05, 0.05])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('right-stick scrolling', () => {
  it('is silent inside the deadzone', () => {
    expect(rightStickScroll([0, 0, 0.1, 0.1], 16)).toEqual({ dx: 0, dy: 0 });
  });

  it('scales with deflection and frame time', () => {
    const slow = rightStickScroll([0, 0, 0, 0.5], 16);
    const fast = rightStickScroll([0, 0, 0, 1], 16);
    expect(fast.dy).toBeGreaterThan(slow.dy);
    const longFrame = rightStickScroll([0, 0, 0, 1], 32);
    expect(longFrame.dy).toBeCloseTo(fast.dy * 2, 5);
  });

  it('reads the RIGHT stick, not the left', () => {
    expect(rightStickScroll([1, 1, 0, 0], 16)).toEqual({ dx: 0, dy: 0 });
  });
});

// ---------------------------------------------------------------------------
describe('keyboard parity', () => {
  it('binds the arrows and the two universal keys', () => {
    expect(KEY_DIR.ArrowUp).toBe('up');
    expect(KEY_DIR.ArrowRight).toBe('right');
    expect(KEY_BUTTON.Enter).toBe('confirm');
    expect(KEY_BUTTON.Escape).toBe('cancel');
  });

  it('leaves letter keys entirely alone', () => {
    // FloorScreen binds WASD to hero movement and DeckScreen has a text search
    // field. Letters must stay screen-local or both break.
    for (const k of ['w', 'a', 's', 'd', 'e', 'i', 'h']) {
      expect(KEY_DIR[k]).toBeUndefined();
      expect(KEY_BUTTON[k]).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
describe('directional focus resolution', () => {
  it('picks the immediate neighbour, not the far one', () => {
    const row = [rect(0, 0), rect(120, 0), rect(240, 0)];
    expect(pickInDirection(row[0], row, 'right')).toBe(1);
    expect(pickInDirection(row[2], row, 'left')).toBe(1);
  });

  it('never picks the element it started from', () => {
    const row = [rect(0, 0), rect(120, 0)];
    expect(pickInDirection(row[1], row, 'right')).toBeNull();
  });

  it('stays in its column in a grid', () => {
    //  0  1
    //  2  3
    const grid = [rect(0, 0), rect(120, 0), rect(0, 60), rect(120, 60)];
    expect(pickInDirection(grid[0], grid, 'down')).toBe(2);
    expect(pickInDirection(grid[1], grid, 'down')).toBe(3);
    expect(pickInDirection(grid[3], grid, 'up')).toBe(1);
    expect(pickInDirection(grid[3], grid, 'left')).toBe(2);
  });

  it('prefers a well-aligned neighbour over a nearer misaligned one', () => {
    const from = rect(0, 0, 100, 40);
    // `near` is closer in raw distance but sits well off to the side; `aligned`
    // is dead below. Down should mean down.
    const near = rect(400, 55, 100, 40);
    const aligned = rect(0, 90, 100, 40);
    const picked = pickInDirection(from, [near, aligned], 'down');
    expect(picked).toBe(1);
  });

  it('treats any shared span on the cross axis as aligned', () => {
    // A wide End Turn button under a narrow card still counts as "below" it.
    const card = rect(200, 0, 60, 100);
    const wideButton = rect(0, 140, 600, 50);
    expect(crossAxisMiss(card, wideButton, 'down')).toBe(0);
    expect(pickInDirection(card, [wideButton], 'down')).toBe(0);
  });

  it('handles the overlapping card fan', () => {
    // Hand cards overlap by design (battle.css: margin-left: -52px). Centre-
    // only or edge-only tests both misbehave here; requiring both does not.
    const fan = [0, 1, 2, 3, 4].map((i) => rect(i * 60, 0, 120, 180));
    for (let i = 0; i < fan.length - 1; i++) {
      expect(pickInDirection(fan[i], fan, 'right'), `card ${i}`).toBe(i + 1);
    }
    for (let i = fan.length - 1; i > 0; i--) {
      expect(pickInDirection(fan[i], fan, 'left'), `card ${i}`).toBe(i - 1);
    }
  });

  it('refuses to move toward nothing', () => {
    const row = [rect(0, 0), rect(120, 0)];
    expect(pickInDirection(row[0], row, 'up')).toBeNull();
    expect(pickInDirection(row[0], row, 'down')).toBeNull();
  });

  it('rejects a fully-enclosing or enclosed rect as a direction', () => {
    const inner = rect(50, 50, 20, 20);
    const outer = rect(0, 0, 200, 200);
    for (const dir of ['up', 'down', 'left', 'right'] as NavDir[]) {
      expect(isInDirection(inner, outer, dir), dir).toBe(false);
    }
  });

  it('weights cross-axis drift heavily enough to matter', () => {
    expect(CROSS_PENALTY).toBeGreaterThan(1);
  });

  it('centres are what advance is measured between', () => {
    expect(rectCenter(rect(0, 0, 100, 40))).toEqual({ x: 50, y: 20 });
  });
});

// ---------------------------------------------------------------------------
describe('wrap-around', () => {
  const column = [rect(0, 0), rect(0, 60), rect(0, 120)];

  it('returns to the top of the column past the last item', () => {
    expect(pickInDirection(column[2], column, 'down', { wrap: true })).toBe(0);
    expect(pickInDirection(column[0], column, 'up', { wrap: true })).toBe(2);
  });

  it('is off unless asked for', () => {
    expect(pickInDirection(column[2], column, 'down')).toBeNull();
  });

  it('never wraps into a different lane', () => {
    // A control high on the screen but in another column is NOT where "down
    // past the end" should land.
    const mine = [rect(0, 0), rect(0, 60)];
    const stranger = rect(500, 0);
    expect(pickWrapAround(mine[1], [...mine, stranger], 'down')).toBe(0);
  });

  it('does not wrap when there is nowhere to wrap to', () => {
    const lonely = rect(0, 0);
    expect(pickInDirection(lonely, [lonely], 'down', { wrap: true })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
describe('scroll-into-view math', () => {
  const viewport = rect(0, 0, 400, 300);

  it('asks for nothing when the target is comfortably inside', () => {
    expect(scrollNeededFor(rect(50, 50, 100, 40), viewport)).toEqual({ dx: 0, dy: 0 });
    expect(isFullyVisible(rect(50, 50, 100, 40), viewport)).toBe(true);
  });

  it('scrolls the minimum that clears the edge, plus a margin', () => {
    const below = rect(50, 320, 100, 40); // 20px past the bottom
    const need = scrollNeededFor(below, viewport, 24);
    expect(need.dx).toBe(0);
    expect(need.dy).toBe(360 - 300 + 24);
  });

  it('does not recentre — that is the bug it exists to avoid', () => {
    const need = scrollNeededFor(rect(50, 310, 100, 40), viewport, 24);
    // A recentring implementation would want ~180px here.
    expect(need.dy).toBeLessThan(100);
  });

  it('scrolls up for a target above the viewport', () => {
    const need = scrollNeededFor(rect(50, -50, 100, 40), viewport, 24);
    expect(need.dy).toBeLessThan(0);
  });

  it('aligns the leading edge of a target bigger than the viewport', () => {
    const huge = rect(0, -100, 100, 900);
    const need = scrollNeededFor(huge, viewport, 24);
    // Bring its TOP into view rather than chasing its bottom off-screen.
    expect(need.dy).toBe(-100 - 24);
  });

  it('handles both axes at once', () => {
    const need = scrollNeededFor(rect(500, 400, 60, 30), viewport, 10);
    expect(need.dx).toBeGreaterThan(0);
    expect(need.dy).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
describe('a whole press, end to end', () => {
  it('walks a menu: tap down twice, hold, then confirm', () => {
    const menu = [rect(0, 0), rect(0, 60), rect(0, 120), rect(0, 180)];
    let cursor = 0;
    let repeatState = IDLE_REPEAT;
    let prev: boolean[] = [];

    const frame = (pad: PadLike, now: number) => {
      const pressed = readPadButtons(pad);
      const edges = buttonEdges(prev, pressed);
      prev = pressed;
      const dir = padDirection(pressed, pad.axes);
      const step = stepRepeat(repeatState, dir, now, DEFAULT_REPEAT);
      repeatState = step.state;
      if (step.fire && dir) {
        const hit = pickInDirection(menu[cursor], menu, dir, { wrap: true });
        if (hit !== null) cursor = hit;
      }
      return edges;
    };

    const idle = fakePad([]);
    const stickDown = fakePad([], [0, 0.95, 0, 0]);

    frame(stickDown, 0);
    expect(cursor).toBe(1);
    frame(idle, 16);
    frame(stickDown, 32);
    expect(cursor).toBe(2);

    // Now hold: nothing until the delay, then it walks and wraps.
    for (let t = 48; t < 48 + DEFAULT_REPEAT.delayMs - 16; t += 16) frame(stickDown, t);
    expect(cursor).toBe(2);
    for (let t = 48 + DEFAULT_REPEAT.delayMs; t < 1400; t += 16) frame(stickDown, t);
    expect(cursor).not.toBe(2); // it moved on

    // A press is reported once, as 'confirm'.
    frame(idle, 1500);
    expect(frame(fakePad([1]), 1516)).toEqual(['confirm']);
    expect(frame(fakePad([1]), 1532)).toEqual([]);
  });
});
