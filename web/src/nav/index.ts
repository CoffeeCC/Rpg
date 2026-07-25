// ===========================================================================
// nav/ — controller + keyboard navigation for Everdusk.
//
// Read web/CONTROLLER.md before converting a screen. The 30-second version:
//
//   import { useNavScope } from '../nav';
//   const root = useRef<HTMLDivElement>(null);
//   useNavScope(root, { id: 'stable', onCancel: () => dispatch({ type: 'GOTO', screen: back }) });
//   return <div className="panel" ref={root}>…</div>;
//
// Importing anything from here also installs the focus-ring stylesheet and the
// global listeners. There is no provider to mount and no App.tsx wiring.
// ===========================================================================

import './nav.css';

export { useNavScope, useNavInputMode, useRefocusOn, type NavScopeOptions } from './useNavScope';
export { getInputMode, onInputModeChange, refocusTopScope, type InputMode, type NavEventMeta } from './navBus';
export { focusFirstIn } from './focus';
export {
  PAD_BUTTON,
  PAD_DPAD,
  type NavButton,
  type NavDir,
  type NavSource,
} from './input';

/**
 * Props that make a non-button element navigable.
 *
 * Prefer a real `<button>`. Use this only where the markup genuinely cannot be
 * one — a fanned card that must keep its transform, a battlefield figure, a
 * grid cell — and remember that the element still needs an `onClick`, because
 * "confirm" activates it by dispatching a real click.
 *
 *   <div {...navItem({ label: card.name })} onClick={() => select(i)} />
 */
export interface NavItemProps {
  'data-nav-item': string;
  'data-nav-key'?: string;
  'data-nav-initial'?: string;
  'data-nav-disabled'?: string;
  'data-nav-widget'?: string;
  tabIndex: number;
  role?: string;
  'aria-label'?: string;
}

export function navItem(
  opts: {
    /** Stable identity for focus memory across remounts. */
    key?: string;
    /** Focus this one when the screen opens. */
    initial?: boolean;
    /** Present but not navigable (greyed out). */
    disabled?: boolean;
    /** Consumes directions while focused — see CONTROLLER.md. */
    widget?: boolean;
    role?: string | null;
    label?: string;
  } = {},
): NavItemProps {
  const props: NavItemProps = {
    'data-nav-item': '',
    tabIndex: opts.disabled ? -1 : 0,
  };
  if (opts.key) props['data-nav-key'] = opts.key;
  if (opts.initial) props['data-nav-initial'] = '';
  if (opts.disabled) props['data-nav-disabled'] = '';
  if (opts.widget) props['data-nav-widget'] = '';
  if (opts.role !== null) props.role = opts.role ?? 'button';
  if (opts.label) props['aria-label'] = opts.label;
  return props;
}
