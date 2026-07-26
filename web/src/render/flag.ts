// =========================================================================
// THE FLAG — `?r=lantern`.
//
// ENGINE_PLAN §4: "the new renderer lives behind `?r=lantern` from M1 until it
// wins. Both paths run. The DOM map is the default until the canvas map is
// BETTER, not until it is FINISHED."
//
// So this is deliberately a one-way door in the safe direction: absent, empty,
// misspelled or malformed all mean `dom`, and `dom` is byte-identical to the
// game that shipped. There is no configuration here, no persistence, and no
// storage — a query string is the whole mechanism, which means "turn it off"
// is always one reload away and can never be wedged on by a corrupt value.
//
// Parsing is split from reading so the parse is testable without a browser:
// `renderModeFrom` is pure, `renderMode` is the two lines that touch `window`.
// =========================================================================

export type RenderMode = 'dom' | 'lantern';

/** Pure: a query string in, a mode out. Anything unrecognised is `dom`. */
export function renderModeFrom(search: string): RenderMode {
  let query = search;
  const hash = query.indexOf('#');
  if (hash >= 0) query = query.slice(0, hash);
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const r = (params.get('r') ?? '').trim().toLowerCase();
  return r === 'lantern' ? 'lantern' : 'dom';
}

/** Whether the debug HUD should be drawn. `?r=lantern&debug=1`. */
export function debugFrom(search: string): boolean {
  let query = search;
  const hash = query.indexOf('#');
  if (hash >= 0) query = query.slice(0, hash);
  const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
  const d = (params.get('debug') ?? '').trim().toLowerCase();
  return d === '1' || d === 'true' || d === 'on';
}

/**
 * Read the live mode.
 *
 * Guarded for a missing `window` because the engine's tests run in node and
 * importing a component must never be the thing that throws.
 */
export function renderMode(): RenderMode {
  if (typeof window === 'undefined' || !window.location) return 'dom';
  return renderModeFrom(window.location.search);
}

export function renderDebug(): boolean {
  if (typeof window === 'undefined' || !window.location) return false;
  return debugFrom(window.location.search);
}
