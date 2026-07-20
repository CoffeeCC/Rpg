# Everdusk v8 — "The Tellings" (plan of record)

Paul's directive: knock out EVERYTHING remaining on the todo list, have Grok
redo all the art (monsters, heroes, NPCs), QC the art twice (Grok + Claude),
deploy the game to a public link, ping it to his phone.

## Deployment (the link)
GitHub Pages: vite `base: './'`, build, force-push `web/dist` to `gh-pages`
branch, enable Pages via `gh api`. Link: https://coffeecc.github.io/Rpg/

## Art pipeline (Grok CLI, see memory note grok-art-pipeline)
- All creature/hero art: painterly dark-fantasy, FULL BODY, centered,
  **on PURE BLACK background** (#000) — integrated via `<img>` with
  `mix-blend-mode: screen` so black vanishes against dark scenes.
  Monsters face LEFT (enemies stand on the right); party copies mirrored in CSS.
- Manifest `src/art/paintedMonsters.ts`: Record<speciesId, url>; component
  `MonsterImage` falls back to MonsterArt SVG when missing or size < 60px
  (map tokens stay SVG).
- Heroes: 5 classes, face RIGHT, same treatment → `paintedHeroes.ts`.
- NPCs: 9 portraits (bust, dark vignette bg is fine) → replace npcArt svg use.
- QC: after each batch, Claude Reads every image (label sanity + quality);
  then a Grok QC session reviews the files against the brief and outputs a
  verdict table. Fix/regenerate failures.
- Grok output lands in ~/.grok/sessions/<cwd-enc>/<uuid>/images/N.jpg —
  ALWAYS verify content-to-label mapping manually (Grok mislabels).

## Code items (all remaining tasks)
- **#61 MP audit → resolved by design**: MP becomes INSTINCT fuel for party
  monsters (hero MP hidden/unused for now). Water/mana consumables restore
  monster MP and become useful. Card battles otherwise unchanged.
- **#48 Personalities**: `data/personalities.ts` (mine, small):
  8 personalities (Valiant/Craven/Doting/Savage/Sly/Stoic/Bright/Dour),
  each = stat-growth bias (deriveStats mult ~±8%) + instinct action.
  MonsterInstance.personalityId rolled at creation; instincts fire in
  endTurn() BEFORE enemy actions: each living tamed party monster with
  mp >= 3 spends 3 MP and acts (Valiant: hit strongest enemy for STR*0.45;
  Savage: hit random for STR*0.55; Doting: heal weakest ally INT*0.5;
  Stoic: ward hero DEF*0.4; Craven: ward hero DEF*0.25 + self heal small;
  Sly: -STR mod on strongest enemy; Bright: +STR mod on hero; Dour: chance
  to Poison target). Bond = battlesSurvived counter; +25% instinct power at
  bond 10, +50% at 25. Party/stable screen shows personality + bond;
  ff-box tooltip includes personality.
- **#53 + #51 + charm**: ItemV2 gains slots 'ring' | 'amulet' | 'pendant' |
  'charm' (lootGen can roll jewelry at lower rate; charm only forged).
  Character.equipment adds ring1, ring2, amulet, pendant. MonsterInstance
  gains `charm: ItemV2 | null` (+stats in deriveStats). Smith gains "Forge a
  charm" (gold sink). EquipmentScreen: hover/select compare — show equipped
  vs candidate with per-stat deltas (green/red), PoE-style affix lines.
  CharacterSheet: STAT_HELP blurbs under each stat.
- **#54 per-copy smith**: Character.upgradedCards: string[] → upgradedCounts:
  Record<string, number>. buildDeck marks first N copies upgraded. Smith UI
  lists copies. Save v5.
- **#55 mercy prompt**: in playCard, when the killing blow would fell the
  LAST living enemy and !isBoss && !battle.tamerName && randInt(100) < 7:
  enemy survives at 1 HP, battle.mercy = { uid }; UI overlay ("It stops
  fighting. It lowers its head and waits for what you decide.") with
  MERCY_SPARE (joins as tame, no rename if legend) / MERCY_FINISH (victory).
- **#52 badges**: GameState.seen = { questCount, tavernChapter, claimable
  handled live }. Town buttons show dot when: availableQuests().length >
  seen.questCount; any quest complete&&!claimed; storyChapter >
  seen.tavernChapter (new dialogue). Seen updated on visiting the screen.
- **#56 controls**: FloorScreen keyboard (arrows move, Space/H hold, I items,
  Esc) + gamepad dpad move / A hold. Overlays: Enter confirm, Esc close.
- **#60 draw/discard anims**: hand deals in with stagger from deck side
  (CSS animation on .hand-slot keyed per turn), END_TURN spawns card ghosts
  flying to the Embers pile.
- **#49 Tellings (biggest)**: separate localStorage meta (not save slots):
  { telling: number, verses: number, purchased: string[] }.
  Defeat → screen 'fallen' (run summary + verses earned:
  1/level + 2/orb + 1/beast slain + 1/quest claimed this run) → RESTART
  begins Telling N+1 (create screen shows "The Nth Telling").
  Chronicler section in Tavern: spend verses on permanent boons
  (well-provisioned: +40 start gold; remembered-name: +1 boon choice;
  keeper's-oil: +1 MOV; old-scars: +10 max HP; stocked-cellar: 2 Herbs at
  start). CREATE_CHARACTER applies purchased boons. Old behavior (carried
  home, lose gold) REPLACED by real death. pendingLegend etc unchanged.
  NPC dialogue: prepend telling-aware line at tavern occasionally
  ("You again. Or someone very like you.") when telling > 1.

## Order
1. PLAN5.md (this file) ✓
2. Grok art batches in background (monsters 45 in 6 batches, heroes 5, NPCs 9)
3. Code: badges → per-copy smith → mercy → jewelry/compare/charm →
   personalities+MP → controls → anims → Tellings
4. Integrate + QC art as batches land
5. Full tests, build, deploy gh-pages, enable Pages, Telegram ping WITH LINK

## v8.1 addendum — TOTAL art sweep + fullscreen (Paul directive)
- Grok redoes ALL remaining art, orchestrating its own subagents + QC (it has
  image viewing). Staging dir: public/art/gen-staging; Grok gets write/ls/view
  + image_gen and must emit manifest.json (id -> file) — positional trust is dead.
- Card art: species cards reuse their monster painting (via SPECIES_CARDS
  lookup); unique class/race/reward/tame cards get painted 5:7 vignettes
  (no text/border). CardView gets an art layer; bigger cards (220px) with
  overlapping fan (negative margin, hover lift).
- Tiles: per-gate large seamless GROUND texture + WALL texture; rendered as
  one continuous background across the map grid (background-position per
  cell = tiles that truly work together). Feature sprites (chest, shrine,
  stairs, door, barrel, event, secret) replace map emojis.
- Icons: full set replacing UI emojis (town menu, piles, stats, buttons);
  Icon component with emoji fallback until each lands.
- Map units: painted monster images at 48px tokens; player/merchant/tamer
  sprites from Grok.
- Fullscreen: kill .game max-width (100%), battle stage fills viewport,
  map cells 48px+, panels stretch.
