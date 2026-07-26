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
import { CANCEL_LABEL, stepConfirm, type ConfirmRequest } from '../../components/confirmAction';

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

  // Wave 3 — the town services. Long lists, disabled rows, and two screens
  // whose focusable set mutates while the player is standing in it.
  { file: 'ShopScreens.tsx', ids: ['shopItems', 'shopGear'], cancels: true },
  { file: 'SmithScreen.tsx', ids: ['smith'], cancels: true },
  { file: 'StableScreen.tsx', ids: ['stable'], cancels: true },
  { file: 'BreedingScreen.tsx', ids: ['breeding'], cancels: true },
  { file: 'SaveLoadScreen.tsx', ids: ['saveLoad'], cancels: true },
  { file: 'TavernScreen.tsx', ids: ['tavern'], cancels: true },

  // Wave 4 — character creation and the deep-information sheets.
  { file: 'CreateScreen.tsx', ids: ['create'], cancels: true },
  { file: 'MonsterSheetScreen.tsx', ids: ['monsterSheet'], cancels: true },
  { file: 'CharacterSheetScreen.tsx', ids: ['characterSheet', 'characterSheet.codex'], cancels: true, traps: true },
  { file: 'GearScreen.tsx', ids: ['equipment'], cancels: true },

  // Wave 5 — the four with a structural problem rather than a wiring one:
  // two card grids whose only filter was a text field, a page of prose links,
  // and a screen that is four different screens wearing one name.
  { file: 'DeckScreen.tsx', ids: ['deck'], cancels: true },
  { file: 'CardCodexScreen.tsx', ids: ['cardCodex'], cancels: true },
  { file: 'ChronicleScreen.tsx', ids: ['chronicle'], cancels: true },
  { file: 'MultiplayerScreen.tsx', ids: ['multiplayer', 'duel.concede'], cancels: true, traps: true },

  // Wave 6 — the destructive-action guard (audit C5). Not a screen: the one
  // modal every screen that can destroy something borrows.
  { file: 'ConfirmOverlay.tsx', ids: ['confirm'], cancels: true, traps: true },
];

/**
 * Still mouse-only. Empty, and it must stay that way: the coverage test below
 * fails if a new screen appears in components/ without an entry in one list or
 * the other, so the only way to add a screen is to decide what its B does.
 */
