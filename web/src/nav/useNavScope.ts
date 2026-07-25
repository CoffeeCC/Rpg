// ===========================================================================
// nav/useNavScope.ts — the one hook a screen needs.
//
//   const rootRef = useRef<HTMLDivElement>(null);
//   useNavScope(rootRef, { id: 'shop', onCancel: () => dispatch(back) });
//   return <div className="panel" ref={rootRef}> ... </div>;
//
// That is a whole conversion for a screen made of <button>s. Everything else
// in this file is for the screens that need more.
// ===========================================================================

import { useEffect, useRef, useState, type RefObject } from 'react';
import {
  getInputMode,
  onInputModeChange,
  refocusTopScope,
  registerScope,
  type InputMode,
  type NavEventMeta,
  type NavHandled,
  type NavScope,
  type NavScopeHandlers,
} from './navBus';
import type { NavButton, NavDir } from './input';

export interface NavScopeOptions extends NavScopeHandlers {
  /**
   * Stable id. Two things key off it: focus memory (returning to this screen
   * restores the cursor) and nothing else. Omit it and the screen simply
   * starts at its first control every time.
   */
  id?: string;
  /** 0 for a screen, 10 for an overlay/modal. Highest layer gets the input. */
  layer?: number;
  /** Modal: keep focus inside, and let B/Escape close it rather than fall through. */
  trap?: boolean;
  /** Wrap around the ends of a row/column. Default true; grids may want false. */
  wrap?: boolean;
  /** Move focus here when the scope opens. Default true. */
  autoFocus?: boolean;
  /** Additional regions to treat as part of this scope (e.g. a portalled panel). */
  extraRoots?: ReadonlyArray<RefObject<HTMLElement | null> | HTMLElement | null>;
  /** Turn the whole scope off without unmounting the screen. */
  enabled?: boolean;
}

function resolveRoot(r: RefObject<HTMLElement | null> | HTMLElement | null | undefined): HTMLElement | null {
  if (!r) return null;
  return 'current' in r ? r.current : r;
}

/**
 * Register `ref`'s subtree as the navigable region for as long as this
 * component is mounted.
 *
 * Handlers are re-read through a ref on every event, so passing fresh inline
 * closures each render is free — the scope itself is registered once. That
 * matters in combat, where every callback changes identity on every FX frame.
 */
export function useNavScope(ref: RefObject<HTMLElement | null>, options: NavScopeOptions = {}): void {
  const {
    id,
    layer = 0,
    trap = false,
    wrap = true,
    autoFocus = true,
    enabled = true,
    extraRoots,
    onDirection,
    onButton,
    onCancel,
  } = options;

  const handlers = useRef<NavScopeHandlers>({});
  handlers.current = { onDirection, onButton, onCancel };

  const extraKey = (extraRoots ?? []).length;

  useEffect(() => {
    if (!enabled) return;
    const root = ref.current;
    if (!root) return;
    const roots = [root, ...(extraRoots ?? []).map(resolveRoot).filter((el): el is HTMLElement => !!el)];

    const scope: Omit<NavScope, 'seq'> = {
      id,
      layer,
      roots,
      trap,
      wrap,
      autoFocus,
      // Indirection so the live closures are used, not the ones from mount.
      handlers: {
        onDirection: (dir: NavDir, meta: NavEventMeta): NavHandled => handlers.current.onDirection?.(dir, meta),
        onButton: (button: NavButton, meta: NavEventMeta): NavHandled => handlers.current.onButton?.(button, meta),
        onCancel: (): NavHandled => handlers.current.onCancel?.(),
      },
    };
    return registerScope(scope);
    // `ref.current` is stable for the component's life; the rest are config.
    // `extraRoots` is deliberately tracked by length only — callers build the
    // array inline, so depending on its identity would re-register the scope
    // (and re-run auto-focus) on every single render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, id, layer, trap, wrap, autoFocus, enabled, extraKey]);
}

/**
 * Current input device, for the rare component that must render differently
 * for a pad (BattleScreen draws its aim line to the selected target when there
 * is no mouse position to draw it to).
 */
export function useNavInputMode(): InputMode {
  const [mode, setMode] = useState<InputMode>(getInputMode);
  useEffect(() => onInputModeChange(setMode), []);
  return mode;
}

/**
 * Put the cursor back on something real. Call it after a re-render that can
 * destroy the focused element — a list that reloads, or (in combat) the hand
 * fan remounting on a new turn, which would otherwise strand a pad player with
 * focus on <body> and no visible cursor.
 */
export function useRefocusOn(deps: ReadonlyArray<unknown>, active = true): void {
  useEffect(() => {
    if (!active) return;
    if (getInputMode() === 'pointer') return;
    const t = setTimeout(refocusTopScope, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- caller owns the dep list
  }, deps);
}
