# RPG v3 — "New-age Dragon Warrior Monsters 2" Design Doc

Goal: a modernized DWM2 in the browser. Hub town + multi-floor gates with grid
movement, monster taming + breeding with skill inheritance, Diablo/PoE-style
generative loot, quests + a 5-chapter main story, and a modern full-party
combat system. Placeholder art (emoji) now; sprites later. Engine stays a pure
reducer so a multiplayer server can reuse it verbatim.

## Ownership rule

- **Agents author content** (data files listed below). They never touch
  systems code, `types.ts`, `game.ts`, or UI.
- **Main session authors all systems code**, contracts, reducer, UI.
- Every data file has a typed stub with correct export names/shapes; agents
  replace stub contents but keep the exact export signatures.

## Locked design decisions

- Hero fights alongside monsters. Active party = hero + up to 2 monsters.
  Stable in town holds up to 20 more.
- Breeding consumes both parents (DWM2). Offspring: species from family
  matrix (+ special pair overrides), inherits floor(parentStat/4) from each
  parent on top of species base, `plus` = max(parent plus)+1 (each plus =
  +4% growth), player picks up to 3 skills from union(parents' skills +
  offspring innate).
- Stats are unified for heroes and monsters: STR (phys attack), DEF, DEX
  (initiative/hit/flee), MANA (MP pool), MAGDEF, INT (magic power), LUCK
  (crit/loot/tame).
- Elements: None/Fire/Ice/Bolt/Dark/Holy. Families have resist multipliers
  (0.5 resist, 1.5 weak, 1 neutral).
- Families (9): Slime, Dragon, Beast, Bird, Plant, Bug, Devil, Undead,
  Material. Each family trains a hero stat on kill (EV-style, carried over
  from v2): Slime→LUCK, Dragon→INT, Beast→STR, Bird→DEX, Plant→MANA,
  Bug→DEX, Devil→INT, Undead→MAGDEF, Material→DEF.
- Monster rarity: Common (×1), Alpha (×1.4 stats, better loot, tame ×0.6),
  Rare (×2 stats, much better loot, tame ×0.35).
- Species have tier 1–5; gates spawn by (families, tier range), never by
  species id — keeps world data decoupled from species data.
- Item rarity: Normal(white) / Magic(blue, 1–2 affixes) / Rare(yellow, 3–4
  affixes + generated two-part name) / Legendary(orange, hand-authored).
  Affix tiers gate on item level (= source monster level).
- Taming: hero-only combat action. chance = species.tameBase +
  (1 - hp/maxHp) * 45 + baitBonus, × rarity multiplier, clamped 2–90. Bait
  items add tameBonus for the encounter (Jerky +10, Sirloin +20, Prime
  Steak +35).
- Combat: commands are collected for every living party member, then ONE
  reducer dispatch resolves the whole round in DEX-based initiative order
  (all combatants interleaved). 1–3 enemies per encounter. Defend halves
  damage until next turn. Statuses: Burned/Poisoned (DoT), Stunned (skip),
  Frozen (skip + take +25%). Buffs/debuffs are timed ActiveMods.
- Defeat = carried back to town, party revived, lose 50% gold. No game-over
  screen.
- Story: 5 chapters. Beat the boss of each of 4 gates → 4 orbs → Abyssal
  Gate unlocks → final boss → epilogue + free play.
- Saves: v2 format, slots + file export/import. v1 saves rejected with a
  friendly message. Savable only in town or on a floor outside combat/event.

## File map

Contracts (main session): `src/engine/types.ts`

Agent-owned data files:
- `src/engine/data/skills.ts` — SKILLS (50+), CLASS_LEARNSETS (all 5 classes)
- `src/engine/data/species.ts` — FAMILY_INFO (all 9), SPECIES (45+)
- `src/engine/data/breeding.ts` — FAMILY_MATRIX (full 9×9), PAIR_OVERRIDES (10+)
- `src/engine/data/affixes.ts` — AFFIXES (40+), RARE_NAME_PREFIXES/SUFFIXES
- `src/engine/data/uniques.ts` — UNIQUES (8+)
- `src/engine/data/gates.ts` — GATES (5 gates, 4–5 floors each)
- `src/engine/data/events.ts` — EVENTS (12+)
- `src/engine/data/quests.ts` — QUESTS (10+ side quests)
- `src/engine/data/story.ts` — STORY (chapters 0–5)

Main-session systems:
- `src/engine/entities/Character.ts` (hero), `src/engine/entities/MonsterInstance.ts`
- `src/engine/systems/lootGen.ts`, `combat2.ts`, `breeding.ts`, `floors.ts`, `saveGame.ts`
- `src/engine/game.ts` (reducer), `src/engine/data/items.ts` (consumables/materials)
- `src/platform/browserSave.ts`, all of `src/components/`, `src/App.tsx`

Floor grid legend: `#` wall, `.` floor, `S` entrance, `>` stairs down,
`B` boss, `C` chest, `H` shrine, `E` fixed event tile. One `S` per floor;
every non-final floor has `>`; final floor of a gate has `B`.
