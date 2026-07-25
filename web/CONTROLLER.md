# Controller & keyboard navigation

Everdusk ships to Steam Deck. **Every menu must be operable with a controller,
combat included.** This document is how you make a screen comply. You should
not need to read `src/nav/` to do it.

Wave 1 built the layer and converted `BattleScreen` and `FloorScreen` as
reference implementations. Everything else is still mouse-only.

---

## 1. The button map

| Physical | Index | Semantic name | What it does by default |
|---|---|---|---|
| A / cross | 0 | `confirm` | Presses the focused control |
| B / circle | 1 | `cancel` | Closes a modal; otherwise `onCancel` |
| X / square | 2 | `alt` | Nothing — screen-specific |
| Y / triangle | 3 | `info` | Nothing — screen-specific |
| LB / L1 | 4 | `prevTab` | Nothing — for tab/section switching |
| RB / R1 | 5 | `nextTab` | Nothing — for tab/section switching |
| LT / L2 | 6 | `pageUp` | Scrolls the focused container up |
| RT / R2 | 7 | `pageDown` | Scrolls the focused container down |
| View / Back | 8 | `select` | Nothing |
| Menu / Start | 9 | `start` | Nothing |
| D-pad | 12–15 | direction | Moves focus |
| Left stick | axes 0,1 | direction | Moves focus |
| Right stick | axes 2,3 | — | Free-scrolls the focused container |

Keyboard parity, on the same code path:

| Key | Semantic |
|---|---|
| Arrow keys | direction |
| Enter, Space | `confirm` |
| Escape, Backspace | `cancel` |
| PageUp / PageDown | `pageUp` / `pageDown` |
| Tab | native focus order (cycles *inside* a modal) |

**Letter keys are deliberately not bound.** `FloorScreen` owns WASD for hero
movement and several screens have text search fields. Keep letter shortcuts
screen-local, as they are today.

Why this map: A/B confirm/cancel is the Xbox convention Steam Input presents by
default, and it is what a Deck player's thumb already expects. Shoulders are
reserved for lateral movement between sections because that is where every
console storefront and inventory screen puts it. X and Y are left free on
purpose — they are the two buttons a screen can claim for its own verb (in
combat, X is the pouch).

---

## 2. Making a screen navigable

### The common case: a screen made of `<button>`s

```tsx
import { useRef } from 'react';
import { useNavScope } from '../nav';

export function StableScreen({ state, dispatch, backScreen }) {
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'stable',
    onCancel: () => { dispatch({ type: 'GOTO', screen: backScreen }); return true; },
  });

  return <div className="panel" ref={root}> …unchanged markup… </div>;
}
```

That is the whole conversion. Three lines and a `ref`.

It works because **the nav layer drives real DOM focus over real focusable
elements.** There is no registry to populate and no per-item component to wrap.
Any `<button>`, `<a href>`, `<input>`, `<select>` or `[tabindex="0"]` inside the
scope root is automatically a cursor stop, in document order. Keyboard, Tab
order, and screen-reader behaviour come from the browser rather than from us.

### Before / after, in full

```diff
  export function QuestBoardScreen({ state, dispatch }) {
+   const root = useRef<HTMLDivElement>(null);
+   useNavScope(root, { id: 'questBoard', onCancel: () => { dispatch({ type: 'GOTO', screen: 'town' }); return true; } });
    return (
-     <div className="panel">
+     <div className="panel" ref={root}>
        <h1 className="title">The Quest Board</h1>
        {quests.map((q) => (
          <button key={q.id} className="btn" onClick={() => accept(q)}>{q.name}</button>
        ))}
      </div>
    );
  }
```

No markup changed. The buttons were already navigable; they just needed
somebody to say where the screen starts and what B means.

### Clickable `<div>`s

Where the markup genuinely cannot be a `<button>` — a fanned card that must
keep its transform, a battlefield figure — use `navItem()`:

```tsx
import { navItem } from '../nav';

<div
  className="hand-slot"
  {...navItem({ key: `hand-${inst.uid}`, initial: i === 0, label: card.name })}
  onClick={() => selectCard(i)}
/>
```

