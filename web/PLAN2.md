# Everdusk v4 — Roguelike Deckbuilder Pivot ("The Ashen Deck")

Vision: **roguelike + DWM2 taming + DF-style generated history + Dark Souls/Elden
Ring aesthetic + Slay-the-Spire card combat.** This supersedes the command-menu
combat in PLAN.md; everything else there (town, gates, grid floors, taming,
breeding, loot, quests, story) remains and feeds the new systems.

## Card combat (the core rework)

- **Deck building**: starting deck = `CLASS_DECKS[class]` (10 cards) +
  `RACE_CARDS[race]` (2-3 signature cards) + 1 `reachOut` tame card (always).
  4 races × 5 classes = 20 starting-deck combinations.
- **Taming = deckbuilding**: while a tamed monster is ALIVE in the active
  party, its `SPECIES_CARDS[speciesId]` (1-3 cards) are shuffled into the deck.
  Monster knocked out in battle → its cards are yanked from hand/draw/discard
  immediately. Revives in town → cards return next battle.
- **Monster card scaling**: species-card effects may scale on `MSTR`/`MINT` —
  the SOURCE MONSTER's stats — so leveling/breeding monsters makes their cards
  stronger (+plus generations compound via stat growth).
- **Hero card scaling**: `STR` scales strikes, `INT` scales spells, `DEF`
  scales block cards; equipment implicits add flat amounts (loot stays vital).
- **Turn loop (StS)**: 3 energy (+1 per 12 MANA), draw 5, play any affordable
  cards, END TURN → enemies execute telegraphed **intents** (icon + number,
  StS-style), statuses tick, hero block resets at own turn start, redraw.
- **Enemy intents**: rolled from the monster's knownSkills + basic attack.
  Kinds: attack(×times)/defend/buff/debuff/heal. Always visible with numbers.
- **Party in battle**: enemies target hero (70%) or an active monster (30%).
  Hero block only protects hero. Monster at 0 HP = KO'd (not dead permanently).
- **Card rewards (roguelike layer)**: after each victory mid-expedition, pick
  1 of 3 from `REWARD_POOLS` (or skip). Reward cards last only for the current
  expedition. Base deck + monster cards persist between runs.
- **Consumables**: usable from an Items drawer in battle (free action). Bait
  raises tame chance; `reachOut` card attempts the tame (uses existing
  tameChancePercent).
- **Flee**: dedicated button, DEX-based chance, enemies act on failure.

## DF-style generated world history

Seeded per save (`worldSeed`, mulberry32). Generated once at CREATE_CHARACTER:
- World name + 3-5 named eras spanning ~900 years.
- 14-20 historical figures (roles, deeds, fates) woven into 40-60 timeline events.
- 4-6 **famous beasts** (named, epitheted, tier 3-5 species) haunting specific
  gates. A Rare wild spawn in that gate becomes the beast (boosted stats,
  guaranteed treasure). Slaying it is recorded in the Chronicle with your name.
- 5-8 **lost artifacts**: real Legendary items with souls-style descriptions,
  hidden at {gate, floor} (35% chance per chest there, once) or held by a beast.
- **Chronicle screen** (legends mode): eras timeline, figures, beasts, artifacts,
  and the player's own deeds appended as new history events.
- **Tavern**: NPCs (static roster + generated flavor) with rotating dialogue;
  rumor lines hint at real artifact/beast locations. Dialogue reacts to story
  chapter.

## Aesthetic (Dark Souls / Elden Ring)

- Palette: cold ash blacks (#0a0a0c), desaturated Elden gold (#c9a227), ember
  orange (#b3541e), bone-white text, fog gradients, thin filigree borders,
  ◆ diamond ornaments. Fonts: Cinzel (display) + Cormorant Garamond (body).
- Souls flourishes: wide thin boss health bar with name, "victory/death"
  full-stage serif banners (fade-in letterspaced), grace-like shrine glow,
  item descriptions written like Souls flavor text.
- **Battle stage**: enemies as LARGE procedural SVG art (per-family silhouette
  components with per-species palettes — no external assets), hero + party
  monsters at left, hand fanned at bottom with hover lift/scale, energy orb,
  draw/discard piles, ornate End Turn.
- **Feedback**: card fly-to-target, damage number popups, hit flashes, screen
  shake, slash/fire/frost CSS effects driven by a typed `FxEvent[]` queue the
  reducer emits per action (UI consumes; not saved). WebAudio-synthesized SFX
  (no asset files): card whoosh, slash, spell, block, hurt, victory sting;
  mute toggle.
- **Input**: full mouse + keyboard (1-9 play card, arrows cycle targets, Enter
  confirm, E end turn, Esc cancel); basic Gamepad API mapping.

## Events

- Pool expanded to 30+ (dedicated agent), tone: souls-flavored dark fantasy,
  more variety (moral dilemmas, shrines, merchants, curses, blessings).
- Trigger chance LOWERED: 8% → 5% per step.

## Ownership (agents never touch systems code)

Orchestrator agent manages content workers:
- W-cards: `src/engine/data/cards.ts` (+test) — ~200 cards, all pools total.
- W-art: `src/art/monsterArt.tsx`, `src/art/heroArt.tsx`, `src/art/cardFrames.tsx` (+test)
- W-sfx: `src/platform/sfx.ts`
- W-events: `src/engine/data/events.ts` (owns; expand to 30+)
- W-lore: `src/engine/data/loreBanks.ts`, `src/engine/data/npcs.ts` (+test)

Main session owns: `types.ts`, all `engine/systems/*`, `game.ts`, saves, all
components/CSS, integration + verification.

## Save v3

Version bump. Adds worldSeed, world, chronicle progress, deck extras. v2 saves
rejected politely.
