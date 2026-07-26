// ===========================================================================
// nav/navBus.ts — ONE poller, ONE keyboard listener, ONE focus cursor.
//
// The thing this file exists to prevent: 35 components each running their own
// `requestAnimationFrame` loop calling `navigator.getGamepads()`. There is
// exactly one loop in the app and it lives here. Screens register a *scope*
// (see useNavScope) and the topmost registered scope receives input.
//
// Idle behaviour: with no pad connected the rAF loop does not run at all — a
// 1s interval watches for a pad instead, and hands over to rAF when one shows
// up. Desktop mouse players pay nothing.
// ===========================================================================

import {
  DEFAULT_REPEAT,
  IDLE_REPEAT,
  KEY_BUTTON,
  KEY_DIR,
  buttonEdges,
  padDirection,
  readPadButtons,
  rightStickScroll,
  stepRepeat,
  type NavButton,
  type NavDir,
  type NavSource,
  type RepeatState,
} from './input';
import { pickInDirection, type NavRect } from './geometry';
import {
  bulkScrollTarget,
  focusElement,
  focusKeyOf,
  initialFocusTarget,
  isInRoots,
  isTextEntry,
  navCandidates,
  rectOf,
  scrollParent,
  activateElement,
} from './focus';

// ---------------------------------------------------------------------------
// Scopes
// ---------------------------------------------------------------------------

export interface NavEventMeta {
  source: NavSource;
  /** True when produced by a held direction auto-repeating. */
  repeat: boolean;
  /** The focused element inside this scope, if any. */
  target: HTMLElement | null;
}

/**
 * Returning `true` from a handler CONSUMES the event: the default behaviour
 * (moving focus, clicking the focused control) is skipped. This is the one
 * mechanism screens need in order to express things like combat's "left/right
 * cycles the aimed enemy instead of moving the cursor".
 */
export type NavHandled = boolean | void;

export interface NavScopeHandlers {
  onDirection?(dir: NavDir, meta: NavEventMeta): NavHandled;
  onButton?(button: NavButton, meta: NavEventMeta): NavHandled;
  /** Convenience for the near-universal case: B / Escape. */
  onCancel?(): NavHandled;
}

export interface NavScope {
  /** Stable id enables "put me back where I was" across remounts. */
  id?: string;
  /** Higher wins. 0 = a screen, 10 = an overlay. Ties break on registration order. */
  layer: number;
  /** Regions to search for controls. Usually one: the screen's root element. */
  roots: HTMLElement[];
  /** Keep focus inside these roots (modals). */
  trap: boolean;
  /** Wrap past the end of a row/column. */
  wrap: boolean;
  /** Focus something sensible when this scope becomes top. */
  autoFocus: boolean;
  handlers: NavScopeHandlers;
  /** Set by the bus; monotonically increasing. */
  seq: number;
}

const scopes: NavScope[] = [];
let seqCounter = 0;

/** Last focus position per scope id, so returning to a screen returns the cursor. */
const focusMemory = new Map<string, string>();

function topScope(): NavScope | null {
  let best: NavScope | null = null;
  for (const s of scopes) {
    if (!best || s.layer > best.layer || (s.layer === best.layer && s.seq > best.seq)) best = s;
  }
  return best;
}

export function registerScope(scope: Omit<NavScope, 'seq'>): () => void {
  const full: NavScope = { ...scope, seq: ++seqCounter };
  scopes.push(full);
  ensureDriver();
  // Let the DOM settle (refs are attached but children may still be mounting).
  queueMicrotask(() => {
    if (scopes.includes(full) && topScope() === full) enterScope(full);
  });
  return () => {
    const i = scopes.indexOf(full);
    if (i >= 0) {
      rememberFocus(full);
      scopes.splice(i, 1);
    }
    ensureDriver();
    // Whatever is on top now takes the cursor back.
    queueMicrotask(() => {
      const next = topScope();
      if (next) enterScope(next);
    });
  };
}

/** Handlers change every render; swap them in place instead of re-registering. */
export function updateScopeHandlers(target: NavScope | null, handlers: NavScopeHandlers): void {
  if (target) target.handlers = handlers;
}

export function findScope(predicate: (s: NavScope) => boolean): NavScope | null {
  return scopes.find(predicate) ?? null;
}

function rememberFocus(scope: NavScope): void {
  if (!scope.id) return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !isInRoots(scope.roots, active)) return;
  const key = focusKeyOf(active);
  if (key) focusMemory.set(scope.id, key);
}

