# PLAN7 — UI Deep Dive: every menu to AAA (v17)

## v18 — Paul's live playtest punch list (2026-07-24, post-ship)

Agent ownership mirrors v17: A=battle files, B=floor files, C/D=everything else.
FIXED already by orchestrator: SPEND_ATTRIBUTE no-op'd on the 'equipment' screen
route (guard now accepts both; regression test added).

**A — Battle (BattleScreen/battle.css/LanternTurn/CardView):**
1. Combat log moves to a RIGHT-side vertical rail (opposite the candles); the
   bottom strip it vacates goes to the hand/deck row so cards stop covering the
   player portrait.
2. Portraits (player + enemy chip) bigger; enemy NAMEPLATES render BEHIND the
   enemy figure — z-index them above.
3. Status/buff badges must be visible on the player portrait (STR↑ etc.).
4. Items (🧪) and flee (🏃) are still emoji buttons — real labeled buttons; the
   opened items tray renders BEHIND the hand cards (z-index above hand).
5. Turns still read too fast: raise beat floor (~500-800ms), hold actor banner
   longer, brief pre-attack pause highlighting the target so "what's about to
   happen" lands.

**B — Expedition map (FloorScreen/floor.css):**
6. Lantern light leaves unlit pockets beside the walked path (4-dir BFS makes
   diagonal/corner holes; breakables block light). After BFS, also light tiles
   orthogonally+diagonally adjacent to any lit floor tile (extend the existing
   wall-face rule to all tiles); consider +1 lanternRadius.
7. Can't click the room's exit tile (fog tap-guard). Allow tapping a fogged
   tile adjacent to revealed ground (path resolves through known tiles).
8. Enemy/threat visibility gone: units + red threat tiles only show in
   CURRENTLY-lit tiles. Show units + threat on any REVEALED tile (dim units
   outside current light rather than hiding).
9. Reachable-tile highlight too subtle — make movement range obvious.
10. Layout: page must not scroll — controls become a TOP bar aligned with the
    map viewport's top edge (Items/Gear/Save/Waybrand/MOV/miniboss warning),
    REMOVE the d-pad entirely (click-to-move + WASD suffice), legend docks at
    the BOTTOM edge of the map viewport.

**C/D — Everything else:**
11. Town screen shows a wall of empty dark space (backdrop paint area too tall/
    slow to load) — tighten the vertical layout, ensure the painting fills, add
    a graceful loading state.
12. Gate select: banner cards are UNEVEN widths — uniform full-width rows,
    consistent height.
13. Hover-scroll bug: hovering buttons makes the page slowly creep downward —
    reproduce (character sheet at minimum), find the layout-shifting hover/
    animation or smooth-scroll trigger, kill it.
14. Tavern portrait grid: some NPCs still render fallback/emoji-looking
    portraits — audit PAINTED_NPCS coverage; missing paintings need Grok
    (queue ids under the art-batch task), but make the SVG fallback match the
    painted style meanwhile.


Audit source: headless screenshot harness (all 18 screens) + Paul's notes 2026-07-23.
Builds ON TOP of the v16 layer (scene backdrops, glass panels, plaque titles, HUD back
chip). Shared design tokens: gold rgba(200,162,74,*), display font var(--font-display),
panel glass rgba(17,13,10,.88), radius 10-12px, gold primary buttons.

## Ownership map (parallel agents — do NOT cross)
- **A — Battle & cards:** BattleScreen.tsx, LanternTurn.tsx, CardView.tsx,
  src/art/cardFrames.tsx, battle.css.
- **B — Expedition map:** FloorScreen.tsx, new floor.css (imported by FloorScreen).
- **C — Sheets & meta:** CharacterSheetScreen, DeckScreen, MonsterSheetScreen,
  SaveLoadScreen, ChronicleScreen, QuestBoardScreen, VictoryScreen, FallenScreen,
  EventScreen, CardRewardScreen + new sheets.css (imported by those components).
- **D — Town & services:** TownScreen, ShopScreens, SmithScreen, StableScreen,
  BreedingScreen, TavernScreen (Chronicler desk only) + new services.css.
