// ===========================================================================
// confirmAction.ts — the state machine behind "are you sure", with no React
// and no DOM in it.
//
// It lives apart from ConfirmOverlay.tsx for one reason: the two properties
// that actually matter about a destructive-action guard are testable as pure
// functions, and this project's vitest runs in the plain `node` environment.
//
//   * cancel NEVER produces work to run
//   * confirm produces the work EXACTLY once, however many times it is pressed
//
// Both are asserted in engine/test/controllerNav.test.ts. The React wrapper
// holds the pending request in a ref (not only in state) so that a double-tap
// inside one frame still walks this machine twice with the real `pending`,
// rather than twice with a stale one.
// ===========================================================================

/**
 * One irreversible thing, described in the words the player will read.
 *
 * `title` names the specific thing — "Release Gloomshroom?", not "Are you
 * sure?" — and `detail` names the consequence. A guard that does not say what
 * is about to be destroyed is a speed bump, not a warning.
 */
export interface ConfirmRequest {
  /** The question, naming the thing. "Release Gloomshroom?" */
  title: string;
  /** The consequence, in plain words. "This cannot be undone." */
  detail: string;
  /** Verb on the destructive button. "Release", "Sell", "Delete". */
  confirmLabel: string;
  /** Verb on the safe button. Defaults to `CANCEL_LABEL`. */
  cancelLabel?: string;
  /** The irreversible act itself. Run at most once, ever. */
  perform: () => void;
}

export type ConfirmEvent =
  | { type: 'ask'; request: ConfirmRequest }
  | { type: 'confirm' }
  | { type: 'cancel' };

export interface ConfirmStep {
  /** The question that should be on screen after this event. */
  pending: ConfirmRequest | null;
  /** Work the caller must now run. `null` on every path but a real confirm. */
  run: (() => void) | null;
}

/** The safe half's default label. */
export const CANCEL_LABEL = 'Cancel';

/**
 * Advance the guard by one event.
 *
 * The rules, stated as rules because each one is a bug somebody ships:
 *
 *  - `ask` never performs anything. Opening the question is not answering it.
 *  - `ask` while a question is already up keeps the FIRST question. A D-pad
 *    auto-repeat that walks onto a second Sell button and fires must not swap
 *    the item out from under a player who is reading the name.
 *  - `cancel` closes and runs nothing, always.
 *  - `confirm` closes and returns the work — but only if a question was open.
 *    Because it clears `pending` in the same step, a second confirm against
 *    the result returns `null`, which is what makes "exactly once" true rather
 *    than merely likely.
 */
export function stepConfirm(pending: ConfirmRequest | null, event: ConfirmEvent): ConfirmStep {
  switch (event.type) {
    case 'ask':
      return { pending: pending ?? event.request, run: null };
    case 'cancel':
      return { pending: null, run: null };
    case 'confirm':
      return { pending: null, run: pending ? pending.perform : null };
  }
}
