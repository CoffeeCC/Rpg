// ===========================================================================
// nav/input.ts — INPUT INTERPRETATION. Pure functions, zero DOM, zero React.
//
// Everything in this file is a total function of its arguments. That is the
// whole point: the Gamepad API does not exist in jsdom (and this project's
// vitest runs in the plain `node` environment with no DOM at all), so the
// parts of controller support that are genuinely easy to get wrong — deadzone
// shaping, stick-to-direction quantisation, auto-repeat timing, button edge
// detection — live here where `controllerNav.test.ts` can hammer them with
// ordinary numbers.
//
// The impure half (rAF polling, focus, scrolling) lives in navBus.ts and does
// as little thinking as possible.
// ===========================================================================

export type NavDir = 'up' | 'down' | 'left' | 'right';

/**
 * Semantic buttons. Screens bind to these names, never to pad indices — the
 * index table below is the single place a physical button is named.
 */
export type NavButton =
  | 'confirm'
  | 'cancel'
  | 'alt'
  | 'info'
  | 'prevTab'
  | 'nextTab'
  | 'pageUp'
  | 'pageDown'
  | 'select'
  | 'start';

export type NavSource = 'pad' | 'key';

// ---------------------------------------------------------------------------
// Button map (W3C "standard" mapping — what Steam Input presents for a Deck,
// an Xbox pad, and a DualSense alike).
// ---------------------------------------------------------------------------

export const PAD_BUTTON: Readonly<Record<number, NavButton>> = {
  0: 'confirm', // A / cross
  1: 'cancel', // B / circle
  2: 'alt', // X / square
  3: 'info', // Y / triangle
  4: 'prevTab', // LB / L1
  5: 'nextTab', // RB / R1
  6: 'pageUp', // LT / L2
  7: 'pageDown', // RT / R2
  8: 'select', // View / Back / Share
  9: 'start', // Menu / Start / Options
};

export const PAD_DPAD: Readonly<Record<number, NavDir>> = {
  12: 'up',
  13: 'down',
  14: 'left',
  15: 'right',
};

/** Analog triggers report a `value` even when `pressed` lies. */
export const TRIGGER_THRESHOLD = 0.55;

// ---------------------------------------------------------------------------
// Deadzones
// ---------------------------------------------------------------------------

export interface DeadzoneConfig {
  /** Below this magnitude the stick reads as centred. Kills resting drift. */
  inner: number;
  /** At/above this magnitude the stick reads as fully deflected. */
  outer: number;
}

/**
 * Generous inner zone. Worn Deck sticks routinely rest at 0.10–0.20 on one
 * axis; menus only need a deliberate push, so we can afford to be strict.
 */
export const DEFAULT_DEADZONE: DeadzoneConfig = { inner: 0.35, outer: 0.92 };

export interface StickVector {
  x: number;
  y: number;
  /** 0 inside the deadzone, ramping to 1 at the outer edge. */
  magnitude: number;
}

/**
 * RADIAL deadzone, not per-axis. Per-axis deadzones make a diagonal push feel
 * like it snaps to the axes and let a stick resting at (0.3, 0.3) — magnitude
 * 0.42, plainly deflected — read as centred on both axes.
 *
 * The surviving range is rescaled to 0..1 so the response is continuous at the
 * deadzone edge instead of jumping from 0 to `inner`.
 */
export function applyDeadzone(x: number, y: number, cfg: DeadzoneConfig = DEFAULT_DEADZONE): StickVector {
  const raw = Math.hypot(x, y);
  if (!(raw > cfg.inner)) return { x: 0, y: 0, magnitude: 0 };
  const span = Math.max(1e-6, cfg.outer - cfg.inner);
  const magnitude = Math.min(1, (raw - cfg.inner) / span);
  const scale = magnitude / raw;
  return { x: x * scale, y: y * scale, magnitude };
}

/**
 * How much one axis must beat the other before a push counts as that
 * direction. 1.0 would make a perfect 45° push flip-flop between axes on
 * sensor noise; a little hysteresis band leaves true diagonals as "no
 * direction", which is the honest answer for a four-way menu.
 */
export const AXIS_DOMINANCE = 1.15;

/**
 * Quantise a raw stick reading to one of four directions, or null.
 * Note the sign convention: gamepad Y is +down, matching screen coordinates.
 */
export function stickDirection(x: number, y: number, cfg: DeadzoneConfig = DEFAULT_DEADZONE): NavDir | null {
  const v = applyDeadzone(x, y, cfg);
  if (v.magnitude === 0) return null;
  const ax = Math.abs(v.x);
  const ay = Math.abs(v.y);
  if (ax >= ay * AXIS_DOMINANCE) return v.x > 0 ? 'right' : 'left';
  if (ay >= ax * AXIS_DOMINANCE) return v.y > 0 ? 'down' : 'up';
  return null;
}

// ---------------------------------------------------------------------------
// Auto-repeat
// ---------------------------------------------------------------------------

export interface RepeatConfig {
  /** Hold time before the first auto-repeat. */
  delayMs: number;
  /** Gap between auto-repeats thereafter. */
  intervalMs: number;
}

