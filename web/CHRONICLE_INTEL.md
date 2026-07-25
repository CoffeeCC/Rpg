# Chronicle Intel — the redaction model

*"{figure} wrote the only true account of {beast} and burned every copy but one.
The surviving copy is missing its final page."* — `loreBanks.ts:433`

That line is the mechanic. This document is how to wire it up.

`src/engine/systems/chronicleIntel.ts` turns a generated world plus the player's
knowledge into **partial intel** about a beast, relic, figure or gate: a damaged
historical record that gets less damaged the more you play. It is a pure module —
no storage, no clock, no `Math.random` (there is a test for that). It generates
nothing; `worldgen.ts` already knows every answer. This module decides what the
record *lost*.

**You do not need to read the implementation to use it.** Everything below is the
contract.

---

## 1. Quick start

```tsx
import { intelFor, knowledgeFrom, type IntelRecord } from '../engine/systems/chronicleIntel';
import { loadTellings } from '../platform/tellings';

// `ref` is exactly the ChronRef that ChronicleText already emits on click.
const knowledge = knowledgeFrom(loadTellings(), state.chronicle);
const record: IntelRecord | null = intelFor(state.world, ref, knowledge);
```

That is the whole integration. `knowledgeFrom` takes `loadTellings()` and
`state.chronicle` verbatim — it is structurally typed, tolerates `null`, and
needs **no new field in `tellings.ts`**. Nothing to add, nothing to migrate.

Call it inside a `useMemo` keyed on `[world, ref, knowledge]`. It is cheap
(pure array work, no allocation of note), but it is not free, and the result is
referentially unstable by design.

---

## 2. What comes back

```ts
interface IntelRecord {
  kind: 'beast' | 'artifact' | 'figure' | 'gate';
  id: string;
  title: string;        // "Ecchoron, That Which Waits"
  subtitle: string;     // "Yggdra Blossom · Verdant Gate"
  recovery: 0 | 1 | 2 | 3 | 4;
  condition: string;      // "Effaced" | "Fragmentary" | "Partial" | "Substantial" | "Nearly whole"
  conditionLine: string;  // in-voice description of the record's physical state
  fragments: { id: string; tier: 1|2|3|4; text: string }[];
  lacuna: { factId: string; text: string; visible: boolean } | null;
  sources: { id; label; earned; hint; earnable }[];
  next: string | null;    // in-voice hint at the cheapest unearned source
  refs: { kind; id }[];   // further click-throughs this record introduces
}
```

Everything is plain data and already sorted. **Render it in order, top to
bottom** — do not re-sort, do not filter. The ordering is the design:

1. `title` / `subtitle`
2. `conditionLine` — set this in the "damaged manuscript" style, not as a stat header
3. `fragments` in array order (already grouped tier 1 → 4, so the entry reads
   outward from its best-attested core)
4. `lacuna.text` **if and only if `lacuna.visible`** — style it as damage: struck
   through, faded, gap in the page. This is the emotional payload; give it room.
5. `next`, if non-null — the Chronicler telling you what would bring more back

### The four rules the model guarantees

- **It never lies.** Every fragment is derived from the data the engine will
  actually use when the player meets the thing. See §6.
