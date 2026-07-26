import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useNavScope } from '../nav';
import { CANCEL_LABEL, stepConfirm, type ConfirmEvent, type ConfirmRequest } from './confirmAction';
import './confirm.css';

// ===========================================================================
// The destructive-action guard. One dialog, used by every screen that can
// destroy something the player cannot get back.
//
// WHY IT EXISTS (CONTROLLER_AUDIT.md C5). Release sits directly right of "To
// party". Sell sits directly right of "Equip". Delete sits directly right of
// "Load". With a mouse you aim at the one you want and the adjacency costs
// nothing. With a D-pad you TRAVERSE — and a mistimed A press one stop past
// where you meant to stop releases a monster or clears a save.
//
// WHAT IT IS NOT. It is not a per-screen dialog, and it is not a change to
// what any of those actions do. Mouse, keyboard and pad all land in the same
// handler they always did; there is now one deliberate step in front of it.
//
// THE THREE RULES:
//   1. It names the thing and the consequence. "Release Gloomshroom? …"
//   2. Cancel is where the cursor lands. Always. It is first in document order
//      AND carries data-nav-initial, so the safe half wins under either
//      resolution path.
//   3. It traps, at layer 10, and B/Escape answers it with Cancel — matching
//      MerchantMat, the Arrangement codex and the duel's concede confirm.
// ===========================================================================

/**
 * The guard, as two things a screen drops in:
 *
 *   const guard = useConfirmAction();
 *   <button onClick={() => guard.ask({ … })}>Release</button>
 *   {guard.overlay}
 *
 * `ask` is stable across renders, so it is safe in any dependency list.
 */
export interface ConfirmHandle {
  /** Put the question on screen. Never performs anything by itself. */
  ask: (request: ConfirmRequest) => void;
  /** Render this inside the screen's scope root. `null` when nothing is asked. */
  overlay: ReactNode;
  /** The question currently on screen, for a screen that must dim behind it. */
  pending: ConfirmRequest | null;
}

export function useConfirmAction(): ConfirmHandle {
  const [pending, setPending] = useState<ConfirmRequest | null>(null);
  // The ref, not the state, is what stepConfirm reads. setState is async, so
  // two confirms dispatched inside one frame would both see the same stale
  // `pending` and both fire — which is the exact bug the machine exists to
  // make impossible. The ref settles synchronously.
  const live = useRef<ConfirmRequest | null>(null);

  const send = useCallback((event: ConfirmEvent) => {
    const step = stepConfirm(live.current, event);
    live.current = step.pending;
    setPending(step.pending);
    if (step.run) step.run();
  }, []);

  const ask = useCallback((request: ConfirmRequest) => send({ type: 'ask', request }), [send]);
  const onConfirm = useCallback(() => send({ type: 'confirm' }), [send]);
  const onCancel = useCallback(() => send({ type: 'cancel' }), [send]);

  return {
    ask,
    pending,
    overlay: pending ? <ConfirmOverlay request={pending} onConfirm={onConfirm} onCancel={onCancel} /> : null,
  };
}

export function ConfirmOverlay({
  request,
  onConfirm,
  onCancel,
}: {
  request: ConfirmRequest;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useNavScope(ref, {
    id: 'confirm',
    layer: 10,
    trap: true,
    onCancel: () => {
      // B and Escape answer the question with its safe half. They never fall
      // through to the screen underneath, which on the stable would have been
      // "walk back to town" with a release still half-asked.
      onCancel();
      return true;
    },
  });

  return (
    <div
      className="confirm-overlay"
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={request.title}
      onClick={onCancel}
    >
      <div className="confirm-box" onClick={(e) => e.stopPropagation()}>
        <p className="confirm-title">{request.title}</p>
        <p className="confirm-detail">{request.detail}</p>
        <div className="btn-row confirm-actions">
          {/* Cancel FIRST, and marked initial. Both, deliberately: document
              order is the fallback when no element is marked, so the safe half
              is where the cursor lands even if the attribute is ever lost. */}
          <button className="btn confirm-safe" data-nav-initial="" onClick={onCancel}>
            {request.cancelLabel ?? CANCEL_LABEL}
          </button>
          <button className="btn danger confirm-danger" onClick={onConfirm}>
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