/** Give a scope the cursor: restore where we were, else pick a sane start. */
function enterScope(scope: NavScope): void {
  if (!scope.autoFocus) return;
  const active = document.activeElement as HTMLElement | null;
  if (active && active !== document.body && isInRoots(scope.roots, active)) return;
  const candidates = navCandidates(scope.roots);
  if (candidates.length === 0) return;
  const remembered = scope.id ? focusMemory.get(scope.id) : undefined;
  const restored = remembered ? candidates.find((el) => focusKeyOf(el) === remembered) : undefined;
  const target = restored ?? initialFocusTarget(candidates);
  if (target) focusElement(target, { limit: scope.roots[0] });
}

/** Public: re-assert focus for the top scope (after a list re-renders, say). */
export function refocusTopScope(): void {
  const scope = topScope();
  if (scope) enterScope(scope);
}

// ---------------------------------------------------------------------------
// Input mode — the reason a controller cursor is always visible
// ---------------------------------------------------------------------------

export type InputMode = 'pointer' | 'key' | 'pad';

let inputMode: InputMode = 'pointer';
const modeListeners = new Set<(m: InputMode) => void>();

export function getInputMode(): InputMode {
  return inputMode;
}

export function onInputModeChange(fn: (m: InputMode) => void): () => void {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}

/**
 * `:focus-visible` is a browser heuristic, and it does NOT reliably light up
 * for a programmatic `.focus()` — which is exactly how every pad-driven focus
 * move happens. So we publish the current input mode on <html> and nav.css
 * styles plain `:focus` while that mode is 'pad' or 'key'. A controller user
 * can never lose the cursor; a mouse user never sees a ring they didn't ask
 * for.
 */
function setInputMode(mode: InputMode): void {
  if (inputMode === mode) return;
  inputMode = mode;
  if (typeof document !== 'undefined') document.documentElement.dataset.navInput = mode;
  for (const fn of modeListeners) fn(mode);
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------

function activeIn(scope: NavScope): HTMLElement | null {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body) return null;
  return isInRoots(scope.roots, active) ? active : null;
}

// ---------------------------------------------------------------------------
// Geometry snapshot — an animation must not be able to re-route a keypress
// ---------------------------------------------------------------------------

/**
 * Paul, on the Steam Deck: "when navigating through the cards with a d-pad you
 * can't navigate fast because the animation has to finish, and it ends up
 * going back to the previous card if you go too quickly left or right."
 *
 * That is a geometry bug, not a pacing one. `getBoundingClientRect()` reports
 * where a thing is being DRAWN, which for anything mid-transition is a lie
 * about where it is. The hand fan lifts the focused card 64px and scales it
 * 1.16 over 280ms (battle.css), and the pad repeats every 130ms — so at any
 * realistic speed the card you just left is still enormous and still
 * overlapping the one you moved onto. Ask "what is to the right of here?" in
 * the middle of that and the honest geometric answer is "the card you came
 * from", which is exactly what the player saw.
 *
 * So: while a burst of navigation is in flight, everyone gets measured ONCE
 * and the whole burst is resolved against that snapshot. The frozen geometry
 * is the layout the player is actually looking at — the fan's resting
 * positions — rather than a smear of half-finished transforms. The moment
 * input goes quiet for longer than a transition takes, the snapshot expires
 * and the next press measures fresh.
 *
 * Anything that genuinely MOVES the candidates invalidates it: a changed
 * candidate list (a card was played, a list re-rendered), or a scroll. Scroll
 * is the subtle one — `focusElement` scrolls the new target into view, which
 * really does change every rect in the container, so we record the scroller's
 * offsets with the snapshot and translate cached rects by the delta instead of
 * throwing the snapshot away. Freezing through a scroll is the point: a long
 * menu scrolling under a held stick has exactly the same problem the card fan
 * has.
 */
const NAV_SETTLE_MS = 400;

interface RectSnapshot {
  els: HTMLElement[];
  rects: NavRect[];
  /** Last time this snapshot was USED, so a continuous hold keeps it alive. */
  at: number;
  scroller: HTMLElement | null;
  sx: number;
  sy: number;
}

let snapshot: RectSnapshot | null = null;

