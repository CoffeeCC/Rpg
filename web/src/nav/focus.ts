// ===========================================================================
// nav/focus.ts — the DOM half. Turns elements into rects, moves real focus.
//
// Design note, stated once so nobody has to reverse-engineer it:
//
//   THIS LAYER USES NATIVE DOM FOCUS. There is no virtual-focus registry, no
//   "currently selected index" owned by the nav layer, no parallel tree of
//   registered items. A control is navigable because it is a real focusable
//   element, and the cursor is wherever `document.activeElement` is.
//
// The payoff is that keyboard support, Tab order, screen-reader announcement,
// :focus-visible, and "click a thing then keep going with the pad" all come
// out of the browser for free instead of being three more things to build and
// keep in sync. The cost is that a navigable control must be a real element —
// which in practice means adding `data-nav-item` and `tabIndex={0}` to the
// handful of clickable <div>s this codebase already has.
// ===========================================================================

import { scrollNeededFor, type NavRect } from './geometry';

/**
 * What counts as navigable. Native focusables are in by default — that is the
 * point — plus an explicit opt-in for the clickable divs (hand cards, enemy
 * figures, the floor map) that predate this layer.
 */
export const NAV_SELECTOR = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'summary',
  '[data-nav-item]',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** Opt OUT: `data-nav-skip` on an element (or an ancestor) hides its subtree. */
const SKIP_SELECTOR = '[data-nav-skip], [aria-hidden="true"], [hidden]';

export function isTextEntry(el: Element | null | undefined): boolean {
  if (!el) return false;
  const node = el as HTMLElement;
  if (node.isContentEditable) return true;
  const tag = node.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (node as HTMLInputElement).type;
  return type !== 'button' && type !== 'submit' && type !== 'reset' && type !== 'checkbox' && type !== 'radio';
}

/**
 * Elements the browser will activate by itself on Enter/Space. We must not
 * synthesise a second click on these from the keyboard, or every button on a
 * converted screen fires twice.
 */
export function isNativelyActivatable(el: Element | null | undefined): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'BUTTON' || tag === 'SUMMARY' || (tag === 'A' && el.hasAttribute('href')) || tag === 'INPUT' || tag === 'SELECT';
}

function isVisible(el: HTMLElement): boolean {
  // Cheap first: an element in no box tree has no rects at all.
  if (el.getClientRects().length === 0) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.visibility === 'collapse' || style.display === 'none') return false;
  // `pointer-events: none` is how several panels in this codebase disable a
  // region without unmounting it; honour it as "not interactive".
  if (style.pointerEvents === 'none') return false;
  return true;
}

function isDisabled(el: HTMLElement): boolean {
  if ((el as HTMLButtonElement).disabled) return true;
  if (el.getAttribute('aria-disabled') === 'true') return true;
  if (el.hasAttribute('data-nav-disabled')) return true;
  return false;
}

/** Every navigable element inside `roots`, in document order, de-duplicated. */
export function navCandidates(roots: readonly HTMLElement[]): HTMLElement[] {
  const seen = new Set<HTMLElement>();
  const out: HTMLElement[] = [];
  for (const root of roots) {
    if (!root) continue;
    const found = root.querySelectorAll<HTMLElement>(NAV_SELECTOR);
    for (const el of found) {
      if (seen.has(el)) continue;
      if (el.closest(SKIP_SELECTOR)) continue;
      if (isDisabled(el)) continue;
      if (!isVisible(el)) continue;
      seen.add(el);
      out.push(el);
    }
  }
  if (roots.length > 1) {
    out.sort((a, b) => {
      const rel = a.compareDocumentPosition(b);
      if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    });
  }
  return out;
}

export function rectOf(el: HTMLElement): NavRect {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
}

export function isInRoots(roots: readonly HTMLElement[], el: Node | null): boolean {
  if (!el) return false;
  return roots.some((root) => root && root.contains(el));
}

// ---------------------------------------------------------------------------
// Scrolling
// ---------------------------------------------------------------------------

export function isScrollable(el: HTMLElement): boolean {
  const style = getComputedStyle(el);
  const canY = /(auto|scroll|overlay)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 1;
  const canX = /(auto|scroll|overlay)/.test(style.overflowX) && el.scrollWidth > el.clientWidth + 1;
  return canY || canX;
}