const NOT_YET_CONVERTED: string[] = [];

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

      it('has a ref on the element it registers', () => {
        // A scope whose ref never lands on a DOM node registers nothing and
        // fails completely silently.
        expect(source).toMatch(/ref=\{/);
      });

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

  it('walks a shop row: price chip is not focusable, Buy is', () => {
    // `.svc-shop-row` puts the description left and the Buy button hard right.
    // Down from one Buy must reach the next Buy, not drift into another column.
    const buys = [rect(820, 20, 90, 34), rect(820, 100, 90, 34), rect(820, 180, 90, 34)];
    const back = rect(20, 300, 100, 40);
    const all = [...buys, back];
    expect(pickInDirection(buys[0], all, 'down')).toBe(1);
    expect(pickInDirection(buys[1], all, 'down')).toBe(2);
    expect(pickInDirection(buys[2], all, 'down')).toBe(3); // and out to Back
  });

  it('walks a stable card row: View, then the actions beside it', () => {
    // The portrait is out of the ring (data-nav-skip), so a card is exactly
    // View + its one or two actions, side by side.
    const card = [rect(20, 0, 70, 30), rect(100, 0, 90, 30), rect(200, 0, 80, 30)];
    const nextCard = [rect(20, 200, 70, 30), rect(100, 200, 90, 30)];
    const all = [...card, ...nextCard];
    expect(pickInDirection(card[0], all, 'right')).toBe(1);
    expect(pickInDirection(card[1], all, 'right')).toBe(2);
    expect(pickInDirection(card[0], all, 'down')).toBe(3); // same column, next card
  });

  it('walks the save/load grid without falling off a crystal', () => {
    // Three crystals across, three buttons each. Right from Delete on slot 1
    // must reach Save on slot 2 rather than stopping at the crystal's edge.
    const crystal = (x: number) => [rect(x, 0, 60, 30), rect(x + 70, 0, 60, 30), rect(x + 140, 0, 70, 30)];
    const all = [...crystal(0), ...crystal(240), ...crystal(480)];
    expect(pickInDirection(all[2], all, 'right')).toBe(3);
    expect(pickInDirection(all[3], all, 'left')).toBe(2);
    expect(pickInDirection(all[5], all, 'right')).toBe(6);
  });

  it('keeps glossary terms out of the pad ring but inside Tab order', () => {
    // KeywordText spans carry tabIndex 0 AND data-nav-skip. The controller
    // must not stop on forty proper nouns in a paragraph; Tab and a screen
    // reader still must reach every one of them.
    const source = componentSource('KeywordText.tsx');
    expect(source).toMatch(/tabIndex=\{0\}/);
    expect(source).toMatch(/data-nav-skip=\{navigable \? undefined : ''\}/);
    // The card inspector opts back in — a card's rules text IS the content.
    expect(componentSource('CardDetailOverlay.tsx')).toMatch(/<KeywordText[^>]*navigable/);
  });

  it('keeps chronicle prose links out of the pad ring', () => {
    // A full timeline is 100+ inline entity buttons. Same demotion as the
    // glossary terms — and nothing is lost, because every entity these link to
    // also has its own row under the Figures / Beasts / Relics tabs.
    expect(componentSource('ChronicleText.tsx')).toMatch(/data-nav-skip=""/);
  });

  it('binds the shoulders on the three screens that need lateral movement', () => {
    // CONTROLLER.md reserves LB/RB for movement between sections. Chronicle
    // turns the page, the codex jumps a section of a 200-cell gallery, and the
    // deck cycles the type filter.
    for (const [file, marker] of [
      ['ChronicleScreen.tsx', 'stepTab'],
      ['CardCodexScreen.tsx', 'jumpSection'],
      ['DeckScreen.tsx', 'cycleType'],
    ] as const) {
      const source = componentSource(file);
      expect(source, file).toMatch(/'prevTab'/);
      expect(source, file).toMatch(/'nextTab'/);
      expect(source, file).toContain(marker);
    }
  });

  it('gives every text-filtered screen a way out of its own search box', () => {
    // Arrows move the caret and Space types a space while focus is in a text
    // field; only Escape gets through. A screen with a search box that does
    // not handle it strands the cursor there.
    for (const file of ['DeckScreen.tsx', 'CardCodexScreen.tsx', 'CreateScreen.tsx']) {
      expect(componentSource(file), file).toMatch(/HTMLInputElement/);
    }
  });

  it('lets a focused scroll box scroll itself, but never reveal itself', () => {
    // The Chronicle's page is one focus stop wrapping 3000px of prose. Bulk
    // scrolling has to move the focused element itself; `revealElement` must
    // NOT, or "scroll this into view" becomes a no-op inside its own box and
    // never reaches the ancestors that actually needed moving.
    const nav = readFileSync(fileURLToPath(new URL('../../nav/navBus.ts', import.meta.url)), 'utf8');
    const focus = readFileSync(fileURLToPath(new URL('../../nav/focus.ts', import.meta.url)), 'utf8');
    expect(focus).toMatch(/export function bulkScrollTarget/);
    // pageScroll and the right-stick branch use it; revealElement does not.
    expect(nav.match(/bulkScrollTarget\(/g)?.length).toBe(2); // pageScroll + right stick
    const reveal = focus.slice(focus.indexOf('export function revealElement'));
    expect(reveal).not.toMatch(/bulkScrollTarget/);
  });

  it('gives ItemHover a focus path, not only a cursor one', () => {
    // Rarity, affixes, set thresholds and the equip-compare deltas lived in a
    // window bound to onMouseEnter and positioned from e.clientX. There is no
    // clientX on a Steam Deck.
    const source = componentSource('ItemHover.tsx');
    expect(source).toMatch(/onFocus=\{anchor\}/);
    expect(source).toMatch(/onBlur=\{release\}/);
    expect(source).toMatch(/getBoundingClientRect\(\)/);
  });

  it('walks the depth chip row', () => {
    // Six chips in a row, the last two sealed (disabled → not candidates).
    const chips = [0, 1, 2, 3].map((i) => rect(i * 60, 0, 50, 34));
    for (let i = 0; i < chips.length - 1; i++) expect(pickInDirection(chips[i], chips, 'right'), `chip ${i}`).toBe(i + 1);
    expect(pickInDirection(chips[3], chips, 'right', { wrap: true })).toBe(0);
  });
});

// ===========================================================================
// The destructive-action guard (CONTROLLER_AUDIT.md C5).
//
// The problem is adjacency plus traversal. Release is directly right of "To
// party"; Sell is directly right of "Equip"; Delete is directly right of
// "Load". A mouse AIMS, so the neighbour costs nothing. A D-pad TRAVERSES, so
// one over-travelled press lands on the irreversible one — and the press that
// was going to confirm the safe thing confirms the destructive thing instead.
//
// Two halves are tested two ways, because they fail two ways:
//
//   * BEHAVIOUR — cancel must never run the action and confirm must run it
//     exactly once. `stepConfirm` is pure precisely so this is assertable in
//     the node environment, with no DOM and no React.
//   * WIRING — the dialog traps, opens on Cancel, and no screen still has a
//     bare destructive dispatch hanging off an onClick. Source-level, for the
//     reasons argued above the per-screen block.
// ===========================================================================