- NOBODY edits: App.tsx, App.css, v5.css, v16.css, engine/*, package.json.

## A — Battle screen (Paul's top complaint)
1. **Energy gems are tiny.** Rebuild `.energy-gauge` as a proper vigor cluster: ~26-30px
   faceted gems (CSS radial gradients fine), lit vs spent states with glow, big numeral.
2. **Deck/pile widgets are tiny.** Piles become real stacked-card widgets (~64px wide
   card back with offset stack shadows), large count badge, label under. Deck bottom-left,
   Embers/Ashes bottom-right.
3. **Hand too small + dead stage space.** Bigger hand cards (~200px at rest), stronger fan
   arc, rise+scale on hover/selected. Spread combatants to use stage width; hero/ally
   figures larger. Keep ALL existing behavior + FX pacing untouched (presentation only).
4. **Card frame bug:** the card border ornament is visibly BROKEN at the top-right corner
   (see src/art/cardFrames.tsx — CardOrnament corner paths). Fix so all four corners
   mirror cleanly at every card size.
5. End-turn (LanternTurn) more prominent; boss bar thicker w/ segment ticks; intent chips
   larger with move name plate; ff-box unit frames cleaner (name plate + HP groove).

## A2 — Battlefield reorientation (MTG Arena reference — Paul, 2026-07-23)

Supersedes A's left/right column layout (A's pile widgets, card sizes, corner fix,
boss bar, and pacing preservation all still apply). Reference: MTG Arena battle UI.

1. **Horizontal battlefield rows.** Enemies in a TOP row facing down; party in a BOTTOM
   row above the hand, facing up. Each combatant is a "battlefield unit": painted
   figure (~150-170px), nameplate below, slim HP groove, and **status/block badges
   pinned to the figure's corners** like MTG counters (replaces the ff-box strip;
   ff-boxes' info — block, tame %, statuses, Lv — moves onto the units themselves).
2. **Dueling portraits.** Enemy portrait chip top-center (boss/pack leader art + HP
   ring/number); player portrait bottom-center above the hand (hero art + HP ring).
   Mirrors MTG's avatar-vs-avatar axis. Boss fights: boss bar merges into the top
   portrait; single huge boss stays centered in the top row.
3. **Vigor = candle rail on the LEFT edge.** One candle per max vigor, vertically
   stacked: lit flame = available, spending one extinguishes it (flame gutters out,
   smoke wisp, wax dims). Refill relights at turn start. CSS/SVG animation; big
   numeral at the rail's base. Replaces the gem cluster spec in A.1.
4. **Piles.** Draw deck bottom-LEFT at MTG deck scale (~110-120px card back, stacked
   edge, big count). Embers (discard) + Ashes (exhaust) same scale bottom-RIGHT.
5. **End turn = corner control.** LanternTurn sits in the bottom-right corner
   (MTG-style), large hit target, glows when it's your turn.
6. **Hand stays at the bottom** (bigger cards per A.3), overlapping the party row's
   baseline slightly like MTG's hand-over-battlefield.
7. Preserve EVERYTHING behavioral: targeting line + enemy refs/data-enemy-uid, aim
   click/touch flow, FX pacing + actor banners (banner now sits between the rows),
   .acting glow, popups/impacts keyed to uids, mercy overlay, pile inspect, items
   tray, keyboard/gamepad handlers, fixed-height target hint.
8. Vertical budget at 1680×960: enemy row ~190, gap/banner ~40, party row ~170,
   portraits overlap rows, hand ~250. Compact media queries for <860px height.

## B — Expedition map
1. Tiles 48→64px on desktop (keep mobile 24px block); grid framed like a war-table map
   (ornate border, corner brackets, inner shadow).
2. Controls column → real expedition panel: framed card with big MOV pips (gem style),
   styled d-pad (chunky buttons), action buttons full-width, legend as wrapped icon chips
   (not a text run). Miniboss warning as a banner strip.
3. Player tile: stronger presence (ring + soft light pool). Fog edges: soft gradient rim
   where fog meets lantern light (mask or per-cell edge class).
4. Threat tiles: pulsing red rim instead of flat fill. Reachable: soft gold breathing.

## C — Sheets & meta screens (never art-directed)
1. **CharacterSheet:** hero portrait panel left (HeroImage large, class/race, level ring,
   EXP bar), stats as attribute orbs grid right, equipment slots as gear sockets w/ icons,
   attr + points CTA prominent.
2. **DeckScreen:** responsive card grid (CardView ~180px), type/rarity filter chips,
   hover lift+zoom, count header.
3. **MonsterSheet:** portrait panel + bond/exp bars, stat orbs matching CharacterSheet,
   accessory sockets.
4. **SaveLoad:** slots as save-crystal cards (hero name, Lv, realm, timestamp), export/
   import as secondary actions.
5. **Chronicle:** tab bar styled as book tabs; entries as ledger lines w/ year pills.
6. **QuestBoard:** quests as pinned parchment notices grid (rotation ±1deg), reward line
   with gold icon, claim button prominent.
7. **Victory/Fallen:** full-bleed cinematic center block, big display type, verse lines
   staggered fade-in (CSS only), single strong CTA.
8. **EventScreen:** dramatic centered narration panel, choice buttons as large cards.
9. **CardReward:** keep 300px cards; add rarity glow behind each, "chosen" pulse.

## D — Town & services
1. **TownScreen:** bottom action row → a proper dock (grouped, larger, icons scaled,
   gates CTA visually primary). NPC card hover: portrait subtly brightens.
2. **Shops:** item rows w/ 56px icon plates, name+affix stack, price chip + Buy button
   grouped right; unaffordable rows dimmed with red price. Stock header w/ rotate hint.
3. **Smith:** section headers (Reforge / Accessories), reforge cards row keeps card art,
   charm/trinket forging as two big option plates w/ cost chips.
4. **Stable:** party + stable as portrait card grids (MonsterArt thumbs, level, family
   emoji, personality pill), move in/out buttons on-card.
5. **Breeding:** two parent sockets + result preview center, egg/heart motif, disabled
   state explains requirements.
6. **Tavern Chronicler desk:** boons as ledger rows with verse-cost chips (keep logic).

## Verification bar (every agent)
`npx tsc --noEmit` clean + `npx vitest run` 198/198 green + zero behavior changes
(presentation only; dispatch calls and props stay identical). No commits.