function sameElements(a: readonly HTMLElement[], b: readonly HTMLElement[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Rects for `candidates`, frozen for the duration of a navigation burst. */
function snapshotRects(candidates: HTMLElement[], scope: NavScope, now: number): NavRect[] {
  const scroller = scrollParent(candidates[0], scope.roots[0]) ?? scope.roots[0] ?? null;
  if (snapshot && now - snapshot.at <= NAV_SETTLE_MS && sameElements(snapshot.els, candidates)) {
    // Same controls, still mid-burst: reuse, shifted by however far the
    // container has scrolled since (focusElement may have scrolled it itself).
    const dx = (scroller?.scrollLeft ?? 0) - snapshot.sx;
    const dy = (scroller?.scrollTop ?? 0) - snapshot.sy;
    snapshot.at = now;
    if (dx === 0 && dy === 0) return snapshot.rects;
    return snapshot.rects.map((r) => ({
      left: r.left - dx,
      right: r.right - dx,
      top: r.top - dy,
      bottom: r.bottom - dy,
    }));
  }
  const rects = candidates.map(rectOf);
  snapshot = {
    els: candidates,
    rects,
    at: now,
    scroller,
    sx: scroller?.scrollLeft ?? 0,
    sy: scroller?.scrollTop ?? 0,
  };
  return rects;
}

function moveFocus(scope: NavScope, dir: NavDir): boolean {
  const candidates = navCandidates(scope.roots);
  if (candidates.length === 0) return false;
  const current = activeIn(scope);
  if (!current) {
    const target = initialFocusTarget(candidates);
    if (target) focusElement(target, { limit: scope.roots[0] });
    return !!target;
  }
  const rects = snapshotRects(candidates, scope, performance.now());
  const fromIndex = candidates.indexOf(current);
  // The CURRENT element is the one being animated, so its cached rect is the
  // one that matters most — fall back to a live read only if it is not in the
  // candidate list at all.
  const from = fromIndex >= 0 ? rects[fromIndex] : rectOf(current);
  const hit = pickInDirection(from, rects, dir, { wrap: scope.wrap });
  if (hit === null) return false;
  focusElement(candidates[hit], { limit: scope.roots[0] });
  return true;
}

function dispatchDirection(dir: NavDir, source: NavSource, repeat: boolean): boolean {
  const scope = topScope();
  if (!scope) return false;
  const meta: NavEventMeta = { source, repeat, target: activeIn(scope) };
  if (scope.handlers.onDirection?.(dir, meta) === true) return true;
  return moveFocus(scope, dir);
}

function dispatchButton(button: NavButton, source: NavSource): boolean {
  const scope = topScope();
  if (!scope) return false;
  const target = activeIn(scope);
  const meta: NavEventMeta = { source, repeat: false, target };

  if (scope.handlers.onButton?.(button, meta) === true) return true;

  if (button === 'cancel') {
    return scope.handlers.onCancel?.() === true || scope.trap;
  }

  if (button === 'confirm') {
    if (!target) return false;
    return activateElement(target, source);
  }

  if (button === 'pageUp' || button === 'pageDown') {
    return pageScroll(scope, button === 'pageUp' ? -1 : 1);
  }

  return false;
}

function pageScroll(scope: NavScope, sign: 1 | -1): boolean {
  const target = activeIn(scope) ?? scope.roots[0];
  if (!target) return false;
  const container = bulkScrollTarget(target) ?? scope.roots[0];
  if (!container) return false;
  container.scrollBy({ top: sign * container.clientHeight * 0.8, behavior: 'smooth' });
  return true;
}

// ---------------------------------------------------------------------------
// Keyboard
// ---------------------------------------------------------------------------

function onKeyDown(e: KeyboardEvent): void {
  if (e.defaultPrevented) return;
  if (e.ctrlKey || e.altKey || e.metaKey) return;

  // Tab inside a modal cycles within it instead of escaping to the screen
  // behind. Everywhere else Tab is left entirely to the browser.
  if (e.key === 'Tab') {
    const scope = topScope();
    if (scope?.trap) {
      const candidates = navCandidates(scope.roots);
      if (candidates.length === 0) return;
      const current = activeIn(scope);
      const at = current ? candidates.indexOf(current) : -1;
      const step = e.shiftKey ? -1 : 1;
      const next = candidates[(at + step + candidates.length) % candidates.length];
      focusElement(next, { limit: scope.roots[0] });
      e.preventDefault();
    }
    return;
  }

  const active = document.activeElement;
  // Never steal keys from a text field: arrows move the caret, Space types.
  if (isTextEntry(active) && e.key !== 'Escape') return;

  const dir = KEY_DIR[e.key];
  if (dir) {
    setInputMode('key');
    if (dispatchDirection(dir, 'key', e.repeat)) e.preventDefault();
    return;
  }

  const button = KEY_BUTTON[e.key];
  if (!button) return;
  // Space on a focused <button> is the browser's job; Backspace only cancels
  // when it would otherwise do nothing.
  setInputMode('key');
  if (dispatchButton(button, 'key')) e.preventDefault();
}

function onPointerDown(): void {
  setInputMode('pointer');
}

/**
 * Focus trap, the belt to Tab-cycling's braces. Anything that drags focus out
 * of a modal — a stray autofocus, a click on the screen behind, the browser
 * resetting to <body> when the focused node unmounts — gets pulled straight
 * back. Without this, B/Escape would close the wrong thing.
 */
function onFocusIn(e: FocusEvent): void {
  const scope = topScope();
  if (!scope?.trap) return;
  const target = e.target as Node | null;
  if (isInRoots(scope.roots, target)) return;
  const candidates = navCandidates(scope.roots);
  const back = initialFocusTarget(candidates);
  if (back) focusElement(back, { limit: scope.roots[0] });
}

// ---------------------------------------------------------------------------
// Gamepad polling — the single loop
// ---------------------------------------------------------------------------

let rafId = 0;
let idleTimer: ReturnType<typeof setInterval> | 0 = 0;
let listenersBound = false;
let prevButtons: boolean[] = [];
let repeatState: RepeatState = IDLE_REPEAT;
let lastFrame = 0;

function anyPad(): Gamepad | null {
  const pads = navigator.getGamepads?.() ?? [];
  for (const p of pads) if (p && p.connected) return p;
  return null;
}

function poll(now: number): void {
  rafId = requestAnimationFrame(poll);
  const pad = anyPad();
  if (!pad) return;
  const frameMs = lastFrame ? Math.min(64, now - lastFrame) : 16;
  lastFrame = now;

  const pressed = readPadButtons(pad);
  const edges = buttonEdges(prevButtons, pressed);
  const dir = padDirection(pressed, pad.axes);
  const step = stepRepeat(repeatState, dir, now, DEFAULT_REPEAT);
  repeatState = step.state;
  prevButtons = pressed;

  if (edges.length === 0 && !step.fire) {
    // Right stick free-scroll is the only thing that runs without an edge.
    const scroll = rightStickScroll(pad.axes, frameMs);
    if (scroll.dx !== 0 || scroll.dy !== 0) {
      setInputMode('pad');
      const scope = topScope();
      const anchor = scope ? (activeIn(scope) ?? scope.roots[0]) : null;
      const container = anchor ? bulkScrollTarget(anchor) : null;
      container?.scrollBy({ left: scroll.dx, top: scroll.dy });
    }
    return;
  }

  setInputMode('pad');
  if (step.fire && dir) dispatchDirection(dir, 'pad', step.repeat);
  for (const button of edges) dispatchButton(button, 'pad');
}

function startPolling(): void {
  if (rafId) return;
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = 0;
  }
  prevButtons = [];
  repeatState = IDLE_REPEAT;
  lastFrame = 0;
  rafId = requestAnimationFrame(poll);
}

function stopPolling(): void {
  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;
}

function startIdleWatch(): void {
  if (idleTimer || rafId) return;
  // `gamepadconnected` only fires after the player touches the pad, and some
  // browsers report an already-present pad with no event at all. Cheap poll.
  idleTimer = setInterval(() => {
    if (anyPad()) startPolling();
  }, 1000);
}

/**
 * Bind the global listeners exactly once, on first import of the nav layer.
 * Input-mode tracking is deliberately NOT gated on a scope existing, so the
 * focus ring behaves correctly on unconverted screens too (Tab still works
 * everywhere, and it should still be visible when it does).
 */
function ensureListeners(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('focusin', onFocusIn);
  window.addEventListener('gamepadconnected', startPolling);
  window.addEventListener('gamepaddisconnected', () => {
    if (!anyPad()) {
      stopPolling();
      startIdleWatch();
    }
  });
  document.documentElement.dataset.navInput = inputMode;
  if (anyPad()) startPolling();
  else startIdleWatch();
}

function ensureDriver(): void {
  ensureListeners();
  if (!rafId && !idleTimer) startIdleWatch();
}

if (typeof window !== 'undefined') ensureListeners();
