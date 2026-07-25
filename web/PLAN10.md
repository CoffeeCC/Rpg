# PLAN10 — Breeding depth: bloodlines, fusion, and a chart worth exploring

Paul, 2026-07-25: "Maybe we can just plan and flesh out the breeding then. what ideas
do you have or what can we pull from Dragon warrior monsters" … "I think a Newborn needs
to level faster than its parents to stay relevant." … "I didnt stop at 51. Thats just
where we stopped at the time. I would love to have way more."

**Status: DESIGN ONLY. Not scheduled.** The controller/Steam Deck pass (`CONTROLLER.md`)
outranks this — Paul set platform priority on 2026-07-25 and a breeding chart you cannot
navigate on a pad is worth nothing. Start this after the controller wave lands.

## Where breeding stands today

`engine/systems/breeding.ts` is 74 lines. `data/breeding.ts` is 147.

- 51 species, 9 families, tiers 1-5. Every species has art at `public/art/monsters/<id>.png`.
- Pairing → `FAMILY_MATRIX[famA][famB]` → target tier `floor((tierA+tierB)/2)+1` → random
  pick among that family's species at/below the target tier.
- `PAIR_OVERRIDES`: **12** exact-pair recipes.
- Offspring: level 1, `bonusStats = floor(a/4) + floor(b/4)` per stat, up to 3 skills
  chosen from the parents' union, both parents consumed.
- `plus = max(a.plus, b.plus) + 1`; each plus grants +4% growth (`PLUS_GROWTH_BONUS`,
  `MonsterInstance.ts:127`).

### The diagnosis

DWM2's breeding was a slot machine *with a pedigree* — three chases running at once: a
species you have never seen, a skill obtainable no other way, and a bigger + number.
Everdusk has the third weakly, the first thinly, and the second **not at all**.

Two whole axes of existing variation are ignored by breeding: **36 aspects**
(`data/aspects.ts`) and **8 personalities** (`data/personalities.ts`, growth multipliers
0.92-1.10). Neither is inherited.

---

## Workstream A — the chase (mostly data, no engine surgery)

1. **Skill fusion.** A new `SKILL_FUSIONS` table: specific skill *trios* present across
   the two parents fuse into a skill the offspring cannot obtain any other way. This is
   the single highest-leverage change — it is what makes a player run a pairing *on
   purpose* rather than shrugging at the result. Pure data plus a check in `breed()`.

2. **Aspect and personality inheritance.** Offspring inherits from a parent rather than
   rolling fresh, with a mutation chance. Personality matters more than it looks: over
   generations a *savage* line and a *doting* line diverge into genuinely different
   creatures via their growth multipliers. Note the constraint discovered during the save
   work — personality is currently picked deterministically from uid; changing that for
   bred monsters must not retroactively reroll existing ones.

3. **Wildcard recipes.** Today's 12 recipes are exact-pair lookups, undiscoverable
   without a wiki. Add a wildcard field so a recipe can read `specific species × any
   Dragon` — DWM2's actual trick, and the thing that makes the chart *findable by
   experimentation*. Target ~40 recipes.

4. **Compounding + values.** `max(a,b)+1` at a flat 4% is a treadmill: +10 takes ten
   generations for +40%. Make both parents matter, so +5 × +5 beats +5 × +0. Turns
   breeding into an investment ladder. Re-check against `balanceSim.test.ts`.

## Workstream B — Ancestral Memory (Paul's ask)

5. A bred offspring gains **heavily accelerated EXP until it reaches roughly its parents'
   average level**, then settles to normal rates. Scale the boost by + value so a deep
   line catches up faster than a first-generation cross.

   *Why:* the whole loop rests on sacrificing two grown monsters not feeling awful. The
   sting becomes a fight or two rather than a whole gate. Without this, no chart however
   deep gets used.

## Workstream C — Bloodlines (cross-telling survival)

6. **The individual dies; the line is remembered.** On death all monsters are lost — the
   roguelike tension is untouched. What persists in the Tellings book (`platform/tellings.ts`,
   localStorage `everdusk.tellings.v1`) is a **Bloodline record**: species reached, the
   line's highest + value, fused skills discovered, aspect and personality settled into.

7. **Calling up an heir.** In a later telling, summon a **level 1** monster of a species
   you have bred, carrying the line's accumulated + value and one inherited fused skill.
   Nothing else — no levels, no gear, no stats.

   *Why this shape:* no direct power carry, so runs still start hard; but investment
   compounds, so twenty tellings of breeding means heirs starting at +12 instead of +0.
   That is DWM's monster farm spread across playthroughs. And it fits the established
   fiction exactly — the Chronicler does not resurrect anything, he remembers that it
   existed and writes it into the next telling from the beginning.

   Plugs into the Standing Record added in the v21 meta work (species faced, Wardens
   felled) as a third axis: lines bred.

## Workstream D — Lineage UI

8. A pedigree view. No parent record exists anywhere in `MonsterInstance` today, so this
   needs a stored ancestry field. It is both the emotional hook ("descended from the first
   thing I ever tamed") and the legibility layer that makes A-C comprehensible. Without
   it, fusion and bloodlines are invisible systems.

## Workstream E — species expansion (separate, art-gated)

9. For a 9-family × 5-tier chart with real recipe depth, target **~120-135 species**
   (roughly 2-3 per family per tier), i.e. ~70-85 new painted monsters.

   **Data is cheap; art is the bottleneck.** `SpeciesDef` carries no art field — art
   resolves by convention from the species id. The 41 extra PNGs in
   `public/art/monsters/` are *card* illustrations mapped by `art/cardArt.ts`, NOT
   unused species art; do not mistake them for free species.

   Pipeline: Grok Build is authenticated on the TrueNAS box with `image_gen`. Generate in
   **family batches** against a locked house-style prompt — independent single generations
   hold up, but chained edits drift badly past ~5 frames. Paul reviews each family batch
   before it lands; do not commit dozens of monsters he has not seen.

## Open questions

- Is breeding intended to stay mid-run, become meta, or both? Workstream C assumes "both":
  bred in-run, remembered across tellings.
- Does the party/stable cap need raising to make a breeding stable practical?
- Should fused skills be visible in the chart before discovery, or found blind?

## Verification bar

`npx tsc --noEmit` clean, `npx vitest run` green, production build clean. Any change to
progression pace must keep `balanceSim.test.ts` honest — extend it rather than tuning
around it. Assert that no unlock can be gated behind something the game cannot produce
(precedent: three species — `yggdraBlossom`, `razorMantis`, `hiveEmpress` — exist only as
breeding results and no floor spawns them, which silently made a chase goal
uncompletable).