/**
 * Tuned against the OS text-cursor feel most people already have in their
 * hands: a beat of "did I mean that?", then a steady scroll. Faster than a
 * typical 500/33 text repeat, because menu rows are bigger than characters.
 */
export const DEFAULT_REPEAT: RepeatConfig = { delayMs: 420, intervalMs: 130 };

export interface RepeatState {
  dir: NavDir | null;
  /** Timestamp the current direction was first seen. */
  since: number;
  /** Timestamp of the most recent fire. */
  lastFire: number;
  /** True once the initial delay has elapsed and we are in the fast phase. */
  repeating: boolean;
}

export const IDLE_REPEAT: RepeatState = { dir: null, since: 0, lastFire: 0, repeating: false };

export interface RepeatStep {
  state: RepeatState;
  /** True on the frames where the caller should actually move the cursor. */
  fire: boolean;
  /** True when this fire came from auto-repeat rather than a fresh press. */
  repeat: boolean;
}

/**
 * The whole "held stick" behaviour as one pure step function. Call it once per
 * polled frame with the direction currently being held (or null) and the
 * current time; it tells you whether this frame is a move.
 *
 * Releasing to neutral resets everything, so tapping is always exactly one
 * move per tap no matter how fast you tap.
 */
export function stepRepeat(
  state: RepeatState,
  dir: NavDir | null,
  now: number,
  cfg: RepeatConfig = DEFAULT_REPEAT,
): RepeatStep {
  if (dir === null) return { state: IDLE_REPEAT, fire: false, repeat: false };

  // A fresh press (or a change of direction) always moves immediately: input
  // latency on the first step is the thing that makes a menu feel broken.
  if (dir !== state.dir) {
    return { state: { dir, since: now, lastFire: now, repeating: false }, fire: true, repeat: false };
  }

  if (!state.repeating) {
    if (now - state.since >= cfg.delayMs) {
      return { state: { ...state, lastFire: now, repeating: true }, fire: true, repeat: true };
    }
    return { state, fire: false, repeat: false };
  }

  if (now - state.lastFire >= cfg.intervalMs) {
    return { state: { ...state, lastFire: now }, fire: true, repeat: true };
  }
  return { state, fire: false, repeat: false };
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

/** The shape we need off a `Gamepad`; declared structurally so tests can fake it. */
export interface PadLike {
  buttons: ReadonlyArray<{ pressed: boolean; value: number }>;
  axes: ReadonlyArray<number>;
}

/**
 * Flatten a pad's buttons to booleans. Analog triggers are the reason this
 * exists: some drivers never set `pressed` on index 6/7 and only move `value`.
 */
export function readPadButtons(pad: PadLike): boolean[] {
  return pad.buttons.map((b) => b.pressed || b.value >= TRIGGER_THRESHOLD);
}

/** Indices that went false → true between two samples. */
export function pressedEdges(prev: readonly boolean[], next: readonly boolean[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < next.length; i++) if (next[i] && !prev[i]) out.push(i);
  return out;
}

/** Semantic buttons newly pressed this sample, in index order. */
export function buttonEdges(prev: readonly boolean[], next: readonly boolean[]): NavButton[] {
  const out: NavButton[] = [];
  for (const i of pressedEdges(prev, next)) {
    const b = PAD_BUTTON[i];
    if (b) out.push(b);
  }
  return out;
}

/**
 * The direction the pad is asking for this frame: D-pad wins over the stick,
 * because a player holding both means the D-pad.
 */
export function padDirection(pressed: readonly boolean[], axes: readonly number[], cfg?: DeadzoneConfig): NavDir | null {
  for (const key of Object.keys(PAD_DPAD)) {
    const i = Number(key);
    if (pressed[i]) return PAD_DPAD[i];
  }
  return stickDirection(axes[0] ?? 0, axes[1] ?? 0, cfg);
}

/**
 * Right stick → free scrolling of whatever container the cursor sits in, in
 * pixels for this frame. Squared response so small pushes creep and full
 * deflection flies.
 */
export function rightStickScroll(axes: readonly number[], frameMs: number, pxPerSecond = 1400, cfg?: DeadzoneConfig): { dx: number; dy: number } {
  const v = applyDeadzone(axes[2] ?? 0, axes[3] ?? 0, cfg);
  if (v.magnitude === 0) return { dx: 0, dy: 0 };
  const gain = (v.magnitude * pxPerSecond * frameMs) / 1000;
  return { dx: v.x * gain, dy: v.y * gain };
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

/**
 * Desktop parity. Deliberately narrow: only keys with no other job in this
 * game. WASD is NOT here — FloorScreen has bound it to hero movement since
 * PLAN5 and CardCodex/Deck have text search fields; letters stay screen-local.
 */
export const KEY_DIR: Readonly<Record<string, NavDir>> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

export const KEY_BUTTON: Readonly<Record<string, NavButton>> = {
  Enter: 'confirm',
  ' ': 'confirm',
  Escape: 'cancel',
  Backspace: 'cancel',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
};
