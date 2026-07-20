# Everdusk v5 — Playtest Response ("Weight of the World")

Paul's first real playtest verdict: systems work, but leveling/gear/history
lack PURPOSE, party lacks stakes, terminology leans on StS, and the UI reads
"web app" not "game". This addendum locks the fixes. Supersedes conflicting
lines in PLAN2.md.

## Vocabulary (de-StS'd, used EVERYWHERE: code strings, card text, UI)
- Energy → **Vigor** (already)
- Block → **Ward**
- Draw pile → **Deck**
- Discard pile → **Embers** (reshuffling = "the embers rekindle")
- Exhaust pile → **Ashes** (a card "burns to ash")
- Card rewards → **Boons**

## Enemy scaling: REMOVED (decision)
Enemy level = 1 + floor's levelBonus + jitter. NO player-level term. Gates are
fixed danger bands; leveling/gear now produce real, feelable power deltas, and
entering a deep gate early is lethal. Bosses already fixed-level.

## Leveling: slower + purposeful
- expToNext = floor(30 · level^1.6) (was level·10 — much harder).
- Attribute points per level: 6 → 3 (stats still feed card scaling).
- **Talents** — the new meaning of hero "skills": rare, automatic passives at
  fixed levels that touch the card system directly:
  - L3 Second Breath — draw +1 on the first turn of each battle
  - L6 Deep Vigor — +1 max Vigor
  - L9 First Light — your first card each battle costs 0
  - L12 Wide Grasp — hand size +1
  - L15 Killer's Eye — +10% crit chance
  The old skill-list UI on the character sheet is replaced by Talents.
  (Monster "skills" live on as the source of their cards; class learnsets no
  longer grant hero combat skills.)

## Race & class mechanical identities (beyond starting cards)
Races: Human "Adaptable" (Boons offer 4 choices) · Elf "Duskblooded" (+1 max
Vigor, max HP ×0.85) · Dwarf "Stoneward" (Ward persists between turns, hand
−1) · Orc "Bloodprice" (card damage ×1.25, healing ×0.5).
Classes: Warrior "Bladesworn" (first strike-type card each battle costs 0) ·
Mage "Attuned" (hand +1) · Thief "Fleetfoot" (flee never fails, shops 20%
cheaper) · Bard "Chorusmaster" (party cap 3, card damage ×0.85) · Knight
"Oathshield" (THE HERO takes hits before monsters — the tamer-protector).
Party cap default 2; Bard 3. Traits defined in `src/engine/data/traits.ts`.

## Party: tanks first, permadeath, names
- Enemy attacks hit LIVING PARTY MONSTERS FIRST (random among them); the hero
  is only exposed when no monsters stand (Knight inverts this).
- Monster death is PERMANENT. Fallen monsters are removed after battle, their
  cards gone, their death written into the Chronicle as a deed. Breeding is
  the replacement economy.
- Tamed monsters and hatchlings receive GENERATED PERSONAL NAMES
  (syllable-based, `src/engine/systems/naming.ts`); UI shows "Name · Species".

## Gear: scarce = meaningful
dropChanceCommon 40→10, Alpha 70→35, max ONE drop per battle (best rarity
wins), boss bonus drop removed (boss still guaranteed), gear shop stock 6→4.
Chests become the primary gear source.

## Generated history: spectacle
- Famous-beast encounters open with a full-screen LEGEND WAKES overlay: name,
  epithet, legend text, beast art — then the fight.
- Artifact recoveries get a full-screen relic reveal with the souls-style
  description. Both via `pendingLegend` state + LegendOverlay component.

## UI: "a game I would pay for"
- Full-viewport game frame (no scrolling web-page feel), letterboxed stage.
- Environmental SVG backdrops per screen (town scene; per-gate battle
  backdrops) — art agent owns `src/art/backdrops.tsx`.
- Five FULLY DISTINCT class figures (unique silhouettes/poses) — art agent
  rewrites `heroArt.tsx`. Card-back design for pile widgets.
- Pile widgets: large labeled Deck/Embers/Ashes with card-back art, live
  counts, click-to-inspect.
- Battle pacing: staggered FX playback with input lock; ghost-card fly-to-
  target on play. Smith + Deck screens wired into town.

## Verification plan
Balance agent (sonnet): headless sims re-tuned for fixed-band scaling.
Playtest agent (sonnet): plays real runs, qualitative report.
Breeding regression test: BOTH parents consumed, child distinctly named.
