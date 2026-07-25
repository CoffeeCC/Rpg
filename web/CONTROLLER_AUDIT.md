# Everdusk — Controller Navigation Audit

**Scope:** every screen and overlay in `web/src/components/`, plus the interactive chrome
rendered directly from `web/src/App.tsx`.
**Target:** Steam Deck (1280×800, gamepad-only) and desktop (gamepad + KB/M).
**Working-tree state audited:** uncommitted changes included — `CharacterSheetScreen.tsx`,
`GearScreen.tsx` (new), `PartySidebar.tsx`, `MonsterSheetScreen.tsx`, `NextDraftPanel.tsx`
(new), `TavernScreen.tsx`, `SaveLoadScreen.tsx`, `App.tsx`.

> **Read this first:** the headline number is not 33 screens. It is **24 routed `Screen`
> values across 22 screen components, plus 11 distinct overlay/tray surfaces, plus 9 shared
> subcomponents** — and two of those shared subcomponents (`ItemHover`, `KeywordText`) carry
> game-relevant information that a controller cannot reach today. See
> [§ Cross-cutting problems](#cross-cutting-problems).

---

## 0. Global facts established by this audit

These are true of the *entire* app today and should be settled by the shared navigation layer
before any screen conversion starts.

| Fact | Evidence |
| --- | --- |
| **Nothing in the app ever calls `.focus()`.** No screen sets initial focus on entry; no overlay restores focus on close. | `grep -rn "focus()\|autoFocus" web/src/components web/src/App.tsx` → zero hits |
| **No overlay traps focus.** Every overlay (`StoryOverlay`, `LegendOverlay`, `CardDetailOverlay`, `codex-overlay`, `duel-yield`, `mercy-overlay`, `pile-inspect`, `MerchantMat`) is a plain sibling; Tab walks straight out into the screen behind it. | all overlay components; none use `inert`/`aria-modal`/focus traps |
| **Only two screens listen to the gamepad at all.** | `BattleScreen.tsx:515-534`, `FloorScreen.tsx:191-213` |
| **Only two `tabIndex` values exist in the whole app.** | `TownScreen.tsx:118` (`role="button"` div), `KeywordText.tsx:20` (every glossary term) |
| **Escape is handled in exactly 3 places.** | `CardDetailOverlay.tsx:34-35`, `FloorScreen.tsx:141/180`, `BattleScreen.tsx:504-508` |
| **`:focus-visible` styling exists on only 8 selectors app-wide** — `.btn`, `.town-cast-card`, `.reward-card`, `.event-choice`, `.psb-card`, `.cdd-ledger-summary`, `.doll-slot`, `.card-search`. Everything else focuses invisibly. | `v16.css:158`, `v5.css:555/1552`, `sheets.css:1117/1188`, `charsheet.css:28-36/144/503`, `services.css:296` |
| **Every screen scrolls inside `.game-main`, which is `overflow-y: auto`.** There is no keyboard/controller scroll path — only whatever a focused element's native `scrollIntoView` gives you. | `App.css:40-58` |
| **`.game` is a 3-column grid: `1fr 320px` with a permanent 320px sidebar.** At 1280×800 the main content column is ~940px, not 1280. Every "does this fit" judgement below assumes ~940×~700. | `App.css:5-15`, `App.css:88-96` |
| **Battle is the only screen exempted from `.game-main`'s scroll** (`max-height:100%; overflow-y:auto` on itself). | `App.css:67-71` |

---

## 1. Persistent chrome (always on screen — convert first, owned by the shared layer)

### 1.1 `App.tsx` HUD header — `web/src/App.tsx:235-324`

| | |
| --- | --- |
| **Routes from** | every `Screen` except `create` (`App.tsx:204-210` short-circuits to a bare `CreateScreen`) |
| **Interactive surface** | 3 buttons: HUD Back chip (`:236-247`, conditional on the `backable` list at `:222-225`), SFX mute (`:295-306`), music mute (`:309-322`) |
| **Cannot work on controller** | Nothing structurally — but the Back chip is *only* rendered for the 14 screens in `backable` (`App.tsx:222-225`). `cardCodex`, `multiplayer`, `victory`, `fallen`, `event`, `cardReward` are **not** in that list and rely on an in-panel Back button. A global B-to-go-back must not assume the HUD chip exists. |
| **Layout risk @1280×800** | Low. Header is `auto` row. |
| **Complexity** | trivial |
| **Focus order / entry** | Should be *out* of the default cycle. Put mute/music behind a Start/Options menu; leave Back on the B button. |
| **Overlay behavior** | n/a |

> **Note for the shared layer:** `backScreen` is computed at `App.tsx:170` and
> `monsterBackScreen` at `App.tsx:181`. A global "B = back" needs to use these, not a
> hardcoded `'town'`, or B mid-expedition will walk the player out of their run.

### 1.2 `PartySidebar.tsx` (99 lines, **recently modified**)

| | |
| --- | --- |
| **Routes from** | every non-battle screen (`App.tsx:352-358`) |
| **Interactive surface** | `1 + party.length` buttons (hero card + one per companion, party cap ~3). Already real `<button>`s with `aria-label`, and already has `:focus-visible` styling (`charsheet.css:28-36`). |
| **Cannot work on controller** | Nothing. **This file is the reference implementation** — the v20 comment at `PartySidebar.tsx:12-15` says as much. |
| **Layout risk @1280×800** | Sidebar is `position: sticky` at 320px (`App.css:88-96`). Hero + 3 companions + `LogPanel` (`App.css:419-420`, `max-height:168px`) fits. Low risk. |
| **Complexity** | **trivial** — already done, just needs to be wired into the nav layer as a second focus *region*. |
| **Focus order / entry** | Should be a separate region reachable via a shoulder button (LB/RB region cycle), not part of the main screen's D-pad grid. |
| **Overlay behavior** | n/a |

### 1.3 `LogPanel.tsx` (53 lines)

Zero interactive controls. It is a **scroll container with no keyboard path** —
`.game-log`/`.log` at `App.css:419-420` is `max-height:168px; overflow-y:auto`, and nothing
inside it is focusable. On a controller the battle log is capped at whatever fits in 168px.
**Complexity: moderate** (needs an explicit "focusable scroll region" affordance, or a
right-stick scroll binding in the shared layer). Flagged as cross-cutting problem **C6**.

---

## 2. Screens — full inventory

Ordered roughly by conversion difficulty within each batch grouping.

---

### 2.1 `VictoryScreen.tsx` — `Screen: 'victory'`
- **File:** `web/src/components/VictoryScreen.tsx` (35 lines)
- **Interactive surface:** **2 buttons** — "Keep playing" (`:25`), "New game" (`:28`)
- **Cannot work on controller:** nothing
- **Layout @1280×800:** fine, short centered cine block
- **Complexity:** **trivial** — two buttons in one `.btn-row`
- **Focus on entry:** "Keep playing" (`:25`)
- **Overlay:** not an overlay. B/Escape should do nothing (it's a terminal screen; "New game" is destructive and must not be the B action)

### 2.2 `FallenScreen.tsx` — `Screen: 'fallen'`
- **File:** `web/src/components/FallenScreen.tsx` (69 lines)
- **Interactive surface:** **1 button** — "Begin the Nth Telling" (`:49-58`), which calls `nextTelling()` then `RESTART`
- **Cannot work on controller:** nothing
- **Layout:** fine
- **Complexity:** **trivial**
- **Focus on entry:** the single button
- **Overlay:** n/a. B/Escape: **no-op** — this button is irreversible.

### 2.3 `EventScreen.tsx` — `Screen: 'event'`
- **File:** `web/src/components/EventScreen.tsx` (31 lines)
- **Interactive surface:** **2–4 buttons**, one per `event.options` (`:22-26`)
- **Cannot work on controller:** nothing. Already has `:focus-visible` (`sheets.css:1117`).
- **Layout:** fine
- **Complexity:** **trivial**
- **Focus on entry:** first choice
- **Overlay:** not backable (`App.tsx:222-225` excludes `event`). B/Escape: **no-op** — the player must choose.

### 2.4 `CardRewardScreen.tsx` — `Screen: 'cardReward'`
- **File:** `web/src/components/CardRewardScreen.tsx` (44 lines)
- **Interactive surface:** **3 card buttons + 1 "Take nothing"** (`:23-35`, `:38`)
- **Cannot work on controller:** **the card faces themselves.** `CardView` (see §3.2) has a hover-tilt on rare cards and `title` attributes for the cost and type line. The *rules text* is rendered on the card face so nothing is lost — but at `width={300}` the text is legible, so this one is fine. No blocker.
- **Layout:** 3×300px cards = 900px + gaps. **Tight in a 940px main column.** Check `.reward-row` wrapping at 1280×800.
- **Complexity:** **trivial**
- **Focus on entry:** first reward card
- **Overlay:** n/a. B/Escape → should map to "Take nothing"? **No** — make B a no-op and require an explicit choice, otherwise a stray B press discards a rare.

### 2.5 `GateSelectScreen.tsx` — `Screen: 'gateSelect'`
- **File:** `web/src/components/GateSelectScreen.tsx` (66 lines)
- **Interactive surface:** **5 gate buttons** (`GATE_ORDER`, `:24-46`) + **up to 5 "Unmapped Wilds" buttons** (`:48`, one per cleared gate) + Back (`:60`). Max **11**.
- **Cannot work on controller:** nothing. Locked gates use `disabled` (`:28`) — the nav layer must skip disabled items or the player lands on dead entries.
- **Layout:** 5–10 large art cards stacked in `.option-list`. **Will scroll** once 2+ gates are cleared. Moderate risk.
- **Complexity:** **trivial**
- **Focus on entry:** first *enabled* gate (not index 0 — gate 0 is always enabled, but be defensive)
- **Overlay:** in `backable`. B/Escape → `GOTO town`.

### 2.6 `ShopScreens.tsx` — `Screen: 'shopItems'` **and** `'shopGear'`
- **File:** `web/src/components/ShopScreens.tsx` (115 lines) — **two exported screens in one file**
- **Interactive surface:**
  - `ShopItemsScreen` (`:8-46`): **10 Buy buttons** (one per `CONSUMABLES` entry) + Back = **11**
  - `ShopGearScreen` (`:49-114`): **up to 6 Buy** (`state.gearStock`, `GEAR_STOCK_SIZE`) + **N Sell** (one per bag item, unbounded) + Back
- **Cannot work on controller:** `ShopGearScreen` renders `<ItemLine>` (`:72`, `:96`) but **not** `<ItemHover>` — so you get name/base/ilvl/affixes inline. Acceptable. The `title="Your purse"` on the gold chip (`:16`, `:58`) is decorative.
- **Layout @1280×800:** `ShopGearScreen` is **two unbounded stacked `.option-list`s** (stock + full bag). A 30-item bag is a very long scroll. **High risk.**
- **Complexity:** **moderate** — two screens in one file, one of them with an unbounded list and disabled-affordance skipping
- **Focus on entry:** first affordable Buy row; `ShopGearScreen` → first stock row
- **Overlay:** both in `backable`. B/Escape → `GOTO town`.

### 2.7 `SmithScreen.tsx` — `Screen: 'smith'`
- **File:** `web/src/components/SmithScreen.tsx` (112 lines)
- **Interactive surface:** **2 Forge buttons** (`:36`, `:57`) + **N "Reforge one" buttons**, one per distinct card in the hero's persistent deck (`:76-102`, typically 12–16) + Back (`:106`). ~**16–19**.
- **Cannot work on controller:** the reforge grid renders `CardView` at `width={128}` (`:84`). Per `CardView.tsx:40-44`, **128px is the width at which the longest card names get truncated by the auto-fit shrinker** — and there is no click-to-inspect on this screen, unlike `DeckScreen`. On a Deck at 1280×800 those cards are small and the only full name is in a `title` tooltip (`CardView.tsx:101`). **Controller users cannot read what they are about to spend gold reforging.** → needs a focus-triggered detail, or route to `CardDetailOverlay`.
- **Layout:** `.deck-grid` of 12–16 128px cards + two forge plates. Moderate; will scroll.
- **Complexity:** **moderate** (only because of the unreadable-card problem)
- **Focus on entry:** first Forge plate
- **Overlay:** in `backable`. B/Escape → `GOTO town`.

### 2.8 `QuestBoardScreen.tsx` — `Screen: 'questBoard'`
- **File:** `web/src/components/QuestBoardScreen.tsx` (110 lines)
- **Interactive surface:** **up to 17 buttons** (one Accept *or* Claim per posted quest, `:83`/`:88` — never both) + Back (`:104`). Note: **quest notes themselves are non-interactive `<div>`s** (`:58`), so a completed+claimed quest has *zero* focusable children and creates a hole in a naive grid walk.
- **Cannot work on controller:** nothing structural, but the sparse-button layout over a `.quest-grid` means a 2-D D-pad walk over the *notes* won't match a walk over the *buttons*. Recommend navigating note-by-note and activating whichever action the note has.
- **Layout @1280×800:** `.quest-grid` of up to 17 parchment notices, each with title/giver/text/objective/reward. **Long — guaranteed multi-screen scroll.** High risk.
- **Complexity:** **moderate**
- **Focus on entry:** first note that has a *Claim* button, else first *Accept*, else Back
- **Overlay:** in `backable`. B/Escape → `GOTO town`.

### 2.9 `SaveLoadScreen.tsx` — `Screen: 'saveLoad'` (**recently modified**)
- **File:** `web/src/components/SaveLoadScreen.tsx` (139 lines)
- **Interactive surface:** **9 slot buttons** (3 slots × Save/Load/Delete, `:102-110`) + **Export** (`:119`) + **Import** (`:126`) + Back (`:133`) = **12**. Plus one hidden `<input type="file">` (`:129`).
- **Cannot work on controller:**
  - **`<input type="file">` (`:129`) opens an OS file picker.** On Steam Deck in Game Mode this is a dead end — there is no usable file dialog. Same problem in `CreateScreen.tsx:156`. **This is a platform blocker, not a nav blocker** — recommend hiding Import/Export behind a desktop-only check.
  - `handleDelete` (`:56-60`) is **destructive with no confirmation**. On a D-pad grid, Delete sits one right of Load. Needs a confirm step for controller.
- **Layout:** `.sl-grid` of 3 crystals, each with 3 buttons. Comfortable at 1280×800. Low risk.
- **Complexity:** **moderate** (the file-picker carve-out + delete confirm are real work)
- **Focus on entry:** Save on slot 1 (or Load on the most recent filled slot — better)
- **Overlay:** in `backable`. B/Escape → `GOTO backScreen` (note: `backScreen`, not `town` — `SaveLoadScreen` is reachable from the floor, `FloorScreen.tsx:344`).

### 2.10 `StableScreen.tsx` — `Screen: 'stable'`
- **File:** `web/src/components/StableScreen.tsx` (129 lines)
- **Interactive surface:** per monster, **3–4 controls** — portrait button (`:15`), "View ▸" (`:41`), plus "To stable" (party) or "To party" + "Release" (stable). With `STABLE_CAP = 20` and party cap ~3: **up to ~89 buttons** + one `<details>` summary (`:56`) + Back (`:123`).
- **Cannot work on controller:**
  - **Duplicate actions:** portrait (`:15`) and "View ▸" (`:41`) do the same thing. A D-pad walk hits both. Collapse to one for controller.
  - **`title`-only information:** the personality pill (`:28`) carries `${p.blurb} Instinct: ${p.instinctText}` — **real mechanical information available only on mouse hover.** Same for the bond pill (`:32`). Cross-cutting problem **C1**.
  - **"Release" (`:113`) is destructive with no confirmation** and sits adjacent to "To party" in the same row.
- **Layout @1280×800:** two `.stable-grid`s; the stable one can hold 20 cards. **Very long scroll. High risk.**
- **Complexity:** **moderate**
- **Focus on entry:** first party card; if party empty, first stable card; else Back
- **Overlay:** in `backable`. B/Escape → `GOTO town`.

### 2.11 `BreedingScreen.tsx` — `Screen: 'breeding'`
- **File:** `web/src/components/BreedingScreen.tsx` (169 lines)
- **Interactive surface:** **N monster buttons** (party + stable, up to 23, `:118`) + **up to ~8 skill chips** (`:148`) + "Breed them" (`:155`) + Back (`:163`). ~**33**.
- **Cannot work on controller:**
  - Nothing hover-gated, but the **selection model is stateful and non-obvious**: `toggleParent` (`:50-57`) cycles A → B → replace-B. On a controller with no cursor context this needs an explicit "A: set as parent / Y: clear" prompt.
  - The skill chips + Breed button (`:139-160`) **only exist when a valid pair is picked** — the focusable set mutates mid-interaction. The nav layer must re-resolve focus when `preview` appears/disappears.
- **Layout:** ritual row + up to 23 option cards + outcome block. **Long. Moderate-high risk.**
- **Complexity:** **moderate** — dynamic focus set is the real cost
- **Focus on entry:** first monster in the pick list
- **Overlay:** in `backable`. B/Escape → `GOTO town`. Consider: if a parent is selected, B clears the selection first.

### 2.12 `MonsterSheetScreen.tsx` — `Screen: 'monsterSheet'` (**recently modified**)
- **File:** `web/src/components/MonsterSheetScreen.tsx` (209 lines)
- **Interactive surface:** **2 accessory slots**, each with a "Remove" (`:38`) if worn, or **N "Fit" buttons** (one per matching bag item, `:56`) if empty + Back (`:203`). Typically **3–10**.
- **Cannot work on controller:**
  - **Two `title`-only info carriers:** the elemental weakness at `:110` (`Takes bonus damage from ...`) and the bond bar at `:147` (`Battles survived at your side. Instincts strengthen with bond.`) and the aspect line at `:161` (`a.blurb`). All are mechanical, all are hover-only. **C1.**
  - The 2-column `.ms-layout` (`sheets.css:422`, `minmax(260px,320px) 1fr`) means D-pad left/right must cross a column boundary correctly; the left column has **no focusable content at all**.
- **Layout @1280×800:** `.ms-layout` collapses to 1 column below 900px (`sheets.css:429`) — at ~940px main column it stays 2-col but barely. **Moderate risk; verify at exactly 1280×800 with sidebar.**
- **Complexity:** **moderate**
- **Focus on entry:** Back button (it's mostly a reading screen) — or first "Fit"/"Remove" if any exist
- **Overlay:** in `backable`. B/Escape → `GOTO backScreen` (**`monsterBackScreen`**, `App.tsx:181` — mid-expedition this must be `floor`).

### 2.13 `CreateScreen.tsx` — `Screen: 'create'`
- **File:** `web/src/components/CreateScreen.tsx` (183 lines)
- **Routes from:** `create`, **and it is rendered outside the game shell** (`App.tsx:204-210`, `.game.no-shell`) — no HUD, no sidebar, no Back chip. It is also the fallback whenever `state.player` is null.
- **Interactive surface:** **4 race chips** (`:88-102`) + **5 class chips** (`:138-148`) + **up to 3 continue-save buttons** (`:73-81`) + **Import save** (`:153`) + **name text input** (`:157-165`) + **Begin** (`:166`) = **up to 15**.
- **Cannot work on controller:**
  - **`<input type="text">` at `:157`** — the hero's name. On Steam Deck this needs the Steam on-screen keyboard, which only appears reliably if the field is focused via a real focus event. **This is the single highest-risk control in the game for a Deck release**: `canBegin` (`:21`) requires a non-empty name, so a player who cannot type **cannot start the game at all.**
  - **`<input type="file">` at `:156`** — see §2.9. Dead end in Game Mode.
  - 3-column `.forge-stage` (rail / hero / rail) means the natural D-pad walk is left-rail → centre → right-rail, but the centre column has **no focusable content**. The two rails must be linked directly.
- **Layout @1280×800:** full-bleed (no sidebar here), 3 columns + masthead + actions row. Should fit; verify the class rail with 5 entries.
- **Complexity:** **hard** — text entry is the blocker, not the buttons
- **Focus on entry:** first continue-save if any exist, else the name input (so the OSK fires immediately), else the Begin button
- **Overlay:** n/a. B/Escape: **no-op** (nowhere to go back to).

### 2.14 `TownScreen.tsx` — `Screen: 'town'`
- **File:** `web/src/components/TownScreen.tsx` (228 lines)
- **Interactive surface:** **6 cast cards** + **8 nested service buttons** + **7 dock buttons** (Gates, Rest, Casque's Blessing *conditional*, Duelling Ring, Character, Equipment, Deck, Save/Load) = **~21**
- **Cannot work on controller:**
  - **`TownScreen.tsx:114-123` — the cast card is a `role="button"` `<div>` with `tabIndex={0}` that *contains* real `<button>` children** (`:139-149`). This is a nested-interactive violation. Tab lands on the card, then on each service button inside it; activating the card fires `c.services[0].screen` while the buttons fire their own. **On a D-pad this is genuinely confusing** — you land on "Stablemaster Ott" (which secretly means "the stable"), then on "The stable", then on "Breeding".
  - The child buttons call `e.stopPropagation()` (`:143`) to avoid double-firing — that only works for pointer events; the card's `onKeyDown` (`:120-122`) does not check `e.target`, so **pressing Enter while focused on a nested service button will fire BOTH handlers**. Note this as a latent bug (not fixed here).
  - `badge-dot` `title` (`:148`) carries "Rewards to claim" / "New requests posted" — hover-only. **C1.**
- **Layout @1280×800:** cast grid (6 portrait cards with barks) + a 4-group dock. **Dense. Will scroll. High risk** — this is the hub screen and should ideally fit without scrolling.
- **Complexity:** **hard** — the nested-interactive structure needs restructuring, not decorating
- **Focus on entry:** "The Gates" dock button (`:159`) — it is the primary action
- **Overlay:** not in `backable` (it *is* the back target). B/Escape: **no-op**, or open an Options/pause menu.

### 2.15 `TavernScreen.tsx` — `Screen: 'tavern'` (**recently modified**)
- **File:** `web/src/components/TavernScreen.tsx` (142 lines) — **hosts `NextDraftPanel` at `:132`**
- **Interactive surface:** **10 NPC cards** (`NPCS.map`, `:60-82`) + **~5 "Inscribe" buttons** (`CHRONICLER_BOONS`, `:110-120`) + everything in `NextDraftPanel` (see §2.16) + Back (`:136`) = **~16 + ~12 = ~28**
- **Cannot work on controller:**
  - `title="Cost in verses"` on the verse chip (`:109`) — decorative, fine.
  - Nothing hover-gated. The main issue is **length**.
- **Layout @1280×800:** speech bubble + 10 NPC portrait cards + Chronicler's Desk (5 boons) + the entire `NextDraftPanel` (record grid + 6 binding rows + 6 depth chips + triumph list). **This is one of the three longest screens in the game.** Very high risk — recommend tabs or a collapsed desk.
- **Complexity:** **hard** — mostly because it owns two logically distinct sub-screens stacked vertically
- **Focus on entry:** first NPC card
- **Overlay:** in `backable`. B/Escape → `GOTO town`.

### 2.16 `NextDraftPanel.tsx` — sub-panel of `'tavern'` (**new, never had controller consideration**)
- **File:** `web/src/components/NextDraftPanel.tsx` (247 lines) + **its own CSS `web/src/components/nextDraft.css`**
- **Routes from:** `tavern` only (`TavernScreen.tsx:132`)
- **Interactive surface:** **1 "An Unbound Telling" row** (`:117-133`) + **5 binding rows** (`BINDINGS.map`, `:135-174`) + **6 depth chips** (`DEPTHS.map`, `:190-207`, only when `canDepth`) = **up to 12 buttons**. All are real `<button>`s. Zero text inputs.
- **Cannot work on controller:**
  - **`NextDraftPanel.tsx:198` — `title={reachable ? \`${d.name} — ${d.terms}\` : 'Carry the reading above this one to the end first.'}`.** The depth chips render only the *number* (`:204`, `{d.depth === 0 ? 'Surface' : \`${d.depth}\`}`). **The entire meaning of a depth chip lives in a hover tooltip.** This is the worst single hover-only affordance in the app: a controller player sees "Surface 1 2 3 4 5" and no explanation of any of them. → the shared solution must fire on focus, or the terms line at `:209-211` must update live on focus (it currently only reflects `meta.depth`, i.e. the *committed* choice).
  - **The whole `canDepth` block (`:177-218`) appears/disappears** based on `hasTriumphed(meta)`. Dynamic focus set.
  - **Disabled rows are pervasive** (`:146`, `:195`) — sealed bindings and unreachable depths. The nav layer must skip them but still let the player *read* the requirement text at `:163`.
- **Layout @1280×800:** record grid (4 tiles) + 6 tall ledger rows + depth row + triumph block. Contributes ~half of the Tavern's total height. **High risk.**
- **Complexity:** **hard** — the depth-chip tooltip is a design problem, not a wiring problem
- **Focus on entry:** the currently-standing binding row (`meta.binding`), so the player sees where they are
- **Overlay:** n/a (inline panel). B/Escape → falls through to Tavern's back.
- **CSS ownership:** `web/src/components/nextDraft.css` is **used by this file only**. Safe to assign wholesale.

### 2.17 `ChronicleScreen.tsx` — `Screen: 'chronicle'`
- **File:** `web/src/components/ChronicleScreen.tsx` (219 lines) — **uses `ChronicleText.tsx`**
- **Interactive surface:** **5 tab buttons** (`:61-75`, already `role="tablist"` / `role="tab"` / `aria-selected` — the only ARIA-correct tab set in the app) + **an unbounded number of inline `chron-ref-link` buttons** generated by `ChronicleText.tsx:83` — *every generated entity name in every line of prose*, which for a full timeline is easily **100+ buttons** + Back (`:213`).
- **Cannot work on controller:**
  - **The inline entity links are the problem.** `ChronicleText.tsx:83` turns every figure/beast/artifact name inside flowing prose into a `<button>`. A D-pad walk through a paragraph of prose, stopping on each proper noun, is unusable. This needs either (a) a "links mode" toggle, (b) exclusion from the primary nav ring with a dedicated modifier, or (c) an entry-list navigation model instead of prose links.
  - `ChronicleScreen.tsx:26-38` calls `scrollIntoView` + a CSS flash on the *element*, not on focus. After a cross-tab jump the DOM scrolls but **focus stays on the link that no longer exists** (the tab changed). Focus will be lost to `<body>`.
  - Each tab body is a `.chronicle-scroll` — another scroll container. **C6.**
- **Layout @1280×800:** 5 tabs + a scrolling page. The tab bar itself is fine; the bodies are long. **High risk.**
- **Complexity:** **hard** — the prose-links model has no good controller answer without a design decision
- **Focus on entry:** the active tab button
- **Overlay:** in `backable`. B/Escape → `GOTO town`. **Also:** B should arguably return focus from the page body to the tab bar first.

### 2.18 `DeckScreen.tsx` — `Screen: 'deck'`
- **File:** `web/src/components/DeckScreen.tsx` (241 lines)
- **Interactive surface:** **1 "All" chip + 5 type chips + 4 rarity chips** (`:142-162`) + **1 text input** (`:165-172`) + **6 sort buttons + 1 Reverse** (`:175-196`) + **N card cells** (typically 20–40, `:85-104`) + Back + "Card Codex" (`:221-226`) + the `CardDetailOverlay` (§3.7). **~55–75.**
- **Cannot work on controller:**
  - **`<input type="text" className="card-search">` at `:165`.** Same OSK problem as `CreateScreen`. Less critical (search is optional) but a controller player will be walking a 40-card grid with no filter.
  - The toolbar is **three separate rows of chips** with different semantics (filter / search / sort). A D-pad grid walk over them is ambiguous.
  - **The card grid is the good news:** each cell *is* a `<button>` that opens `CardDetailOverlay` (`:90-93`), so full rules text is reachable without hover. This is the pattern `SmithScreen` and `MultiplayerScreen` should copy.
- **Layout @1280×800:** `.deck-grid-lg` of 180px cards, sectioned by source. **Long scroll. High risk.**
- **Complexity:** **hard** — 3 toolbar rows + text input + a large 2-D grid + a modal
- **Focus on entry:** the "All" chip, or the first card cell (better: first card cell, with LB/RB cycling filter chips)
- **Overlay:** in `backable`. B/Escape → `GOTO backScreen` (note: `backScreen`, `:221` — reachable from the floor).

### 2.19 `CardCodexScreen.tsx` — `Screen: 'cardCodex'`
- **File:** `web/src/components/CardCodexScreen.tsx` (159 lines)
- **Routes from:** `cardCodex`. **Reached only from `DeckScreen.tsx:224`.** ⚠️ **`cardCodex` is NOT in `App.tsx`'s `backable` list** (`App.tsx:222-225`) — this screen has no HUD Back chip, only its own Back button at `:134`.
- **Interactive surface:** **1 text input** (`:109-116`) + **every card in the game as a button** — `CARDS` has ~**206 entries**; deduped across class/race/reward/species sections this is **~200 focusable grid cells** (`:38-50`) + Back. Plus `CardDetailOverlay`.
- **Cannot work on controller:**
  - **~200 cells with no filter reachable without the text input.** This is unnavigable by D-pad in practice.
  - The `<input type="text">` at `:109` is the *only* way to reduce the set. OSK dependency again.
  - There is **no section-jump affordance** — sections are `<h2>`s (`:57-59`), not focusable.
  - Note the existing comment at `:140-147`: the author already knows this panel is much taller than the viewport and moved `CardDetailOverlay` out of `.panel` because of a containing-block interaction with `.game-main > *`'s `screenIn` transform animation (`App.css:75-88`). **Any batch touching overlays must preserve that sibling placement.**
- **Layout @1280×800:** **the tallest screen in the game by a wide margin.** Very high risk.
- **Complexity:** **hard** — needs section navigation / paging, which is a new feature
- **Focus on entry:** search input, or the first cell of the first *owned* section
- **Overlay:** B/Escape → `GOTO backScreen` (`:134`). Must be wired explicitly since the HUD chip is absent.

### 2.20 `GearScreen.tsx` — `Screen: 'equipment'` (**new, never had controller consideration**)
- **File:** `web/src/components/GearScreen.tsx` (290 lines); CSS: `sheets.css` + **`charsheet.css`** (both shared)
- **Interactive surface:** **9 paperdoll slot buttons** (`:116-144`, one per `EquipKey`) + **1 "Show all"** (`:229`) + **9 bag filter buttons** (`:235-242`) + **per bag item: Equip + Sell** (`:254`, `:257`) + **per accessory: Sell** (`:271`) + "Character sheet ▸" + Back (`:281-286`). With a 20-item bag: **~60**.
- **Cannot work on controller — THIS IS THE WORST SCREEN IN THE AUDIT:**
  - **`ItemHover` wraps everything and is 100% mouse-driven.** `GearScreen.tsx:136` (paperdoll slots), `:213` (worn rows), `:249` (bag items **with equip-compare metrics**), `:265` (accessories). `ItemHover.tsx:48` binds only `onMouseEnter` / `onMouseMove` / `onMouseLeave`, and `ItemHover.tsx:33-38` positions the tooltip from `e.clientX` / `e.clientY`. **There is no focus path, no click path, and no fixed anchor.**
  - **What is lost:** the item's rarity, material, base type, ilvl, implicits, named affixes, gold value — and critically **the equip-compare deltas** computed at `GearScreen.tsx:96-110` and rendered at `ItemHover.tsx:79-92` (`Attack 12 → 15 (+3)`, `replaces <item>`). **A controller player cannot see what equipping an item would do.** The inline `<ItemLine>` at `:252` is even called with `showAffixes={false}`.
  - `GearScreen.tsx:125` — the paperdoll slot's entire purpose ("click to sort the bag to this slot") is explained **only** in a `title`.
  - `.geq-table` (`:178-197`) is a **4-column data table**. Non-interactive, but a D-pad walk will jump over it.
  - "Sell" (`:257`, `:271`) is destructive with no confirm, adjacent to "Equip".
- **Layout @1280×800:** `.geq-layout` is 2-col (`charsheet.css:388`, `1fr 1fr`) — paperdoll + ledger table — then Worn list, then a 9-button filter row, then an unbounded bag. **Very high risk.**
- **Complexity:** **hard** — the `ItemHover` conversion is the single largest piece of work in this audit
- **Focus on entry:** the weapon paperdoll slot
- **Overlay:** in `backable`. B/Escape → `GOTO backScreen`.

### 2.21 `CharacterSheetScreen.tsx` — `Screen: 'characterSheet'` (**recently modified**)
- **File:** `web/src/components/CharacterSheetScreen.tsx` (438 lines); CSS: `sheets.css` + **`charsheet.css`**
- **Interactive surface:**
  - "📖 The Arrangement" (`:111`) → opens `codex-overlay` (`:419-435`)
  - **18 `<details>` disclosures** — 7 attribute `Ledger`s (`:174-194`) + 11 derived `Ledger`s (`:204-206`, from `statBreakdown.ts`: attack, magic, defense, magicDefense, maxHp, maxMp, crit, vigor, handSize, mov, lantern). Each `<summary>` is natively focusable and Enter-toggles. Already styled with `:focus-visible` (`charsheet.css:144`).
  - **7 `+` attribute-spend buttons** (`:182-189`) — **conditionally rendered only when `player.attributePoints > 0`**
  - "🎒 Gear & bag ▸" (`:152`), "🎒 Gear" (`:411`), Back (`:414`)
  - **2 `<details>` folds** — "Blood & Oath · Talents" (`:347`, `open`), "Party" (`:392`)
  - **N party link buttons** (`:397-405`)
  - **Plus every `<KeywordText>` glossary term** — `:65`, `:79`, `:231`, `:277`, `:300`, `:354`, `:362`, `:371`, `:383`. Each match becomes a `tabIndex={0}` span (`KeywordText.tsx:20`). **On this screen that is easily 40–80 extra focus stops.**
  - **Total: ~35 intentional controls + ~40-80 unintentional keyword stops.**
- **Cannot work on controller:**
  - **`KeywordText` (`KeywordText.tsx:13-38`) is the one component that already got this right** — it fires on `onFocus`/`onBlur` as well as hover and click. But it pollutes the tab ring badly. The nav layer needs a way to *demote* these to a secondary ring.
  - **`title`-only info:** `:120` (`byId[id].formula` — the actual formula for each headline stat, hover-only), `:129` (EXP), `:185` (`Raise ${STAT_LABEL[stat]}`).
  - **`codex-overlay` (`:419-435`) is click-outside-to-close** (`onClick={() => setCodex(false)}` on the backdrop, `stopPropagation` on the box). No Escape handler, no focus trap, no focus restore. **C4.**
  - The 2-col `.cdd-layout` (`charsheet.css:64`, `250px 1fr`) left column has one focusable child (the gear link at `:152`) buried under a lot of art.
- **Layout @1280×800:** headline tile bar + 2-col layout + 5 `<section>`s + a 4-column `.cdd-table` (`:215-258`) + 2 folds. **The longest non-codex screen. Very high risk.**
- **Complexity:** **hard** — 18 disclosures, a modal, a data table, conditional buttons, and the keyword-span explosion
- **Focus on entry:** the first `+` button if `attributePoints > 0` (that's why the player came), else the first attribute `Ledger` summary
- **Overlay:** in `backable`. B/Escape → close `codex` if open, else `GOTO backScreen`.

### 2.22 `MultiplayerScreen.tsx` — `Screen: 'multiplayer'`
- **File:** `web/src/components/MultiplayerScreen.tsx` (605 lines); CSS: `duel.css`
- **Routes from:** `multiplayer`. ⚠️ **not in `backable`** (`App.tsx:222-225`) — no HUD Back chip.
- **Four distinct phases**, each a different focus surface:
  1. **menu** (`:295-350`): 2 mode buttons (one `disabled`, `:322`) + Back = **3**
  2. **setup** (`:355-523`): **N roster beast buttons** (up to 23, `:387-411`) + **1 mirror + N rival buttons** (`:419-461`) + **~25 deck chips** (`:479-491`) + Back + "Enter the ring" = **~52**
  3. **duel** (`:576-604`): delegates entirely to `BattleStage` (§2.24) + a concede confirm overlay
  4. **verdict** (`:540-570`): 3 buttons
- **Cannot work on controller:**
  - **`MultiplayerScreen.tsx:483` — `onMouseEnter={() => setPeekCardId(g.card.id)}`.** The deck-preview card at `:494-504` is driven by hover. There *is* an `onClick` fallback on the same element (`:484`), so it is not a hard blocker — but a controller player must press A on every chip to preview, and **there is no `onFocus`**. Adding `onFocus` to `:483` is a one-line fix and makes it work perfectly.
  - `:397` — `title={noCards ? 'This beast lends no cards to your deck.' : m.personality?.instinctText}`. **The "this beast contributes nothing" warning is hover-only** (though `:405` also renders ` · no cards` inline — so partially recoverable).
  - `:514` — `title={validation.errors.join(' ')}` on the disabled "Enter the ring" button. But `:519` renders `validation.errors[0]` inline as a `.duel-hint`, so this is covered.
  - `.duel-yield` concede confirm (`:579-602`) is a `position: fixed` overlay (`duel.css:399-407`) with **no Escape handler and no focus trap**. **C4.**
  - The phase transitions (`setPhase`) completely replace the DOM. **Focus will be dropped on every phase change.**
- **Layout @1280×800:** setup phase is a 2-col grid (`duel.css:162` collapses below 900px) with two internal scroll boxes (`duel.css:253-254` `max-height:340px`, `:320-321` `max-height:176px`). **Two nested scroll containers with no keyboard path. C6. High risk.**
- **Complexity:** **hard** — 4 phases, nested scroll boxes, a fixed overlay, and it embeds the entire battle stage
- **Focus on entry:** menu → the enabled "Duel" mode button (`:310`); setup → first roster beast; verdict → "Again"
- **Overlay:** B/Escape → phase-aware: verdict → leave; setup → menu; menu → `GOTO town`; duel → open the concede confirm.

### 2.23 `FloorScreen.tsx` — `Screen: 'floor'` (**has partial gamepad support**)
- **File:** `web/src/components/FloorScreen.tsx` (569 lines); CSS: `floor.css`
- **Existing input:** keyboard WASD/arrows + Space/H (end turn) + I (items) + Escape (`:139-188`); gamepad d-pad + A (`:191-213`). `padPrev` edge-detection at `:199-207`.
- **Interactive surface:**
  - **4 topbar buttons** (`:337-360`): Items, Gear, Save, Witchwick home
  - **`LanternTurn`** end-turn button (`:531`)
  - **the entire map grid** — every revealed cell has `onClick={() => handleTileTap(x, y)}` (`:395`, `:430`, `:452`, `:474`). A floor grid is commonly 20×20+, so **up to ~400 click targets** — none of which are `<button>`s or focusable. They are `<span>`s.
  - **`MerchantMat` overlay** (`:~290-328`): up to 4 buy buttons
  - **items tray** (`:537-566`): per usable consumable, 1 "Use on hero" + 1 per party member
- **Cannot work on controller:**
  - **The map cells are not focusable at all.** This is *fine* — movement is d-pad-driven, which is the correct model. But the topbar buttons, the Lantern, the merchant mat and the items tray are **all mouse-only**: the gamepad handler at `:191-213` only maps d-pad + A(=end turn), and A is *consumed by end-turn*, so there is no button that can press "Items" or "Witchwick home".
  - **`MerchantMat` has no gamepad path at all.** Escape closes it (`:141`) on keyboard only.
  - `title`-only info: `:348` (why Witchwick is disabled — a real mechanical explanation), `:353` (what MOV means), `:430` (`click to engage`), `:474` (`A hostile can reach this tile next turn` — **threat warning, hover-only**).
  - `.map-grid` is a scroll container with camera-follow (`:225-238`). Works with d-pad movement. Not a problem.
- **Layout @1280×800:** `floor.css` has explicit breakpoints at `min-height:501px`, `min-width:781px`, and **`min-width:1200px and min-height:820px`** (`floor.css:181`). **1280×800 falls *just under* the 820px height branch** — worth verifying the tile size the Deck actually gets. **Moderate-high risk, and specifically a Deck-resolution risk.**
- **Complexity:** **hard** — needs a second input mode (cursor/menu focus) layered on top of the existing movement mode, plus overlay handling
- **Focus on entry:** none (movement mode). A shoulder button should switch to "menu mode" and focus the topbar.
- **Overlay:** not in `backable`. B/Escape → close merchant/items tray; otherwise no-op (must not leave the run).

### 2.24 `BattleScreen.tsx` / `BattleStage` — `Screen: 'battle'` (**has partial gamepad support**)
- **File:** `web/src/components/BattleScreen.tsx` (1196 lines — the largest file in the app); CSS: `battle.css` (2900 lines)
- **Also rendered by:** `MultiplayerScreen.tsx:578` (`<BattleStage view={battleView} />`). **`BattleStage` is shared between the dungeon and the duel** — any change here affects both.
- **Existing input:** keyboard 1-9 / Enter / ←→ / E / I / Escape (`:490-512`); gamepad d-pad L/R (hand), LB+d-pad-up (target), A (play), B (deselect), RB/Start (end turn) (`:515-534`).
- **Interactive surface:** up to ~8 hand slots (`:1105-1140`) + 3 pile widgets (`:583-600`, ×`draw`/`discard`/`exhaust`) + up to 4 enemy units (`:820`) + hero (`:909`) + up to 3 ally units (`:956`) + Items button (`:1149`) + Retreat/Concede (`:1154`) + `LanternTurn` (`:1176`) + items tray buttons (`:1071`, `:1085`) + mercy overlay ×2 (`:691`, `:694`) + pile-inspect Close (`:1038`). **~28 + dynamic.**
- **Cannot work on controller:**
  - **`onMouseMove` on the stage root (`:625-629`) drives the targeting line.** `targetLine` (`:604-617`) is computed from `mousePos` **or** `hoveredEnemyUid`. With a gamepad, `mousePos` is null and `hoveredEnemyUid` is null (it is only set by `onMouseEnter` at `:821-827`), so **the targeting line never renders for a gamepad user.** Gamepad targeting *works* (`targetIdx` + the `.kb-target` class at `:816`) but the primary visual feedback is missing.
  - **The gamepad map is incomplete.** No binding for: pile inspection (3 widgets), Items, Retreat/Concede, the mercy overlay's Spare/Finish, ally-aim targeting (`:909`/`:956` — self-heal onto a specific companion is **mouse-only**). The mercy overlay in particular is a **modal decision with no gamepad input at all** (`:685-700`).
  - `onTouchMove`/`onTouchEnd` (`:631-648`) use `document.elementFromPoint` — cursor-position-dependent, irrelevant for gamepad but confirms the targeting model is pointer-first.
  - Extensive `title`-only info: `:585` (pile contents), `:819` (enemy aspect name + blurb), `:911`/`:958` (aim hints), intent tooltips (`:836`, `:840`), status-tag tooltips (`:919`, `:929`).
  - `:1119` `onMouseEnter={() => sfx('cardHover')}` — audio-only, no information lost.
- **Layout @1280×800:** `.battle-stage` is capped to the available space and scrolls internally (`App.css:67-71`). The 320px sidebar is hidden in battle (`App.tsx:359-363`), so battle gets the full 1280. **Moderate risk** — 2 enemy rows + party row + hand fan at `width={200}` per card is a lot of vertical.
- **Complexity:** **hard** — biggest file, shared with the duel, and the existing gamepad support is a partial implementation that will need reworking rather than extending
- **Focus on entry:** hand slot 0 (`selectedIdx` model already exists — reuse it, do not layer DOM focus on top)
- **Overlay:** not in `backable`. B currently = deselect (`:531`). Escape (`:504-508`) clears selection + items + pile view. Mercy overlay and pile-inspect need explicit gamepad handling.

---

## 3. Shared subcomponents (⚠️ collision risk — see §4)

| Component | File | Used by | Controller status |
| --- | --- | --- | --- |
| **`ItemHover`** | `components/ItemHover.tsx` (99) | **`GearScreen` only** (`:136`, `:213`, `:249`, `:265`) | 🔴 **BROKEN.** Mouse-only (`:48`), cursor-positioned (`:33-38`). Carries equip-compare deltas nothing else shows. |
| **`KeywordText`** | `components/KeywordText.tsx` (59) | `CardDetailOverlay:72/80`, `CharacterSheetScreen` ×9 | 🟡 **Works** (`onFocus`/`onBlur` at `:23-24`) but `tabIndex={0}` on every term floods the tab ring. |
| **`CardView`** | `components/CardView.tsx` (137) | `CardRewardScreen`, `SmithScreen`, `DeckScreen`, `CardCodexScreen`, `CardDetailOverlay`, `MultiplayerScreen`, `BattleScreen` — **7 screens** | 🟡 Not focusable itself (a `<div>`); relies on the wrapping button. `onMouseMove` tilt (`:91`) is decorative. `title` on cost (`:94`), name (`:101`), type line (`:124`) — the name `title` matters at `width={128}` (see §2.7). |
| **`ItemLine`** | `components/ItemLine.tsx` (27) | `ShopScreens` ×2, `MonsterSheetScreen` ×3, `GearScreen` ×4 — **3 screens** | 🟢 Pure presentation, no interaction. Safe. |
| **`Icon`** | `components/Icon.tsx` (11) | ~15 screens | 🟢 Pure presentation. Safe. |
| **`Bars`** | `components/Bars.tsx` (21) | `PartySidebar` only | 🟢 Safe. |
| **`NpcHost`** | `components/NpcHost.tsx` (96) | `GateSelect`, `QuestBoard`, `Smith`, `ShopItems`, `ShopGear`, `Stable`, `Breeding`, `Chronicle`, `Deck`, `SaveLoad`, `CharacterSheet` — **11 screens** | 🟢 Zero interactive controls. Plays audio on mount (`:66-76`). Safe, but **it is the single most widely imported component in the app** — do not let two batches edit it. |
| **`ChronicleText`** | `components/ChronicleText.tsx` (93) | `ChronicleScreen` only (×6) | 🔴 Generates unbounded inline `<button>`s in prose (`:83`). |
| **`LanternTurn`** | `components/LanternTurn.tsx` (30) | `FloorScreen:531`, `BattleScreen:1176` | 🟢 Real `<button>` with `aria-label` (`:18`). Safe. |
| **`CardDetailOverlay`** | `components/CardDetailOverlay.tsx` (90) | `DeckScreen:230`, `CardCodexScreen:149` | 🟡 **The only overlay with an Escape handler** (`:34-35`). Still click-outside-to-close (`:42`), no focus trap, no focus restore. |
| **`StoryOverlay`** | `components/StoryOverlay.tsx` (96) | `App.tsx:365` | 🟡 1 button ("Continue", `:90`). Auto-scrolling CSS crawl (`:74-81`). No Escape. |
| **`LegendOverlay`** | `components/LegendOverlay.tsx` (67) | `App.tsx:367` | 🟡 1 button (`:31` or `:55`). No Escape. |

---

## 4. Recommended batching

Four disjoint batches. **No two batches touch the same `.tsx` or `.css` file.**

### 🔒 Batch 0 — FOUNDATION (must land first, blocks everything else)

Assign to **one agent, working alone**, before the parallel batches start.

| File | Why here |
| --- | --- |
| `web/src/App.tsx` | HUD chrome + `backable` list + `backScreen`/`monsterBackScreen`; every batch needs a working global B |
| `web/src/components/ItemHover.tsx` | Must gain a focus-triggered / anchored mode before `GearScreen` can be converted |
| `web/src/components/KeywordText.tsx` | Must gain a "demoted focus ring" opt-out before `CharacterSheetScreen` can be converted |
| `web/src/components/CardView.tsx` | Used by 7 screens across 3 batches. Any focus-ring / small-size readability change belongs here. |
| `web/src/components/NpcHost.tsx` | Imported by 11 screens across all batches |
| `web/src/components/Icon.tsx`, `Bars.tsx`, `ItemLine.tsx`, `LanternTurn.tsx` | Trivially shared; claim them now so nobody else does |
| `web/src/index.css` + a **new** shared focus-ring rule | Global `:focus-visible` — currently only 8 selectors have one |
| `web/CONTROLLER.md` | The pattern doc (already in flight) |

**Also decide in Batch 0** (these are §5's cross-cutting problems): the tooltip strategy, the modal contract, the destructive-action confirm, the scroll-region binding, and the on-screen-keyboard strategy.

---

### Batch A — "Short screens + overlays" (lowest risk, best warm-up)

Effort: ~14 controls of real complexity, 9 files.

| File | Complexity |
| --- | --- |
| `components/VictoryScreen.tsx` | trivial |
| `components/FallenScreen.tsx` | trivial |
| `components/EventScreen.tsx` | trivial |
| `components/CardRewardScreen.tsx` | trivial |
| `components/GateSelectScreen.tsx` | trivial |
| `components/StoryOverlay.tsx` | trivial |
| `components/LegendOverlay.tsx` | trivial |
| `components/CardDetailOverlay.tsx` | moderate (reference modal — do this one first, it becomes the pattern) |
| `components/SaveLoadScreen.tsx` | moderate (delete confirm + file-picker carve-out) |

**CSS owned:** none exclusively — but Batch A **may not edit `sheets.css`** (Batch C owns it). Overlay/focus-ring rules go in the Batch 0 shared file.

---

### Batch B — "Town services" (many small screens, one hub)

Effort: ~200 controls, 7 files.

| File | Complexity |
| --- | --- |
| `components/ShopScreens.tsx` | moderate (2 screens in 1 file) |
| `components/SmithScreen.tsx` | moderate |
| `components/QuestBoardScreen.tsx` | moderate |
| `components/StableScreen.tsx` | moderate |
| `components/BreedingScreen.tsx` | moderate |
| `components/TownScreen.tsx` | **hard** (nested-interactive restructure) |
| `components/CreateScreen.tsx` | **hard** (text input / OSK) |

**CSS owned exclusively by Batch B:** `web/src/services.css` (imported by `TownScreen`, `ShopScreens`, `SmithScreen`, `StableScreen`, `BreedingScreen` — and by `TavernScreen`, which is in Batch D ⚠️).

> ⚠️ **`services.css` collision:** `TavernScreen` (Batch D) also imports it. Either move
> `TavernScreen` into Batch B, or forbid Batch D from editing `services.css` and give it a
> new `tavern.css`. **Recommend the latter** — Batch D is already large.

---

### Batch C — "Sheets & gear" (the deep-information screens)

Effort: ~110 controls, 5 files. **This batch carries the hardest single conversion.**

| File | Complexity |
| --- | --- |
| `components/MonsterSheetScreen.tsx` | moderate |
| `components/CharacterSheetScreen.tsx` | **hard** (18 disclosures + modal + table + keyword flood) |
| `components/GearScreen.tsx` | **hard** (`ItemHover` — depends on Batch 0) |
| `components/DeckScreen.tsx` | **hard** (3 toolbar rows + text input + grid) |
| `components/CardCodexScreen.tsx` | **hard** (~200 cells, needs paging) |

**CSS owned exclusively by Batch C:** `web/src/sheets.css`, `web/src/charsheet.css`.

> ⚠️ **`sheets.css` collision:** also imported by `QuestBoardScreen` (B), `ChronicleScreen` (D),
> `EventScreen`/`VictoryScreen`/`FallenScreen`/`CardRewardScreen`/`SaveLoadScreen` (A). Those
> batches must not edit it.
> ⚠️ **`charsheet.css` collision:** also imported by `PartySidebar` (Batch 0). Batch 0 should
> land its `PartySidebar` work first, then hand `charsheet.css` to C.

---

### Batch D — "The stages" (combat, map, duel, chronicle, tavern)

Effort: ~150 controls, 5 files. **Every file here is `hard`.**

| File | Complexity |
| --- | --- |
| `components/TavernScreen.tsx` | hard (length; hosts NextDraftPanel) |
| `components/NextDraftPanel.tsx` | hard (depth-chip tooltips) |
| `components/ChronicleScreen.tsx` + `components/ChronicleText.tsx` | hard (prose links) |
| `components/FloorScreen.tsx` | hard (dual input mode) |
| `components/BattleScreen.tsx` | hard (largest file; shared with duel) |
| `components/MultiplayerScreen.tsx` | hard (4 phases; embeds `BattleStage`) |

**CSS owned exclusively by Batch D:** `web/src/floor.css`, `web/src/battle.css`, `web/src/duel.css`, `web/src/components/nextDraft.css`.

> ⚠️ **Internal ordering within D:** `BattleScreen.tsx` must be converted **before**
> `MultiplayerScreen.tsx`, because `MultiplayerScreen` renders `BattleStage`. Do not run
> these two in parallel even inside the same batch.
> ⚠️ `TavernScreen` needs a **new** `tavern.css` rather than editing `services.css` (Batch B).

### Files no batch may touch
`web/src/App.css`, `web/src/v5.css`, `web/src/v16.css`, `web/src/transition.css` are shared by
everything (`.panel`, `.btn`, `.overlay`, `.option-list`, `.game` grid, `.town-cast-card`,
`.codex-overlay`). **Assign all four to Batch 0.** `v5.css` in particular holds
`.codex-overlay` (`:1394`), `.town-cast-card:focus-visible` (`:555`) and `.reward-card:focus-visible`
(`:1552`) — three different batches would otherwise collide on it.

---

## Cross-cutting problems

These belong to no single screen and need one global decision each.

### C1 — `title`-attribute tooltips carry real game information in 12+ screens 🔴
Native `title` fires on hover only. It never fires on focus, and on Steam Deck with no mouse
it **never fires at all**.

Concretely load-bearing instances (not decorative):
| Location | Information lost |
| --- | --- |
| `NextDraftPanel.tsx:198` | the entire meaning of every depth chip |
| `GearScreen.tsx:125` | what a paperdoll slot click does |
| `StableScreen.tsx:28` | personality blurb + instinct text |
| `StableScreen.tsx:32` | how bond works |
| `MonsterSheetScreen.tsx:110` | elemental weakness |
| `MonsterSheetScreen.tsx:147` | how bond works |
| `MonsterSheetScreen.tsx:161` | aspect blurb |
| `FloorScreen.tsx:348` | why Witchwick is disabled |
| `FloorScreen.tsx:353` | what MOV means |
| `FloorScreen.tsx:474` | **threat warning — a hostile can reach this tile** |
| `BattleScreen.tsx:819` | enemy aspect name + blurb |
| `BattleScreen.tsx:585` | pile contents |
| `CharacterSheetScreen.tsx:120` | the formula behind each headline stat |
| `SmithScreen.tsx` (via `CardView.tsx:101`) | full card name at 128px |
| `MultiplayerScreen.tsx:397` | "this beast lends no cards" |
| `TownScreen.tsx:148` | why a service has a badge dot |

**Decision needed:** one shared `<Tooltip>` / `<InfoChip>` that fires on `focus` and `hover`
and can be summoned by a gamepad button (e.g. Y = "explain this"). Replace `title` at every
site above. `KeywordText.tsx:23-24` is the existing precedent for focus-triggered tooltips.

### C2 — `ItemHover` is the only source of equip-compare, and it is mouse-only 🔴
`ItemHover.tsx:33-38` positions from `e.clientX`/`e.clientY`; `:48` binds only mouse events.
`GearScreen.tsx:96-110` computes `Attack/Magic/Defense/M.Def/Max HP/Max MP` before-and-after
deltas plus `replaces`, rendered at `ItemHover.tsx:79-92`. **Nothing else in the app shows
these numbers.** A controller player equips blind.
**Decision needed:** an anchored (not cursor-tracked) focus-triggered variant, or a docked
"inspector" pane in `GearScreen`.

### C3 — Text inputs and the Steam Deck on-screen keyboard 🔴
Four text/file inputs exist:
- `CreateScreen.tsx:157` — **hero name, blocks starting the game** (`canBegin`, `:21`)
- `CreateScreen.tsx:156` — file import (OS picker)
- `SaveLoadScreen.tsx:129` — file import (OS picker)
- `DeckScreen.tsx:165` and `CardCodexScreen.tsx:109` — card search (the only way to filter ~200 cards)

**Decision needed:** (a) how to summon the Steam OSK (it keys off real focus events on a
text input — confirm the app's focus handling triggers it); (b) hide file import/export
behind a desktop-only check; (c) provide a non-text filter path for the codex.

### C4 — Overlays: no focus trap, no focus restore, inconsistent Escape 🟠
Eight overlay surfaces, three different behaviors:
| Overlay | Escape? | Click-outside? | Focus trap? |
| --- | --- | --- | --- |
| `CardDetailOverlay.tsx:34-42` | ✅ | ✅ | ❌ |
| `CharacterSheetScreen.tsx:419-435` (`codex-overlay`) | ❌ | ✅ | ❌ |
| `MultiplayerScreen.tsx:579-602` (`duel-yield`) | ❌ | ❌ | ❌ |
| `BattleScreen.tsx:685-700` (`mercy-overlay`) | ❌ | ❌ | ❌ (and **no gamepad input at all**) |
| `BattleScreen.tsx:1035-1058` (`pile-inspect`) | ✅ (`:507`) | ❌ | ❌ |
| `StoryOverlay.tsx` | ❌ | ❌ | ❌ |
| `LegendOverlay.tsx` | ❌ | ❌ | ❌ |
| `FloorScreen.tsx` `MerchantMat` | ✅ (`:141`) | ❌ | ❌ |

**Decision needed:** one `<Modal>` contract — trap focus, focus the primary action on open,
restore focus to the opener on close, B/Escape closes, click-outside optional. Note the
`CardCodexScreen.tsx:140-147` constraint: overlays must stay **siblings of `.panel`**, not
children, because `.game-main > *` runs a `transform` animation (`App.css:75-88`) that makes
`.panel` a containing block for `position: fixed` during the 0.28s `screenIn`.

### C5 — Destructive actions have no confirmation and sit adjacent to safe ones 🟠
| Action | Neighbour |
| --- | --- |
| `StableScreen.tsx:113` "Release" | directly right of "To party" |
| `GearScreen.tsx:257` "Sell" | directly right of "Equip" |
| `GearScreen.tsx:271` "Sell" (accessories) | only button in the row |
| `SaveLoadScreen.tsx:108` "Delete" | directly right of "Load" |
| `ShopScreens.tsx:100` "Sell" | — |
| `VictoryScreen.tsx:28` "New game" | directly right of "Keep playing" |
| `MonsterSheetScreen.tsx:38` "Remove" | — |

On a mouse this is fine. On a D-pad, one extra press right + A destroys a save or a legendary.
**Decision needed:** a shared confirm affordance (hold-to-confirm or a small modal) for
`.btn.danger`.

### C6 — Scroll containers with no keyboard/controller path 🟠
Seven independent scroll boxes, none reachable except incidentally via a focused child:
`App.css:40-58` (`.game-main`, every screen), `App.css:419-420` (`.log`, **zero focusable
children — completely unreachable**), `ChronicleScreen` `.chronicle-scroll` ×5,
`duel.css:253/320` (rival list, deck list), `floor.css:32/427` (`.map-grid`),
`App.css:753-754`, `CardCodexScreen` (~200 cells).
**Decision needed:** a right-stick / LT-RT scroll binding on the "current region", plus a
concept of which region is current.

### C7 — Nothing sets focus on entry; nothing restores it on exit 🟠
Zero `.focus()` calls exist. Every screen transition drops focus to `<body>`. Every phase
change in `MultiplayerScreen` (`setPhase`) drops focus. Every tab change in `ChronicleScreen`
drops focus. Every `<details>` toggle in `CharacterSheetScreen` changes the focus set.
**Decision needed:** the shared layer must own "focus on mount" and "restore on unmount", and
must re-resolve when the focusable set mutates (see `BreedingScreen.tsx:139`,
`NextDraftPanel.tsx:177`, `CharacterSheetScreen.tsx:182`, `GearScreen.tsx:228`).

### C8 — `:focus-visible` styling covers 8 selectors out of the whole app 🟠
`v16.css:158` (`.btn` — good, covers most things), `v5.css:555` (`.town-cast-card`),
`v5.css:1552` (`.reward-card`), `sheets.css:1117` (`.event-choice`), `sheets.css:1188`,
`charsheet.css:28-36` (`.psb-card`), `charsheet.css:144` (`.cdd-ledger-summary`),
`charsheet.css:503` (`.doll-slot`). Everything else — `.deck-chip`, `.deck-cell`, `.option-card`,
`.duel-beast`, `.duel-rival`, `.duel-chip`, `.depth-chip`, `.ledger-row`, `.draft-row`,
`.quest-note` buttons, `.stable-card-portrait`, `.chron-tab`, `.chron-ref-link`, `.hand-slot`,
`.pile-widget`, `.forge-chip`, `.sl-crystal` buttons — **focuses invisibly.**
**Decision needed:** a global `:focus-visible` fallback in Batch 0's shared CSS, then
per-component refinement.

### C9 — Nested and duplicated interactive elements 🟡
- `TownScreen.tsx:114-149` — `role="button"` div containing real `<button>`s; the div's
  `onKeyDown` (`:120`) does not check `e.target`, so Enter on a child fires both handlers.
  **Latent bug, noted not fixed.**
- `StableScreen.tsx:15` + `:41` — portrait button and "View ▸" button do the same thing.
- `CharacterSheetScreen.tsx:152` + `:411` — two "go to Gear" buttons.
- `DeckScreen.tsx:142` "All" chip duplicates `:152`/`:159` toggle-off behavior.

### C10 — Disabled controls are pervasive and often carry the explanation in a `title` 🟡
`GateSelectScreen:28`, `ShopScreens:32/76`, `SmithScreen:38/59/91`, `StableScreen:108`,
`BreedingScreen:155`, `TavernScreen:112`, `NextDraftPanel:146/195`, `SaveLoadScreen:102/105/108/121`,
`MultiplayerScreen:322/395/513`, `FloorScreen:338/346`, `BattleScreen:1150/1156`, `CreateScreen:168`,
`DeckScreen:189`, `TownScreen:170`.
A nav layer that skips `disabled` elements makes the *reason* unreachable (the reason is in
the `title`). A nav layer that stops on them creates dead ends.
**Decision needed:** focusable-but-not-activatable, with the reason surfaced by C1's tooltip.

---

## The three hardest screens

### 1. `GearScreen.tsx` — `Screen: 'equipment'` (new, zero prior controller work)
Not the most controls, but the only screen where **the primary information is structurally
unreachable**. Every meaningful item detail — rarity, material, ilvl, implicits, named affixes,
gold value, and the entire before/after equip-compare (`:96-110` → `ItemHover.tsx:79-92`) —
lives inside a cursor-tracked mouse-only portal. The inline `<ItemLine>` is even called with
`showAffixes={false}` (`:252`). Add: 9 paperdoll slots whose purpose is explained only in a
`title` (`:125`), a 4-column data table (`:178-197`), two adjacent destructive Sell buttons
(`:257`, `:271`), a 9-button filter row, and an unbounded bag. Fixing this requires designing
a new information surface, not wiring focus.

### 2. `BattleScreen.tsx` / `BattleStage` — `Screen: 'battle'` (+ every duel)
1196 lines, 2900 lines of CSS, and it is **shared by two screens** (`MultiplayerScreen:578`).
It already has a *partial* gamepad implementation (`:515-534`) that is more likely to need
replacing than extending: it maps 7 buttons and leaves the pile widgets, Items, Retreat/Concede,
ally-aim targeting, and — critically — **the mercy overlay (`:685-700`), a modal life-or-death
decision with no gamepad input path at all** unreachable. The targeting line (`:604-617`) is
computed from `mousePos`, so the main visual feedback for aiming **never renders for a gamepad
user** even though gamepad targeting works. It is also the one screen where a conversion bug
costs the player a run.

### 3. `CharacterSheetScreen.tsx` — `Screen: 'characterSheet'` (recently rewritten)
438 lines with the densest focus surface in the app: **18 `<details>` disclosures**, 7
conditionally-rendered `+` buttons that appear and vanish with `attributePoints`, a
click-outside-only modal with no Escape (`:419-435`), a 4-column data table (`:215-258`), two
more `<details>` folds, a 2-column layout whose left column has one focusable child, and
**nine `<KeywordText>` call sites** that each expand into an unbounded number of `tabIndex={0}`
spans (`KeywordText.tsx:20`) — 40–80 extra focus stops on this one screen. Every headline
stat's formula is `title`-only (`:120`). It is the screen where "just make everything focusable"
produces the worst possible result.

*Runner-up:* `CardCodexScreen.tsx` — ~200 focusable grid cells whose only filter is a text
input. It is a *simpler* problem than the three above but has no answer that isn't a new
feature (section jumping / paging).

---

## Appendix — bugs noticed while reading (NOT fixed, per read-only constraint)

1. **`TownScreen.tsx:120-122`** — the cast card's `onKeyDown` does not check `e.target`.
   Pressing Enter while focused on a nested service `<button>` (`:139`) will fire both the
   button's `onClick` and the card's `onKeyDown`, dispatching two `GOTO`s.
2. **`ChronicleScreen.tsx:26-38`** — after a cross-tab entity jump, the target element is
   scrolled into view but the element that had focus (the link) is unmounted with the old tab.
   Focus is dropped to `<body>`.
3. **`CardCodexScreen.tsx:140-147`** — the comment asserts `.panel` "carries a resting
   transform". `App.css:75-88` animates `transform` with `animation-fill-mode: both` and a
   `to { transform: none }` keyframe, so the *resting* state is `none`. The containing-block
   hazard is real but only during the 0.28s `screenIn` animation. The sibling placement is
   still correct; the reasoning is slightly off.
4. **`GearScreen.tsx:140-143`** — an empty paperdoll slot is wrapped in
   `<span style={{ display: 'contents' }}>` purely to hold a key. `display: contents` on a
   grid item is fine here, but it means the filled and empty branches have different DOM
   depths, which a DOM-walking nav layer must tolerate.