describe('destructive-action guard: behaviour', () => {
  const req = (perform: () => void, title = 'Release Gloomshroom?'): ConfirmRequest => ({
    title,
    detail: 'This cannot be undone.',
    confirmLabel: 'Release',
    perform,
  });

  it('asking never performs anything', () => {
    let ran = 0;
    const step = stepConfirm(null, { type: 'ask', request: req(() => ran++) });
    expect(step.run).toBeNull();
    expect(ran).toBe(0);
    expect(step.pending?.title).toBe('Release Gloomshroom?');
  });

  it('leaves state untouched on cancel', () => {
    let ran = 0;
    const asked = stepConfirm(null, { type: 'ask', request: req(() => ran++) });
    const cancelled = stepConfirm(asked.pending, { type: 'cancel' });
    expect(cancelled.run).toBeNull();
    expect(cancelled.pending).toBeNull();
    expect(ran).toBe(0);
  });

  it('performs the action exactly once on confirm', () => {
    let ran = 0;
    const asked = stepConfirm(null, { type: 'ask', request: req(() => ran++) });
    const confirmed = stepConfirm(asked.pending, { type: 'confirm' });
    expect(confirmed.run).not.toBeNull();
    confirmed.run!();
    expect(ran).toBe(1);
    expect(confirmed.pending).toBeNull();
  });

  it('a second confirm against the closed dialog does nothing', () => {
    // The bounced A press, or a pad whose button chatters. The dialog is gone
    // by then, so there is nothing left to perform.
    let ran = 0;
    const asked = stepConfirm(null, { type: 'ask', request: req(() => ran++) });
    const first = stepConfirm(asked.pending, { type: 'confirm' });
    first.run?.();
    const second = stepConfirm(first.pending, { type: 'confirm' });
    expect(second.run).toBeNull();
    second.run?.();
    expect(ran).toBe(1);
  });

  it('confirming with nothing asked performs nothing at all', () => {
    expect(stepConfirm(null, { type: 'confirm' }).run).toBeNull();
  });

  it('keeps the first question when a second ask arrives on top of it', () => {
    // Auto-repeat walking onto the next row's Sell and firing must not swap
    // the item out from under a player who is reading the name they are about
    // to destroy.
    let a = 0;
    let b = 0;
    const first = stepConfirm(null, { type: 'ask', request: req(() => a++, 'Sell Dawnbrand?') });
    const second = stepConfirm(first.pending, { type: 'ask', request: req(() => b++, 'Sell Ashcloak?') });
    expect(second.pending?.title).toBe('Sell Dawnbrand?');
    stepConfirm(second.pending, { type: 'confirm' }).run!();
    expect(a).toBe(1);
    expect(b).toBe(0);
  });

  it('cancel and confirm are the only two answers, and they are exclusive', () => {
    // Whatever the event, `run` is non-null on exactly one path: a confirm
    // with a question open. Anything else that performs work is a bug.
    let ran = 0;
    const open = stepConfirm(null, { type: 'ask', request: req(() => ran++) }).pending;
    const outcomes = [
      stepConfirm(open, { type: 'ask', request: req(() => ran++) }),
      stepConfirm(open, { type: 'cancel' }),
      stepConfirm(null, { type: 'cancel' }),
      stepConfirm(null, { type: 'confirm' }),
      stepConfirm(open, { type: 'confirm' }),
    ];
    expect(outcomes.filter((o) => o.run !== null).length).toBe(1);
    // And every path closes the dialog except the second ask, which holds it.
    expect(outcomes.map((o) => o.pending !== null)).toEqual([true, false, false, false, false]);
  });
});