- **Shape over numbers**, except for a handful of numbers chosen because they are
  the better sentence (the ratio a Rare is scaled by, a tame chance, a gate
  boss's level, the potency on a relic).
- **Every record keeps a hole.** Exactly one fact per subject is missing forever,
  chosen once and seeded on `(world.seed, subject.id)`.
- **Determinism.** Same world + same knowledge ⇒ byte-identical output, every
  call, in any order.

---

## 3. Recovery, and how a record improves

`recovery` is how many of five **sources** the reader has earned, capped at 4.
Four is as whole as any record gets — there is no 5, on purpose.

| Source | Earned by | Permanent? |
|---|---|---|
| `attested` | **Nothing the player does.** The world either recorded it or never did. | world-intrinsic |
| `studied` | Facing its kind / surveying its gate. Reads `ledger.species`. | across tellings |
| `charted` | The Warden at the bottom of its gate has fallen, ever. Reads `ledger.wardens`. For the **abyss**, which has no Warden, the book having been finished once (`triumphs`). | across tellings |
| `retold` | The book has been begun a 4th time. Reads `telling`. | across tellings |
| `confronted` | Slain / recovered **this telling**. Reads `ChronicleState`. | **this telling only** |

Two consequences worth designing the UI around:

- **Intel is meta-progression.** Four of the five rungs persist across deaths, so
  the Chronicle gets more legible the longer the book runs. It is a reason to
  keep playing, not a codex you read once.
- **The top rung is a trophy, not a spoiler.** `confronted` resets each telling,
  so the fullest reading of a beast's record is something you are holding
  *because you just killed it* — never something you can read beforehand. But
  killing it also permanently grants `studied` (its species enters the ledger),
  so a legend you put down stays better documented forever.

`sources[]` is built for a controller-navigable checklist: `label`, `earned`
(tick it), `hint` (in-voice instruction), and `earnable`. **Grey out or omit
rows with `earnable: false`** — those say, in voice, that they cannot be earned,
which is the point, but they must not read as a task.

**Invariant, asserted in tests:** every beast, relic and gate has at least four
earnable rungs, so any of them can be read in full through play alone whatever
worldgen rolled. Figures are the deliberate exception — a figure nothing hunted
has no `Avenged` rung and their entry stays short forever. That is intended; the
prose says so.

`next` is `null` once `recovery === 4`. Do not render a call to action then.

---

## 4. The lacuna — the most important thing to get right visually

Every subject has exactly one fact this world's copy of the book does not have,
**at any knowledge level, forever**. It is chosen once from the subject's full
fact list, seeded on `(world.seed, subject.id)`, and never moves. So:

- Two players on the same seed lose the same page.
- The same beast in a different world loses something else.
- Growing knowledge **never** changes what is missing — only whether you have
  learned enough to notice it is missing (`visible`).

`visible` is false until the reader would otherwise have earned that fact, so an
`Effaced` record does not taunt you with a gap it has not earned the right to
mention yet. Once true it never goes false again.

Sample lacuna lines, so you can judge the styling target:

> The last pages, which were the list of what it does, are gone. It is always the last pages.

> Two copies survive. Both are missing the second working laid on it, in the same place, and no one has ever accounted for that.

> Here a leaf has been cut out, cleanly, with a knife. What is gone is what it does at the end.

Do **not** render this as an error, a "locked" state, or a greyed placeholder
with a padlock. It is not content the player can unlock. It is content that is
gone. Treat it as damage to the page.

---

## 5. The click-through on a highlighted keyword

`ChronicleText` already highlights every figure, beast, artifact and gate name in
chronicle prose and emits a `ChronRef` on click. Today that only switches tabs.

**The recommendation:** keep the tab jump, and *additionally* make the entry it
lands on the intel record. `intelFor` takes that `ChronRef` unchanged:

```tsx
const record = useMemo(
  () => (world && ref ? intelFor(world, ref, knowledge) : null),
  [world, ref, knowledge],
);
```

Note `gate` refs currently render as passive highlights with no jump target
because gates have no entry page. They now have one — `gateIntel` returns the
richest record in the system, including the gate boss's real name, real level and
real moves. **Making gate names clickable is the single highest-value UI change
here** and it is what most directly answers "what stats the boss monster has, or
some of its skills".

### Controller navigation

Steam Deck is a target and there is no mouse. Constraints:

- **No hover.** Nothing in this API is designed to be revealed on hover; there is
  nothing to hide behind a cursor. Fragments are always-visible prose.
- The record is a **linear list of text blocks**. If it is a panel, it needs to be
  one focusable scroll container (`pageUp`/`pageDown` per `CONTROLLER.md`), not a
  grid of tiles.
- The only interactive elements are `refs[]` (jump to another record) and,
  optionally, the `sources[]` checklist. Both are ordinary focusable buttons in
  DOM order. `cancel` should return to the previous record — consider a small
  ref stack so B walks back through a chain of click-throughs.
- `sources[]` rows are informational; if they are not focusable that is fine, but
  they must be *readable* without focus.

---

## 6. What it will and will not tell the player

### Deliberately never revealed, at any recovery

| Withheld | Why |
|---|---|
| Any exact stat number for a beast (`STR 47`) | Shape beats numbers; asserted by test. |
| A beast's exact level or HP | **There is no true answer.** A famous beast's level is `3 + floor.spawn.levelBonus + might`, so it depends on which floor you meet it on. Stating one would be a lie. |
| Which floor a beast is on | Same reason — it substitutes for a Rare lead *anywhere* in its gate. Refusing to answer is honest. |
| The value of `might` | Given as one of three bands instead. |
| Whatever the lacuna ate | Per-world, permanent. |

### Two findings that reshaped the model

Both were caught while checking that intel could not lie, and both are now
load-bearing (and regression-tested):

1. **A famous beast does not fight from its species' `innateSkills`.**
   `cardBattle.kitFor()` hands every famous beast — and every miniboss — the
   shared `ELITE_KIT`. Intel that quoted `innateSkills` would have been wrong in
   the most useful place. It quotes `ELITE_KIT`, and a test asserts no species
   skill id ever appears in beast prose.

   Because all famous beasts share one kit, the *record* is what differs, not the
   creature: the five moves are dealt out across tiers 2/3/4 in a per-beast
   seeded order, so different worlds preserve different halves of the same truth.
   At full recovery the Chronicler remarks on the sameness himself — which is
   true, and unsettling, and free.

2. **Every `ELITE_KIT` move resolves as physical.** No `elite_*` id appears in
   `damageTypes.MOVE_ELEMENTS` and none carries a `Burned`/`Frozen` payload. So a
   famous beast can *never* land a magical blow: your MAGDEF is inert against it
   and your DEF is everything. That is the most valuable true fact in the system
   and no player could otherwise know it. It is **derived at module scope, not
   hardcoded** — give an elite move an element and the claim disappears instead
   of going quietly stale.

### Relic intel is checked against the real item

`relic.measure` quotes a number, and a test asserts that number is genuinely
present in the affixes of the `ItemV2` that `forgeArtifactItem()` will really
produce, and is genuinely the largest. `relic.resting` names a floor that
actually exists in that gate. A relic held by a beast is never *also* described
as lying on a floor. Intel that lies is worse than no intel.

---

## 7. Sample output — the same beast, cold and warm

**Recovery 0/4 — a fresh book, first telling.** The intended cold open:

```
Ecchoron, That Which Waits — Yggdra Blossom · Verdant Gate
[Effaced 0/4]
There is a name here, and a space where the rest of it was. The Chronicler has
copied the space out faithfully, on the grounds that a space is also information.
→ Face its kind. Anywhere, in any telling. The Chronicler does not need it to
  have been this one.
```

**Recovery 2/4 — a few tellings in, having met its kind:**

```
[Partial 2/4] Enough survives to plan by. Not enough to plan well.

A rooted thing, and patient the way only rooted things are. It has had longer to
become this than anything else down there.

It runs bigger than its kind runs. Not enormously. Enough that the first party to
meet it wrote the word "bigger" three separate times on one page.

Every account of it describes the same kind of harm, and there are more accounts
of this than of anything else in the entry: the physical kind. Claw, weight, and
the ground. Not one witness in four hundred years reports sorcery from it. Armour
is what saves you here. Wards will not.

It shrugs off worked arts. Two separate companies spent their whole stock of
scrolls on it and reported no change worth the ink. What finally marked it was
edged, and unmagical, and held by somebody very tired.

~~ The last pages, which were the list of what it does, are gone. It is always
   the last pages.
→ Fell the Warden at the bottom of the Verdant Gate. Any telling.
```

**Recovery 4/4 — a long book, and this one is dead.** Note that the lacuna still
holds: this record lost its *list of behaviours* forever, so the tier-2 parcel
never appears, and the surviving tier-3 and tier-4 parcels open mid-thought
("Two more behaviours…") exactly as a damaged book would:

```
[Nearly whole 4/4] As complete as this record is ever going to be. The gap that
remains will not be filled; the Chronicler has stopped looking for it, and has
written down that he stopped.

A rooted thing, and patient the way only rooted things are. ...
It runs bigger than its kind runs. ...
Every account of it describes the same kind of harm ... Armour is what saves you
here. Wards will not.
It shrugs off worked arts. ...

Two more behaviours, from a later hand and a worse copy: Feral Momentum — the
plain one. It opens with this and it keeps coming back to it. Rending Flurry —
not one blow but three, and the three add up worse than the one would have.

Fire is what the accounts keep circling back to. Twice it is set down plainly;
once it is written, struck out by a later hand, and written again underneath in
the same place.

Ice has been tried on it, by more than one party, and was each time recorded as a
waste of it.

It does not die quickly. That is the complaint in every account — not that it was
strong, but that it went on, and on, past the point where the party had planned
to be finished.

Setting aside what the Verdant Gate has since made of it, the animal underneath
was already the heaviest hitter in there.

And one last thing it does, recovered from a single surviving leaf: Crushing Blow
— it winds up first, and the winding up is the entire warning you get. It cannot
do it twice running.

The margin keeps a ratio, in the hand of somebody who liked arithmetic: twelve
parts to this, where an ordinary one of its kind is given five. Twelve to five.
Whoever wrote it did not comment further, and the Chronicler has not added
anything.

It can be taken alive. The figure in the margin — unwounded, nothing offered — is
three in a hundred, and beside it, in the same hand: checked twice.

The Chronicler has laid the records of every legend in this book side by side and
found the same five behaviours in each of them, in the same proportions. He has
written that down and added nothing to it. He would rather you did not ask.

~~ The last pages, which were the list of what it does, are gone. It is always
   the last pages.
```

**A gate at 4/4** — the record that most directly answers Paul's ask:

```
Sunken Gate — 4 descents · The Drowned Curate at the bottom

Four descents, and then whatever is keeping the bottom one. Every map in the book
agrees on the number and on nothing else.

What comes up out of it, in the order the surveys met them: Undead, Slime, Devil.

Provision accordingly. Across everything the Sunken Gate sends up, the openings
the surveys found were holy work, fire — no one opening for all of it, which is
the whole difficulty of the place.

It keeps Nhilus, the Long Regret. It is also holding onto The Orphan's Ring, The
Widow's Lantern, which is the reason most parties gave for going in.

The thing at the bottom has a name and the book gives it: The Drowned Curate. It
was finished with once already and declined. The dark did not so much make it as
fail to keep hold of it. The margin gives a number for it, and for nothing else
in this entry: 16. Everything else in this book is described. That is measured.

Its habits, as far as anyone got them down: Drowning Rite — it winds up first,
and the winding up is the entire warning you get. It cannot do it twice running.
Waterlogged Grasp — the plain one. It opens with this and it keeps coming back to
it. Tidal Chant — not one blow but three, and the three add up worse than the one
would have.

~~ Here a leaf has been cut out, cleanly, with a knife. What is gone is what it
   does at the end.
```

(The thing that leaf described is the below-50%-HP enrage. In this world, nobody
gets to read about that in advance.)

---

## 8. API surface

```ts
// Knowledge
interface ChroniclerKnowledge { tellings; speciesFaced; wardensFelled; triumphs; beastsSlain; artifactsFound }
const NO_KNOWLEDGE: ChroniclerKnowledge          // a book opened for the first time
const RETOLD_AT = 4                              // telling count that earns `retold`
function knowledgeFrom(meta, chronicle): ChroniclerKnowledge   // takes loadTellings() + state.chronicle

// Records — all return null for an id the world does not contain
function beastIntel(world, beastId, k): IntelRecord | null
function artifactIntel(world, artifactId, k): IntelRecord | null
function figureIntel(world, figureId, k): IntelRecord | null
function gateIntel(world, gateId, k): IntelRecord | null
function intelFor(world, ref: ChronRef, k): IntelRecord | null   // the click-through entry point

// Whole-book readout
function intelDigest(world, k): { recovered: number; total: number; records: IntelRecord[] }
```

`intelDigest` is there for a "how much of the book is legible" line on the
Tellings tab — `recovered / total` across every beast, relic and gate. It pairs
naturally with the existing *Species faced 12/52 · Wardens felled 2/4* readout,
and it is the single number that shows the Chronicle getting better.

---

## 9. What I'd want the Chronicle screen to do

Ranked by value per unit of work.

1. **Make gate names clickable.** They are already highlighted and already emit a
   ref; they just have no destination. `gateIntel` is the richest record in the
   system and contains the boss intel Paul asked for by name. Cheapest large win.
2. **Render `lacuna` as damage, not as a lock.** If this reads like a paywall the
   whole fiction collapses. Struck-through, faded, torn edge — anything that says
   *gone*, nothing that says *locked*.
3. **Put the `sources` checklist behind one press**, not on the entry itself. The
   entry should read as a passage from a book; the "what the Chronicler still
   lacks" list is a different register and should not sit inside the prose.
4. **Show `intelDigest` on the Tellings tab.** One line. It turns the whole system
   into visible meta-progression.
5. **A ref stack for `cancel`.** Click-throughs chain (a beast names the relic it
   carries, which names the beast that holds it); B should walk back, not exit.
6. Consider surfacing the relic record from the **Gate select screen** as a
   pre-run planning step. That is the literal thing Paul described — planning a
   run from the record. It needs no new model work; `artifactIntel` already
   answers it.

## 10. Things I did not do, and would want a decision on

- **`ChronicleState.beastsSlain` / `artifactsFound` are per-run.** That is why
  `confronted` is the impermanent rung. If a cross-telling record of *which
  specific legends have ever been put down* is ever wanted, the natural home is a
  `beasts: string[]` / `artifacts: string[]` pair on `Ledger` in
  `platform/tellings.ts`. **I did not add it** — that file is owned elsewhere and
  the model works without it, since `ledger.species` already carries the
  permanent half of the same knowledge. If it is ever added, `knowledgeFrom` is
  the only function that needs to change.
- **`LostArtifact` has no `smithId`.** The smith's name is interpolated into
  `description` as text, so `figure.hand` and `relic.hand` recover the link by
  matching the figure's full name against the description. That works, but it is
  best-effort: templates without a `{figure}` slot yield no link. A `smithId`
  field on `LostArtifact` would make it exact. It needs `types.ts`, which I do
  not own.