It supplies `tabIndex`, `role="button"`, `aria-label` and the data attributes.
**The element still needs its `onClick`** — `confirm` activates a control by
dispatching a real click, so mouse and pad end up in the same handler.

Prefer a real `<button>` when you can. `PartySidebar` was converted from divs to
buttons and got a gold focus ring for free; that is the better path.

---

## 3. Focus order

Focus order is **spatial**, resolved from live `getBoundingClientRect()`s: press
Right and you get the nearest control to the right that lines up on the vertical
axis. You usually do not declare anything.

Three knobs when you need them:

- `navItem({ initial: true })` / `data-nav-initial` — where the cursor lands
  when the screen opens. Otherwise it is the first candidate in document order
  that is not a text field.
- `navItem({ key: '…' })` / `data-nav-key` — stable identity so returning to a
  screen restores the cursor to the same control. Scope `id` must also be set.
- `wrap: false` in the scope options — stop at the end of a row/column instead
  of wrapping to the far end. Default is wrap-on. Grids sometimes want it off.

To take an element out of navigation entirely: `data-nav-skip` (also hides its
whole subtree), or `data-nav-disabled` for something present but not selectable.
Real `disabled` buttons and `aria-hidden` subtrees are skipped automatically.

### Widgets that eat directions

Some regions are not a list of controls — the floor map, the battlefield. Model
these as **one focusable cell that consumes directions while focused**:

```tsx
<div {...navItem({ widget: true, initial: true, role: 'group', label: 'Expedition map' })} />
```

and in the scope:

```tsx
onDirection: (dir, meta) => {
  if (!meta.target?.hasAttribute('data-nav-widget')) return false; // normal focus movement
  dispatch({ type: 'MOVE', dir: NAV_MOVE[dir] });
  return true;                                                     // consumed
}
```

**Returning `true` from a handler consumes the event** and suppresses the
default. That one mechanism is how combat expresses "left/right cycles the
aimed enemy instead of moving the cursor".

A widget swallows the D-pad, so give the player a documented way out. The floor
map uses B (and LB/RB) to hand the cursor to the toolbar and back.

---

## 4. Modals and overlays

An overlay gets **its own scope, one layer up, with `trap: true`**:

```tsx
function MerchantMat({ dispatch }) {
  const ref = useRef<HTMLDivElement>(null);
  useNavScope(ref, {
    id: 'floor.merchant',
    layer: 10,
    trap: true,
    onCancel: () => { dispatch({ type: 'MERCHANT_CLOSE' }); return true; },
  });
  return <div className="merchant-mat" ref={ref}>…</div>;
}
```

Only the **topmost** scope receives input, so the screen behind goes quiet
automatically — you do not need a `if (modalOpen) return;` guard in the screen's
handlers. `trap` additionally keeps Tab inside the overlay and yanks focus back
if anything drags it out. When the overlay unmounts, the cursor returns to the
screen beneath.

A modal with no way out — `MercyPrompt` in combat, where the game is waiting on
a decision — simply omits `onCancel`. B then does nothing, which is correct.

`CardDetailOverlay`, `StoryOverlay`, `LegendOverlay` and `ItemHover` are **not
yet converted.** They are owned by other files; whoever converts them should use
exactly the pattern above. Until then, B falls through to the screen behind
them — the same thing that happens today with Escape.

---

## 5. Scrolling

Moving focus to an offscreen control scrolls it into view automatically, by the
**minimum** amount, walking only the scrollable ancestors up to the scope root.