/**
 * The container that BULK SCROLLING should move — the triggers and the right
 * stick — for a given focus position.
 *
 * Deliberately different from `scrollParent`: a focused element that is itself
 * a scroll box scrolls ITSELF. That is how a screen makes a long region of
 * prose readable on a pad — the Chronicle's page is 3700px of text in a 400px
 * window with nothing focusable inside it, so it is one focus stop, and
 * landing on it has to be the thing that lets you read on.
 *
 * `revealElement` deliberately does NOT use this. "Scroll a thing into view"
 * must always walk outward; asking an element to reveal itself inside itself
 * is a no-op that would then never reach the ancestors that needed moving.
 */
export function bulkScrollTarget(el: HTMLElement): HTMLElement | null {
  return isScrollable(el) ? el : scrollParent(el, null);
}

/** Nearest scrollable ancestor, stopping at (and including) `limit`. */
export function scrollParent(el: HTMLElement, limit?: HTMLElement | null): HTMLElement | null {
  let node: HTMLElement | null = el.parentElement;
  while (node) {
    if (isScrollable(node)) return node;
    if (limit && node === limit) return null;
    node = node.parentElement;
  }
  return null;
}

export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Bring `el` into view by the smallest scroll that does it, walking only the
 * scrollable ancestors up to `limit`. See `scrollNeededFor` for why this is
 * hand-rolled instead of `scrollIntoView({ block: 'nearest' })`: we must not
 * touch containers that already have the element visible, and several screens
 * here nest a scrolling list inside a scrolling panel.
 */
export function revealElement(el: HTMLElement, limit?: HTMLElement | null): void {
  const smooth = !prefersReducedMotion();
  let node: HTMLElement | null = el;
  let container = scrollParent(node, limit);
  let guard = 0;
  while (container && guard++ < 6) {
    const need = scrollNeededFor(rectOf(el), rectOf(container));
    if (need.dx !== 0 || need.dy !== 0) {
      container.scrollBy({ left: need.dx, top: need.dy, behavior: smooth ? 'smooth' : 'auto' });
    }
    node = container;
    if (limit && container === limit) break;
    container = scrollParent(node, limit);
  }
}

// ---------------------------------------------------------------------------
// Focus + activation
// ---------------------------------------------------------------------------

export function focusElement(el: HTMLElement, opts: { reveal?: boolean; limit?: HTMLElement | null } = {}): void {
  // preventScroll, then reveal ourselves — the browser's built-in scroll on
  // focus is the recentring behaviour we are specifically avoiding.
  el.focus({ preventScroll: true });
  if (opts.reveal !== false) revealElement(el, opts.limit);
}

/**
 * Press the focused control. `source` matters: from the keyboard the browser
 * already activates native controls, so synthesising a click would double-fire.
 * Returns whether we actually did something.
 */
export function activateElement(el: HTMLElement, source: 'pad' | 'key'): boolean {
  if (source === 'key' && isNativelyActivatable(el)) return false;
  el.click();
  return true;
}

/**
 * Where focus should land when a screen opens and nothing sensible is focused.
 * Honours an explicit `data-nav-initial`, otherwise the first candidate that
 * is not a text field (auto-focusing a text input pops the on-screen keyboard
 * on the PWA, and traps a controller in a field it cannot type into).
 */
export function initialFocusTarget(candidates: readonly HTMLElement[]): HTMLElement | null {
  const marked = candidates.find((el) => el.hasAttribute('data-nav-initial'));
  if (marked) return marked;
  return candidates.find((el) => !isTextEntry(el)) ?? null;
}

/**
 * Move the cursor into a specific region — the escape hatch for screens with
 * more than one natural home for focus (FloorScreen's map vs. its toolbar).
 */
export function focusFirstIn(root: HTMLElement | null | undefined): boolean {
  if (!root) return false;
  const target = initialFocusTarget(navCandidates([root]));
  if (!target) return false;
  focusElement(target, { limit: root });
  return true;
}

/**
 * Stable-ish identity for focus memory across a screen remount. Authors can
 * pin it with `data-nav-key`; otherwise we fall back to a structural guess.
 */
export function focusKeyOf(el: HTMLElement): string | null {
  const explicit = el.getAttribute('data-nav-key');
  if (explicit) return explicit;
  const label = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40);
  return label ? `${el.tagName}:${label}` : null;
}