describe('destructive-action guard: wiring', () => {
  const overlay = componentSource('ConfirmOverlay.tsx');

  it('traps focus at the overlay layer, like every other modal', () => {
    expect(overlay).toMatch(/trap: true/);
    expect(overlay).toMatch(/layer: 10/);
    expect(overlay).toMatch(/id: 'confirm'/);
  });

  it('answers B / Escape with the safe half', () => {
    // onCancel is bound, and what it calls is the cancel path — never confirm.
    const onCancel = overlay.slice(overlay.indexOf('onCancel: () =>'), overlay.indexOf('return true'));
    expect(onCancel).toContain('onCancel()');
    expect(onCancel).not.toContain('onConfirm');
  });

  it('opens on Cancel — marked initial AND first in document order', () => {
    // Both, deliberately. `data-nav-initial` is what the nav layer honours;
    // document order is its fallback when nothing is marked, so the safe half
    // wins under either resolution path.
    const safe = overlay.indexOf('confirm-safe');
    const danger = overlay.indexOf('confirm-danger');
    expect(safe).toBeGreaterThan(-1);
    expect(danger).toBeGreaterThan(-1);
    expect(safe).toBeLessThan(danger);
    const safeButton = overlay.slice(safe, danger);
    expect(safeButton).toContain('data-nav-initial=""');
    // ...and the destructive half must NOT be the one the cursor lands on.
    expect(overlay.slice(danger)).not.toContain('data-nav-initial');
  });

  it('is a dialog to a screen reader, not a div', () => {
    expect(overlay).toMatch(/role="dialog"/);
    expect(overlay).toMatch(/aria-modal="true"/);
  });

  it('names its safe half something, always', () => {
    expect(CANCEL_LABEL).toBeTruthy();
    expect(overlay).toContain('CANCEL_LABEL');
  });

  /**
   * Every irreversible action in the game, and the token that would prove it
   * is still wired straight to a click. `bare` patterns must NOT match: the
   * dispatch has to sit inside a `perform:`, behind the question.
   */
  const GUARDED: { file: string; what: string; bare: RegExp[] }[] = [
    { file: 'StableScreen.tsx', what: 'Release', bare: [/onClick=\{\(\) => dispatch\(\{ type: 'RELEASE'/] },
    { file: 'GearScreen.tsx', what: 'Sell', bare: [/onClick=\{\(\) => dispatch\(\{ type: 'SELL_GEAR'/] },
    { file: 'ShopScreens.tsx', what: 'Sell', bare: [/onClick=\{\(\) => dispatch\(\{ type: 'SELL_GEAR'/] },
    { file: 'SaveLoadScreen.tsx', what: 'Delete / overwrite', bare: [/onClick=\{\(\) => handleDelete\(/, /onClick=\{\(\) => handleSave\(/] },
    { file: 'BreedingScreen.tsx', what: 'Breed (both parents are consumed)', bare: [/onClick=\{doBreed\}/] },
    { file: 'SmithScreen.tsx', what: 'Recast (melts a Legendary)', bare: [/dispatch\(\{ type: 'RECAST_SET_PIECE'[\s\S]{0,40}\}\);\s*\}\}/] },
    { file: 'VictoryScreen.tsx', what: 'Begin the next telling', bare: [/onClick=\{\(\) => dispatch\(\{ type: 'RESTART'/] },
    { file: 'FloorScreen.tsx', what: 'Witchwick home (burns the wick, drops the run)', bare: [/onClick=\{\(\) => dispatch\(\{ type: 'LEAVE_GATE'/] },
  ];

  for (const spec of GUARDED) {
    describe(`${spec.file} — ${spec.what}`, () => {
      const source = componentSource(spec.file);

      it('routes through the shared guard rather than its own dialog', () => {
        expect(source).toMatch(/useConfirmAction/);
        expect(source).toContain("from './ConfirmOverlay'");
        // One dialog for the whole game: a screen must not grow its own.
        expect(source).not.toMatch(/id: 'confirm'/);
      });

      it('actually renders the overlay it asks with', () => {
        // `ask` without `{guard.overlay}` in the tree is a button that now
        // does nothing at all — the worst possible failure of this change.
        expect(source).toContain('guard.ask({');
        expect(source).toContain('{guard.overlay}');
      });

      it('has no bare path to the irreversible action left', () => {
        for (const pattern of spec.bare) expect(source, String(pattern)).not.toMatch(pattern);
      });

      it('names the thing and the consequence in every question it asks', () => {
        const asks = source.match(/guard\.ask\(\{/g)?.length ?? 0;
        expect(asks).toBeGreaterThan(0);
        for (const field of ['title:', 'detail:', 'confirmLabel:', 'perform:']) {
          expect(source.match(new RegExp(field, 'g'))?.length ?? 0, field).toBe(asks);
        }
        // "Are you sure?" is not a warning. Every detail states the loss.
        const details = [...source.matchAll(/detail: `([^`]*)`/g)].map((m) => m[1]);
        expect(details.length).toBe(asks);
        for (const d of details) expect(d, d).toMatch(/cannot be (undone|recovered)/);
      });
    });
  }
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
