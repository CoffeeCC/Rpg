import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
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

// ===========================================================================
// Per-screen conversion coverage.
//
// These are SOURCE-level assertions, and that is a deliberate choice worth
// defending. This project's vitest runs in the plain `node` environment with
// no DOM and no react-dom/test-utils — rendering a screen to assert "the
// cursor lands on the Gates button" is not available without adding jsdom and
// a testing library to a dependency list somebody has kept deliberately short.
//
// What IS worth pinning without a DOM is the contract every converted screen
// must satisfy, because the failure mode is silence: a screen that forgets to
// register a scope is not broken on a mouse, does not throw, and does not show
// up in any other test. It is simply dead on a Deck. So:
//
//   * every screen component registers a scope, with an id (id = focus memory)
//   * screens whose exit is a Back button bind cancel; screens where a stray B
//     would destroy something (a save, a rare card, a run) deliberately do not
//   * the modals trap
//   * nobody auto-focuses a text input (that pops the Steam OSK and traps a
//     controller in a field it cannot type into)
//   * and the list below accounts for EVERY screen in components/, so a new
//     screen cannot be added without someone deciding what its B button does
// ===========================================================================

const COMPONENT_DIR = fileURLToPath(new URL('../../components/', import.meta.url));

/**
 * Source with comments removed. These files explain their nav decisions in
 * prose — "No `onCancel`: the player must choose" — and a test that grepped
 * raw source would read the explanation as the thing it denies.
 */