Do not reach for `element.scrollIntoView()`. It recentres and it walks *every*
scrollable ancestor — `FloorScreen`'s camera-follow comment records that exact
bug ("scrollIntoView walked every scrollable ancestor, dragging the whole page
side to side"). The nav layer's `revealElement` exists to avoid it.

For long screens, also give the player bulk movement: LT/RT page the focused
container, and the right stick free-scrolls it. Both work with no code from you,
as long as the scrolling element is a real scroll container (`overflow: auto`)
and an ancestor of the focused control.

---

## 6. The focus indicator

Gold ring, matching `PartySidebar`'s. It lives in `src/nav/nav.css` and you
should not need to touch it.

The one thing worth understanding: **it is not `:focus-visible`.** That is a
browser heuristic about whether the user "seems to be using the keyboard", and
it frequently does not fire for a programmatic `element.focus()` — which is how
every pad-driven focus move happens. So `navBus` publishes the live input device
on `<html data-nav-input="pad|key|pointer">` and `nav.css` styles plain `:focus`
under `pad` and `key`. Mouse and touch keep exactly the appearance they have
today.

If a converted screen has a control whose own styling swallows the ring, add a
rule to `nav.css` (as combat did for the rotated hand cards, where a rectangular
outline round the layout box read as crooked).

---

## 7. Pitfalls hit while building this

**Double-firing `confirm`.** The browser already activates a focused `<button>`
on Enter/Space. If you also synthesise a click, every button fires twice. The
layer handles this — keyboard `confirm` on a natively-activatable element is
left to the browser, pad `confirm` always synthesises — but if you write your
own `onButton('confirm')` handler, be careful to return `true` only when you
really consumed it. In combat, `confirm` is consumed *only* when the ring is on
the card that is actually selected; on any other card it deliberately falls
through so the click selects that card instead.

**Focus dies when its element unmounts.** Any list that re-renders can strand
the cursor on `<body>`, which for a pad player means the ring vanishes with no
way to get it back. Combat hits this twice a turn (the hand fan remounts on a
new turn; playing a card unmounts one slot). Use `useRefocusOn([deps])`.

**Nesting is not a direction.** A focusable ancestor sits above, below, left and
right of its child simultaneously, so a naive edge test says it lies in every
direction and the cursor jumps from a button to the box drawn around it. The
geometry rejects enclosing/enclosed rects; be aware if you nest focusables.

**Auto-focusing a text input** pops the on-screen keyboard in the PWA and traps
a controller in a field it cannot type into. Initial-focus resolution skips text
fields; do not override that with `data-nav-initial` on an `<input>`.

**Text fields swallow navigation on purpose.** While focus is in one, arrows
move the caret and Space types a space. Only Escape gets through. A screen with
a search box needs a way to leave the box — B, or a `nextTab` binding.

**Do not add another rAF loop.** There is exactly one gamepad poll in the app,
in `navBus`, and it does not run at all until a pad is connected. If you find
yourself writing `navigator.getGamepads()` in a component, the answer you want
is a scope handler.

---

## 8. Reference implementations

- **`FloorScreen.tsx`** — a widget that eats directions (the map), a toolbar
  reached with B, and a trapping modal (the merchant mat).
- **`BattleScreen.tsx`** — two input modes in one scope (browsing vs. aiming),
  a consumed direction, `navItem` on clickable divs, refocus after a re-render,
  and a modal with no cancel.

## 9. API surface

```ts
import { useNavScope, useNavInputMode, useRefocusOn, navItem, focusFirstIn, getInputMode } from '../nav';

useNavScope(ref, {
  id?: string;          // focus memory across remounts
  layer?: number;       // 0 screen, 10 overlay
  trap?: boolean;       // modal
  wrap?: boolean;       // default true
  autoFocus?: boolean;  // default true
  enabled?: boolean;    // register conditionally
  extraRoots?: […];     // additional regions (e.g. a portalled panel)
  onDirection?(dir, meta): boolean | void;   // true = consumed
  onButton?(button, meta): boolean | void;   // true = consumed
  onCancel?(): boolean | void;
});
```

`meta` is `{ source: 'pad' | 'key', repeat: boolean, target: HTMLElement | null }`
— `target` is the focused element inside the scope, or `null` if focus is
nowhere.

Importing from `../nav` also installs the stylesheet and the global listeners.
**There is no provider to mount**; `App.tsx` and `main.tsx` are untouched.