function componentSource(file: string): string {
  return readFileSync(join(COMPONENT_DIR, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

interface NavScreenSpec {
  file: string;
  /** Scope ids this file registers. */
  ids: string[];
  /** Does B / Escape do something here? */
  cancels: boolean;
  /** Does this file register at least one trapping modal scope? */
  traps?: boolean;
}

/**
 * Converted, with the decision each one made about B.
 *
 * `cancels: false` is always a deliberate refusal, never an omission — see the
 * comment at each call site. Reward, event, victory and fallen are all screens
 * where the only thing B could reach is irreversible.
 */
const CONVERTED: NavScreenSpec[] = [
  // Wave 1 — the reference implementations.
  { file: 'BattleScreen.tsx', ids: ['battle', 'battle.mercy'], cancels: true, traps: true },
  { file: 'FloorScreen.tsx', ids: ['floor', 'floor.merchant'], cancels: true, traps: true },
  { file: 'QuestBoardScreen.tsx', ids: ['questBoard'], cancels: true },

  // Wave 2 — the path every single run walks, plus the overlays that can
  // appear on top of any of it.
  { file: 'TownScreen.tsx', ids: ['town'], cancels: false },
  { file: 'GateSelectScreen.tsx', ids: ['gateSelect'], cancels: true },
  { file: 'CardRewardScreen.tsx', ids: ['cardReward'], cancels: false },
  { file: 'EventScreen.tsx', ids: ['event'], cancels: false },
  { file: 'VictoryScreen.tsx', ids: ['victory'], cancels: false },
  { file: 'FallenScreen.tsx', ids: ['fallen'], cancels: false },
  { file: 'StoryOverlay.tsx', ids: ['story'], cancels: false, traps: true },
  { file: 'LegendOverlay.tsx', ids: ['legend'], cancels: false, traps: true },
  { file: 'LeavingOverlay.tsx', ids: ['leaving'], cancels: true, traps: true },
  { file: 'CardDetailOverlay.tsx', ids: ['cardDetail'], cancels: true, traps: true },
];

/** Still mouse-only. This list must reach zero before the Steam build. */
const NOT_YET_CONVERTED: string[] = [
  'BreedingScreen.tsx',
  'CardCodexScreen.tsx',
  'CharacterSheetScreen.tsx',
  'ChronicleScreen.tsx',
  'CreateScreen.tsx',
  'DeckScreen.tsx',
  'GearScreen.tsx',
  'MonsterSheetScreen.tsx',
  'MultiplayerScreen.tsx',
  'SaveLoadScreen.tsx',
  'ShopScreens.tsx',
  'SmithScreen.tsx',
  'StableScreen.tsx',
  'TavernScreen.tsx',
];

describe('screen conversion coverage', () => {
  const screenFiles = readdirSync(COMPONENT_DIR).filter((f) => /(Screen|Overlay)\.tsx$/.test(f));

  it('accounts for every screen and overlay in components/', () => {
    const claimed = new Set([...CONVERTED.map((s) => s.file), ...NOT_YET_CONVERTED]);
    const unclaimed = screenFiles.filter((f) => !claimed.has(f));
    // A new screen must not be able to ship without somebody deciding what its
    // B button does. Add it to CONVERTED, or admit it to NOT_YET_CONVERTED.
    expect(unclaimed).toEqual([]);
  });

  it('does not list a converted screen as unconverted', () => {
    for (const spec of CONVERTED) expect(NOT_YET_CONVERTED).not.toContain(spec.file);
  });

  for (const spec of CONVERTED) {
    describe(spec.file, () => {
      const source = componentSource(spec.file);

      it('registers a nav scope from the shared layer', () => {
        expect(source).toMatch(/from '\.\.\/nav'/);
        expect(source).toMatch(/useNavScope\(/);
      });

      it('names every scope it registers, so focus memory works', () => {
        for (const id of spec.ids) expect(source).toContain(`id: '${id}'`);
        // Every useNavScope call carries an id — count them and compare.
        const calls = source.match(/useNavScope\(/g)?.length ?? 0;
        expect(calls).toBe(spec.ids.length);
      });

      it(spec.cancels ? 'binds B / Escape' : 'deliberately leaves B / Escape unbound', () => {
        expect(/onCancel/.test(source)).toBe(spec.cancels);
      });

      if (spec.traps) {
        it('traps focus in its modal', () => {
          expect(source).toMatch(/trap: true/);
          expect(source).toMatch(/layer: 10/);
        });
      }

      it('never auto-focuses a text field', () => {
        // `data-nav-initial` on an <input> pops the Steam on-screen keyboard
        // and strands a controller in a field it cannot type into.
        const initialOnInput = /<input[^>]*data-nav-initial/s.test(source);
        expect(initialOnInput).toBe(false);
      });
    });
  }
});

// ---------------------------------------------------------------------------
describe('screen layouts, as geometry', () => {
  it('walks the town dock left to right and back up into the cast', () => {
    // Cast grid (3 across, 2 down) above a dock row. Down out of the bottom
    // cast card must reach the dock, and Right must not skip a dock button.
    const cast = [rect(0, 0, 280, 150), rect(300, 0, 280, 150), rect(600, 0, 280, 150), rect(0, 170, 280, 150)];
    const dock = [rect(0, 400, 200, 90), rect(220, 400, 200, 90), rect(440, 400, 200, 90)];
    const all = [...cast, ...dock];
    expect(pickInDirection(cast[3], all, 'down')).toBe(4); // first dock button
    expect(pickInDirection(dock[0], all, 'right')).toBe(5);
    expect(pickInDirection(dock[1], all, 'right')).toBe(6);
    expect(pickInDirection(dock[0], all, 'up')).toBe(3); // back into the cast
  });

  it('walks the gate list past a locked gate', () => {
    // Locked gates are `disabled` and never enter the candidate list at all —
    // the cursor steps over them rather than landing on a dead entry.
    const enabled = [rect(0, 0, 600, 120), rect(0, 260, 600, 120), rect(0, 390, 600, 120)];
    expect(pickInDirection(enabled[0], enabled, 'down')).toBe(1);
    expect(pickInDirection(enabled[2], enabled, 'up')).toBe(1);
  });

  it('walks the three reward cards and drops to Take nothing', () => {
    const cards = [rect(20, 40, 300, 420), rect(340, 40, 300, 420), rect(660, 40, 300, 420)];
    const takeNothing = rect(420, 500, 140, 40);
    const all = [...cards, takeNothing];
    expect(pickInDirection(cards[0], all, 'right')).toBe(1);
    expect(pickInDirection(cards[2], all, 'left')).toBe(1);
    // Take nothing sits under the middle card but must be reachable from any.
    for (let i = 0; i < 3; i++) expect(pickInDirection(cards[i], all, 'down'), `card ${i}`).toBe(3);
  });

  it('walks a column of event choices without wrapping by surprise', () => {
    const choices = [rect(0, 0, 500, 70), rect(0, 90, 500, 70), rect(0, 180, 500, 70)];
    expect(pickInDirection(choices[0], choices, 'down')).toBe(1);
    // Off the bottom with wrap off: stay put rather than jumping to the top.
    expect(pickInDirection(choices[2], choices, 'down', { wrap: false })).toBeNull();
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
