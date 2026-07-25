/**
 * The Chronicler's redaction model — partial intel recovered from a damaged
 * historical record.
 *
 * `generateWorld` already knows everything: which relic waits on which floor of
 * which gate, exactly what it does, which beast holds it, how much stronger
 * that beast is than the thing the gate would otherwise have sent. None of that
 * is generated here. This module is not a data-generation problem, it is a
 * REDACTION problem: the answers exist, and the design work is deciding what
 * the record lost, and how much a player is allowed to recover.
 *
 * ---------------------------------------------------------------------------
 * THE FOUR RULES
 * ---------------------------------------------------------------------------
 *
 * 1. IT NEVER LIES. Every fragment below is derived from the data that the
 *    engine will actually use when the player finally meets the thing. Two
 *    facts fell out of that discipline during authoring and both are load
 *    bearing:
 *
 *      - A famous beast does NOT fight from its species' `innateSkills`.
 *        cardBattle.kitFor() hands every famous beast (and every miniboss)
 *        the shared ELITE_KIT. Intel that quoted innateSkills would have been
 *        a lie in the most useful place. It quotes ELITE_KIT.
 *      - Every ELITE_KIT move resolves as PHYSICAL (damageTypes.ts lists no
 *        elite_* id and none carries a Burned/Frozen payload). So a famous
 *        beast can never land a magical blow, your MAGDEF is inert against it
 *        and your DEF is everything. That is the single most valuable true
 *        thing in this system and no player could otherwise know it. It is
 *        DERIVED at module scope, not hardcoded, so if someone gives an elite
 *        move an element the claim disappears instead of going quietly stale.
 *
 *    Similarly: a beast's level depends on which floor you meet it on
 *    (game.ts and floors.ts both compute `3 + spawn.levelBonus + might`), so
 *    there is no true answer to "what level is it" and this module refuses to
 *    invent one. Its stats are compared, never quoted.
 *
 * 2. SHAPE OVER NUMBERS, EXCEPT WHERE A NUMBER IS THE BETTER SENTENCE.
 *    "Its strength is what killed them" beats "STR 47". But a handful of
 *    numbers are exact, stable and more evocative than any hedge — the ratio
 *    a Rare is scaled by (twelve parts to five), the tame chance, the gate
 *    boss's level, the potency written on a relic. Those are printed plainly
 *    and the prose treats them as arithmetic someone did in a margin.
 *
 * 3. EVERY RECORD KEEPS A HOLE. Each subject has exactly one `lacuna`: a fact
 *    that this world's copy of the book simply does not have, ever, at any
 *    knowledge level. It is chosen once, seeded on (world.seed, subject id),
 *    so it is stable forever and differs per subject and per world. The hole
 *    is the feature — it is what makes the surviving fragments feel earned
 *    rather than like a stat sheet with adjectives. Because the choice never
 *    depends on knowledge, monotonicity is guaranteed by construction: more
 *    knowledge can only ever add fragments.
 *
 * 4. IT IS PURE. Facts are built in a fixed order from a per-subject seeded
 *    RNG, independent of the knowledge state, and only filtered at the end.
 *    Same world + same knowledge => byte-identical output, every call. No
 *    Math.random, no localStorage, no clock.
 *
 * ---------------------------------------------------------------------------
 * KNOWLEDGE THAT GROWS — why these triggers
 * ---------------------------------------------------------------------------
 *
 * The meta-fiction is The Tellings: death does not reset the world, the
 * Chronicler turns the page and begins the next telling of the same story. So
 * the Chronicler is RECONSTRUCTING THE BOOK ACROSS RETELLINGS, and intel is
 * itself meta-progression. Every trigger is something the player already does,
 * and needs no new persisted field — the standing ledger in tellings.ts
 * (`species`, `wardens`, `deepest`, `triumphs`, `telling`) already carries
 * cross-telling knowledge, and `ChronicleState` carries this telling's.
 *
 *   attested   world-intrinsic. Some records were simply better kept. Nothing
 *              the player does can earn it, which is the point: it makes two
 *              beasts in the same world start at different legibility, from
 *              generated history alone.
 *   studied    its species is in the standing ledger — you have faced its KIND,
 *              in any telling, ever. Permanent. Killing a famous beast grants
 *              this forever as a side effect, which is the quiet part of the
 *              loop: a legend you put down stays better documented.
 *   charted    the Warden at the bottom of its gate has fallen, ever (for the
 *              abyss, which has no Warden: the book has been finished once).
 *              Permanent. Depth of play, not grind.
 *   retold     the book has been begun a fourth time. Pure patience. This is
 *              the one that makes an old book visibly a better book.
 *   confronted slain / recovered THIS telling. The only impermanent tier, and
 *              deliberately the top one: the fullest reading of a record is a
 *              trophy you are holding, not a spoiler you can read first.
 *
 * See web/CHRONICLE_INTEL.md for the consumption guide.
 */
import type {
  Element,
  FamousBeast,
  GateId,
  GeneratedWorld,
  LostArtifact,
  MonsterFamily,
  SpeciesDef,
  Stat,
  WorldFigure,
} from '../types';
import { GATES, GATE_ORDER } from '../data/gates';
import { FAMILY_INFO, familyWeakness, speciesById, speciesMatching } from '../data/species';
import { BOSS_KITS, ELITE_KIT, type EnemyMove } from '../data/enemyAi';
import { moveElement } from '../data/damageTypes';
import { BALANCE } from '../data/balance';
import { SeededRng } from '../random';

// ===========================================================================
// Knowledge state
// ===========================================================================

/**
 * Everything the redaction model is allowed to look at. Deliberately a plain
 * value: the caller assembles it from `loadTellings()` and `state.chronicle`,
 * and this module never touches storage itself.
 */
export interface ChroniclerKnowledge {
  /** How many times the book has been begun. `TellingsMeta.telling`. */
  tellings: number;
  /** Distinct species ever faced, across every telling. `ledger.species`. */
  speciesFaced: readonly string[];
  /** Gate ids whose Warden has ever fallen, across every telling. `ledger.wardens`. */
  wardensFelled: readonly string[];
  /** How many tellings reached the end of the book. `triumphs.length`. */
  triumphs: number;
  /** Famous beasts slain in the PRESENT telling. `ChronicleState.beastsSlain`. */
  beastsSlain: readonly string[];
  /** Artifacts recovered in the PRESENT telling. `ChronicleState.artifactsFound`. */
  artifactsFound: readonly string[];
}

/** A book opened for the first time, by someone who has done nothing yet. */
export const NO_KNOWLEDGE: ChroniclerKnowledge = {
  tellings: 1,
  speciesFaced: [],
  wardensFelled: [],
  triumphs: 0,
  beastsSlain: [],
  artifactsFound: [],
};

/** Telling count at which the `retold` source is earned. */
export const RETOLD_AT = 4;

/**
 * Adapter from the two shapes the game already has. Structurally typed on
 * purpose so the engine never imports from `platform/` — pass `loadTellings()`
 * and `state.chronicle` straight in.
 */
export function knowledgeFrom(
  meta: {
    telling?: number;
    triumphs?: readonly unknown[];
    ledger?: { species?: readonly string[]; wardens?: readonly string[] };
  } | null | undefined,
  chronicle: { beastsSlain?: readonly string[]; artifactsFound?: readonly string[] } | null | undefined,
): ChroniclerKnowledge {
  return {
    tellings: Math.max(1, Math.floor(meta?.telling ?? 1)),
    speciesFaced: meta?.ledger?.species ?? [],
    wardensFelled: meta?.ledger?.wardens ?? [],
    triumphs: meta?.triumphs?.length ?? 0,
    beastsSlain: chronicle?.beastsSlain ?? [],
    artifactsFound: chronicle?.artifactsFound ?? [],
  };
}

// ===========================================================================
// Public shapes
// ===========================================================================

export type IntelSubjectKind = 'beast' | 'artifact' | 'figure' | 'gate';

/** How much of the page survives. 4 is as whole as any record ever gets. */
export type Recovery = 0 | 1 | 2 | 3 | 4;

/** One surviving passage. `tier` is the recovery level that unlocked it. */
export interface IntelFragment {
  id: string;
  tier: 1 | 2 | 3 | 4;
  text: string;
}

/** The hole. Permanent, per-world, per-subject. */
export interface IntelLacuna {
  /** The fact id that is missing — never appears in `fragments`. */
  factId: string;
  /** Prose describing the damage, naming the shape of what is gone. */
  text: string;
  /** False until the reader knows enough to notice something is absent. */
  visible: boolean;
}

/** One way the record advances. The UI's "what the Chronicler still lacks". */
export interface IntelSource {
  id: 'attested' | 'studied' | 'charted' | 'retold' | 'confronted';
  label: string;
  earned: boolean;
  /** In-voice instruction. For `attested`, an explanation that it cannot be earned. */
  hint: string;
  /** False for `attested`: the world either recorded it or never did. */
  earnable: boolean;
}

export interface IntelRecord {
  kind: IntelSubjectKind;
  id: string;
  /** Display heading, e.g. "Vhorrun, the Hunger Below". */
  title: string;
  /** One-line classification under the heading, e.g. "Direwolf · Hollow Gate". */
  subtitle: string;
  recovery: Recovery;
  /** "Effaced" / "Fragmentary" / "Partial" / "Substantial" / "Nearly whole". */
  condition: string;
  /** In-voice description of the record's physical state. */
  conditionLine: string;
  /** Surviving passages, in authored order. Empty at recovery 0. */
  fragments: IntelFragment[];
  lacuna: IntelLacuna | null;
  sources: IntelSource[];
  /** In-voice hint at the cheapest unearned source, or null at the cap. */
  next: string | null;
  /** Cross-links the UI can turn into further click-throughs. */
  refs: { kind: IntelSubjectKind; id: string }[];
}

// ===========================================================================
// Seeded helpers
// ===========================================================================

/** FNV-1a over "<seed>:<id>" — a stable per-subject RNG seed. */
function subjectSeed(worldSeed: number, subjectId: string): number {
  let h = 0x811c9dc5 ^ (worldSeed >>> 0);
  const key = `${worldSeed}:${subjectId}`;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const NUM_WORDS = [
  'nothing', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen',
  'nineteen', 'twenty',
];

function words(n: number): string {
  return NUM_WORDS[n] ?? String(n);
}

/** Sentence-initial form of a number word. */
function Words(n: number): string {
  const w = words(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
}

/** Smallest integer ratio n:d expressing `mult` (2.4 -> 12:5). */
function ratioOf(mult: number): { n: number; d: number } {
  for (let d = 1; d <= 12; d++) {
    const n = mult * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) return { n: Math.round(n), d };
  }
  return { n: Math.round(mult * 10), d: 10 };
}

// ===========================================================================
// Prose banks
// ===========================================================================

const CONDITIONS: { label: string; line: string }[] = [
  {
    label: 'Effaced',
    line: 'There is a name here, and a space where the rest of it was. The Chronicler has copied the space out faithfully, on the grounds that a space is also information.',
  },
  {
    label: 'Fragmentary',
    line: 'Little survives, and what survives has been recopied so many times that the margin warns you to treat it as a rumour with a good pedigree.',
  },
  {
    label: 'Partial',
    line: 'Enough survives to plan by. Not enough to plan well.',
  },
  {
    label: 'Substantial',
    line: 'The account is largely whole. Where it is not whole it is at least honest about not being whole, which is rarer.',
  },
  {
    label: 'Nearly whole',
    line: 'As complete as this record is ever going to be. The gap that remains will not be filled; the Chronicler has stopped looking for it, and has written down that he stopped.',
  },
];

const LACUNA_LINES = [
  'Here a leaf has been cut out, cleanly, with a knife. What is gone is {what}.',
  'The passage on {what} is water-ruined past reading. By the spacing it was the longest passage.',
  'Someone tore out {what} and left the stub. The stub is neat. It was not done in a hurry.',
  'On {what} the record continues in a hand nobody has read for four hundred years, and the Chronicler declines to guess.',
  'Of {what} the page says only: and this, we agreed, is better not written down.',
  'The lines on {what} are struck through hard enough to open the paper — by the same hand that wrote them, in the same ink, the same afternoon.',
  'The last pages, which were {what}, are gone. It is always the last pages.',
  'Two copies survive. Both are missing {what}, in the same place, and no one has ever accounted for that.',
];

const FAMILY_NATURE: Record<MonsterFamily, string> = {
  Slime: 'It is one of the soft kinds. What it is made of does not hold a wound the way flesh does, and the accounts find that more upsetting than teeth.',
  Dragon: 'Old blood — the kind that burns, and remembers, and does not consider either of those a favour it is doing you.',
  Beast: 'Muscle and appetite, with no argument in it anywhere. There is nothing there to reason with, and the surviving accounts stop trying quite early.',
  Bird: 'It does not stay where it was struck. Every account complains of this, in nearly the same words, three centuries apart.',
  Plant: 'A rooted thing, and patient the way only rooted things are. It has had longer to become this than anything else down there.',
  Bug: 'Chitin, and numbers, and a patience that is not thinking. The distinction mattered less to the watchmen than they had hoped it would.',
  Devil: 'It is cleverer than the shape it has chosen to wear. Every surviving account was written by somebody who worked that out slightly too late.',
  Undead: 'It was finished with once already and declined. The dark did not so much make it as fail to keep hold of it.',
  Material: 'Stone that decided something, once, and has not since undecided it.',
};

const MIGHT_BANDS = [
  'It runs bigger than its kind runs. Not enormously. Enough that the first party to meet it wrote the word "bigger" three separate times on one page.',
  'Whatever the dark does to a thing, it has done to this one twice over, and the second time it took.',
  'It has stopped being an example of its kind and become an argument against the kind existing at all.',
];

/** What a stat is FOR, in the Chronicler's vocabulary. */
const STAT_GIFT: Record<Stat | 'HP' | 'MP' | 'Attack' | 'Magic' | 'Defense', string> = {
  STR: 'to put strength into the arm that holds it',
  DEF: 'to make its bearer harder to finish',
  DEX: 'to make its bearer quicker than they have any business being',
  MANA: 'to deepen the well its bearer draws from',
  MAGDEF: 'to turn the worked arts aside',
  INT: 'to sharpen whatever its bearer already knew',
  LUCK: 'to bend the small things its bearer\'s way',
  HP: 'to keep its bearer standing well past the point at which they should have stopped',
  MP: 'to deepen the well its bearer draws from',
  Attack: 'to bite deeper than the metal alone would',
  Magic: 'to carry more than the hand behind it could',
  Defense: 'to turn what is aimed at its bearer',
};

const ELEMENT_WORD: Record<Exclude<Element, 'None'>, string> = {
  Fire: 'Fire',
  Ice: 'Ice',
  Electric: 'Lightning',
  Dark: 'The dark',
  Holy: 'Holy work',
};

// ===========================================================================
// Derived truths about the engine (computed, never hardcoded)
// ===========================================================================

/**
 * Every famous beast fights from ELITE_KIT (cardBattle.kitFor). If every move
 * in that kit resolves physical, the beast can never land a magical blow — a
 * claim worth making loudly, and worth retracting automatically if someone
 * later gives an elite move an element.
 */
const ELITE_IS_ALL_PHYSICAL = ELITE_KIT.moves.every((m) => moveElement(m) === 'None');

/** Representative stat value for a species at a given level (pre-rarity). */
function statAt(species: SpeciesDef, stat: Stat, level: number): number {
  return species.baseStats[stat] + species.growth[stat] * (level - 1);
}

function hpAt(species: SpeciesDef, level: number): number {
  return species.baseHp + species.hpGrowth * (level - 1);
}

/** Every species the gate can actually spawn, across all its floors. */
function gateSpeciesPool(gateId: GateId): SpeciesDef[] {
  const seen = new Map<string, SpeciesDef>();
  for (const floor of GATES[gateId].floors) {
    for (const s of speciesMatching(floor.spawn.families, floor.spawn.tierMin, floor.spawn.tierMax)) {
      seen.set(s.id, s);
    }
  }
  return [...seen.values()];
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * The lowest level this beast can be met at anywhere in its gate. Both spawn
 * sites compute `3 + floor.spawn.levelBonus + might` (floors.ts clamps to a
 * minimum of 2, which can only raise it). Used to decide which claims are
 * guaranteed rather than merely likely.
 */
function minimumEncounterLevel(beast: FamousBeast): number {
  const bonuses = GATES[beast.gateId].floors.map((f) => f.spawn.levelBonus);
  return Math.max(2, 3 + Math.min(...bonuses) + beast.might);
}

/** The families a gate's floors can spawn, deduped in floor order. */
function gateFamilies(gateId: GateId): MonsterFamily[] {
  const out: MonsterFamily[] = [];
  for (const floor of GATES[gateId].floors) {
    for (const f of floor.spawn.families) if (!out.includes(f)) out.push(f);
  }
  return out;
}

/** How many surviving history events name this string. */
function mentions(world: GeneratedWorld, name: string): number {
  return world.events.filter((e) => e.text.includes(name)).length;
}

// ===========================================================================
// Facts
// ===========================================================================

interface Fact {
  id: string;
  tier: 1 | 2 | 3 | 4;
  text: string;
  /**
   * The shape of what is missing, for the lacuna line ("what is gone is {hole}").
   * Facts without a hole cannot be the lacuna — tier 1 facts never carry one,
   * so a record is never damaged down to nothing.
   */
  hole?: string;
  /** Cross-links this fact introduces. */
  refs?: { kind: IntelSubjectKind; id: string }[];
}

// --- one shared vocabulary for enemy kit moves --------------------------

function moveLine(move: EnemyMove): string {
  const n = move.name;
  switch (move.kind) {
    case 'attack':
      return `${n} — the plain one. It opens with this and it keeps coming back to it.`;
    case 'heavy':
      return `${n} — it winds up first, and the winding up is the entire warning you get. It cannot do it twice running.`;
    case 'multi':
      return `${n} — not one blow but ${words(move.hits ?? 2)}, and the ${words(move.hits ?? 2)} add up worse than the one would have.`;
    case 'guard':
      return `${n} — it braces. Striking a braced thing is written of, repeatedly, as a wasted turn.`;
    case 'debuff':
      return move.status
        ? `${n} — it takes something out of you before it takes anything else. ${move.status.id}, by every account that survives.`
        : `${n} — it takes something out of you before it takes anything else.`;
    case 'drain':
      return `${n} — what it takes off you, it keeps.`;
    case 'buff':
      return `${n} — partway through the fighting it makes itself worse to fight.`;
  }
}

// --- beast ---------------------------------------------------------------

function beastFacts(world: GeneratedWorld, beast: FamousBeast, rng: SeededRng): Fact[] {
  const facts: Fact[] = [];
  const species = speciesById(beast.speciesId);
  const gate = GATES[beast.gateId];
  const level = minimumEncounterLevel(beast);
  const pool = gateSpeciesPool(beast.gateId);

  // t1 — what kind of thing it is, and how far past its kind it has gone.
  if (species) facts.push({ id: 'beast.nature', tier: 1, text: FAMILY_NATURE[species.family] });
  facts.push({
    id: 'beast.stature',
    tier: 1,
    text: MIGHT_BANDS[beast.might >= 6 ? 2 : beast.might >= 5 ? 1 : 0],
  });

  // t2 — the two things that actually decide a loadout.
  if (ELITE_IS_ALL_PHYSICAL) {
    facts.push({
      id: 'beast.hand',
      tier: 2,
      text: 'Every account of it describes the same kind of harm, and there are more accounts of this than of anything else in the entry: the physical kind. Claw, weight, and the ground. Not one witness in four hundred years reports sorcery from it. Armour is what saves you here. Wards will not.',
      hole: 'the manner of harm it does',
    });
  }
  if (species) {
    const def = statAt(species, 'DEF', level);
    const magdef = statAt(species, 'MAGDEF', level);
    facts.push({
      id: 'beast.guard',
      tier: 2,
      text:
        def > magdef * 1.15
          ? 'It is hardened against the ordinary answer. Steel was tried on it at length, by people who were good at steel, and the margin quietly recommends the other thing.'
          : magdef > def * 1.15
            ? 'It shrugs off worked arts. Two separate companies spent their whole stock of scrolls on it and reported no change worth the ink. What finally marked it was edged, and unmagical, and held by somebody very tired.'
            : 'It is evenly made, and nothing in the record favours one answer over the other. The Chronicler notes, unhelpfully, that an evenly made thing is usually the worse thing to meet.',
      hole: 'which answer it is hardened against',
    });
  }

  // t2/t3/t4 — its behaviour, dealt out in a seeded order so different worlds'
  // records preserve different halves of the same truth.
  const shuffled = [...ELITE_KIT.moves];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const t = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = t;
  }
  const parcels: { id: string; tier: 1 | 2 | 3 | 4; moves: EnemyMove[] }[] = [
    { id: 'beast.arts1', tier: 2, moves: shuffled.slice(0, 2) },
    { id: 'beast.arts2', tier: 3, moves: shuffled.slice(2, 4) },
    { id: 'beast.arts3', tier: 4, moves: shuffled.slice(4) },
  ];
  const leads = [
    'Two of its habits are attested well enough to set down:',
    'Two more behaviours, from a later hand and a worse copy:',
    'And one last thing it does, recovered from a single surviving leaf:',
  ];
  parcels.forEach((p, i) => {
    if (p.moves.length === 0) return;
    facts.push({
      id: p.id,
      tier: p.tier,
      text: `${leads[i]} ${p.moves.map(moveLine).join(' ')}`,
      hole: 'the list of what it does',
    });
  });

  // t3 — the elemental trade-off, and what it is like to outlast.
  if (species) {
    const weak = familyWeakness(species.family);
    if (weak) {
      facts.push({
        id: 'beast.frailty',
        tier: 3,
        text: `${ELEMENT_WORD[weak]} is what the accounts keep circling back to. Twice it is set down plainly; once it is written, struck out by a later hand, and written again underneath in the same place.`,
        hole: 'what it is afraid of',
      });
    }
    const resisted = (Object.entries(FAMILY_INFO[species.family].resists) as [Exclude<Element, 'None'>, number][])
      .filter(([, mult]) => mult < 1)
      .map(([el]) => ELEMENT_WORD[el]);
    if (resisted.length > 0) {
      facts.push({
        id: 'beast.ward',
        tier: 3,
        text: `${resisted.join(' and ')} has been tried on it, by more than one party, and was each time recorded as a waste of ${resisted.length > 1 ? 'both' : 'it'}.`,
        hole: 'what has already been tried on it and failed',
      });
    }
    const hp = hpAt(species, level);
    const poolHp = median(pool.map((s) => hpAt(s, level)));
    facts.push({
      id: 'beast.endurance',
      tier: 3,
      text:
        hp > poolHp * 1.15
          ? 'It does not die quickly. That is the complaint in every account — not that it was strong, but that it went on, and on, past the point where the party had planned to be finished.'
          : hp < poolHp * 0.85
            ? 'It is not built to last, and that has fooled people. Everyone it killed had noticed it was not built to last.'
            : 'Ordinary in the outlasting. Extraordinary in nearly everything else, which is a worse combination than it sounds.',
      hole: 'how long it takes to put down',
    });
    const str = statAt(species, 'STR', level);
    const poolStr = median(pool.map((s) => statAt(s, 'STR', level)));
    facts.push({
      id: 'beast.heft',
      tier: 3,
      text:
        str > poolStr * 1.1
          ? `Setting aside what the ${gate.name} has since made of it, the animal underneath was already the heaviest hitter in there.`
          : `Setting aside what the ${gate.name} has since made of it, the animal underneath is not the heaviest thing in there, and never was. That is not what makes it dangerous.`,
      hole: 'how hard the animal underneath hits',
    });
  }

  if (beast.holdsArtifactId) {
    const held = world.artifacts.find((a) => a.id === beast.holdsArtifactId);
    if (held) {
      facts.push({
        id: 'beast.burden',
        tier: 3,
        text: `Something it took is still on it: ${held.name}. Three separate parties went in for the ${held.baseType.toLowerCase()} and not one came back to say whether the story was true.`,
        hole: 'what it is carrying',
        refs: [{ kind: 'artifact', id: held.id }],
      });
    }
  }

  // t4 — the arithmetic, and the names.
  const { n, d } = ratioOf(BALANCE.rarityStatMult.Rare);
  facts.push({
    id: 'beast.multiplied',
    tier: 4,
    text: `The margin keeps a ratio, in the hand of somebody who liked arithmetic: ${words(n)} parts to this, where an ordinary one of its kind is given ${words(d)}. ${Words(n)} to ${words(d)}. Whoever wrote it did not comment further, and the Chronicler has not added anything.`,
    hole: 'the arithmetic somebody did on it',
  });

  if (species) {
    const pct = Math.max(
      BALANCE.tameMin,
      Math.min(BALANCE.tameMax, Math.round(species.tameBase * BALANCE.rarityTameMult.Rare)),
    );
    facts.push({
      id: 'beast.taking',
      tier: 4,
      text: `It can be taken alive. The figure in the margin — unwounded, nothing offered — is ${words(pct)} in a hundred, and beside it, in the same hand: checked twice.`,
      hole: 'whether it can be taken alive',
    });
  }

  const victim = world.figures.find((f) => f.slainByBeastId === beast.id);
  if (victim) {
    facts.push({
      id: 'beast.mortal',
      tier: 4,
      text: `${victim.name} ${victim.title} is the name the record sets underneath it. There was a body. There was not much of a funeral.`,
      hole: 'the name of the one it killed',
      refs: [{ kind: 'figure', id: victim.id }],
    });
  }

  if (world.beasts.length > 1) {
    facts.push({
      id: 'beast.sameness',
      tier: 4,
      text: `The Chronicler has laid the records of every legend in this book side by side and found the same ${words(ELITE_KIT.moves.length)} behaviours in each of them, in the same proportions. He has written that down and added nothing to it. He would rather you did not ask.`,
      hole: 'a note the Chronicler made comparing this entry to the others',
    });
  }

  return facts;
}

// --- artifact ------------------------------------------------------------

function artifactFacts(world: GeneratedWorld, artifact: LostArtifact, _rng: SeededRng): Fact[] {
  const facts: Fact[] = [];
  const holder = world.beasts.find((b) => b.holdsArtifactId === artifact.id);
  const gate = GATES[artifact.gateId];

  facts.push({
    id: 'relic.shape',
    tier: 1,
    text: holder
      ? `A ${artifact.baseType.toLowerCase()}, and the record is clear that it was never lost so much as taken. It is not lying in the ${gate.name}. It is being carried around it.`
      : `A ${artifact.baseType.toLowerCase()}. It went into the ${gate.name} on somebody and did not come out on them, and the ${gate.name} has kept it in one place since.`,
    refs: holder ? [{ kind: 'beast', id: holder.id }] : [],
  });

  // t2 — what it was made to do, as purpose rather than number.
  const primary = artifact.affixes[0];
  if (primary) {
    facts.push({
      id: 'relic.virtue',
      tier: 2,
      text: `It was made ${STAT_GIFT[primary.target]}. That much every copy agrees on, and the copies agree on very little else.`,
      hole: 'what it was made to do',
    });
  }
  const implicit =
    artifact.implicitAttack > 0
      ? 'It cuts. Whatever else was intended, the smith intended that first.'
      : artifact.implicitMagic > 0
        ? 'It carries. It is a channel before it is an object, and the hand holding it is the smaller half of the arrangement.'
        : artifact.implicitDefense > 0
          ? 'It turns a blow. Plainly, unglamorously, and better than the metal in it should allow.'
          : null;
  if (implicit) facts.push({ id: 'relic.edge', tier: 2, text: implicit, hole: 'what it does in a fight' });

  // t3 — the rest of the gifts.
  const secondary = artifact.affixes[1];
  if (secondary) {
    facts.push({
      id: 'relic.vigor',
      tier: 3,
      text: `There is a second working on it, ${STAT_GIFT[secondary.target]}. It is described as the quieter of the two and the one people actually noticed missing.`,
      hole: 'the second working laid on it',
    });
  }
  const tertiary = artifact.affixes[2];
  if (tertiary) {
    facts.push({
      id: 'relic.third',
      tier: 3,
      text: `And a third working, ${STAT_GIFT[tertiary.target]} — added later, by a different hand, for a reason nobody set down.`,
      hole: 'a third working, if there was ever a third',
    });
  }

  // t4 — the exact numbers, and exactly where it is.
  const strongest = artifact.affixes.reduce((a, b) => (b.amount > a.amount ? b : a), artifact.affixes[0]);
  if (strongest) {
    facts.push({
      id: 'relic.measure',
      tier: 4,
      text: `One number survives, written twice, in two different hands, on the same line — beside the working ${STAT_GIFT[strongest.target]}: ${strongest.amount}. Whatever else went, the smith wanted that much known.`,
      hole: 'the number the smith wanted known',
    });
  }
  if (!holder) {
    const ord = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth'];
    facts.push({
      id: 'relic.resting',
      tier: 4,
      text: `The depth is given, and given only once: the ${ord[artifact.floorIndex] ?? `${artifact.floorIndex + 1}th`} descent of the ${gate.name}. The sentence after it has been scraped off the vellum.`,
      hole: 'how far down it is lying',
    });
  } else {
    facts.push({
      id: 'relic.keeper',
      tier: 4,
      text: `The thing that has it is named, and named plainly, which the Chronicler observes is unusual for this book: ${holder.name}, ${holder.epithet}. You will not be finding the ${artifact.baseType.toLowerCase()} in a box.`,
      hole: 'the name of what is carrying it',
      refs: [{ kind: 'beast', id: holder.id }],
    });
  }

  const smith = world.figures.find((f) => artifact.description.includes(`${f.name} ${f.title}`));
  if (smith) {
    facts.push({
      id: 'relic.hand',
      tier: 4,
      text: `The hand that made it is known: ${smith.name} ${smith.title}. Everything else that hand made is also gone, which the Chronicler notes without drawing a conclusion from it.`,
      hole: 'the name of the hand that made it',
      refs: [{ kind: 'figure', id: smith.id }],
    });
  }

  return facts;
}

// --- figure --------------------------------------------------------------

function figureFacts(world: GeneratedWorld, figure: WorldFigure, _rng: SeededRng): Fact[] {
  const facts: Fact[] = [];
  const full = `${figure.name} ${figure.title}`;

  facts.push({
    id: 'figure.life',
    tier: 1,
    text:
      figure.diedYear === null
        ? `A ${figure.role}, born in ${figure.bornYear}. No year of death was ever entered, and the Chronicler has left the line ruled and empty rather than close it on a guess.`
        : `A ${figure.role}. ${figure.bornYear} to ${figure.diedYear} — ${words(figure.diedYear - figure.bornYear)} years, of which the book troubles itself with perhaps four.`,
  });

  facts.push({ id: 'figure.fate', tier: 2, text: figure.fate, hole: 'how they ended' });

  const mentor = world.figures.find((f) => f.id === figure.mentorId);
  const rival = world.figures.find((f) => f.id === figure.rivalId);
  if (mentor || rival) {
    const parts: string[] = [];
    if (mentor) parts.push(`They learned it from ${mentor.name} ${mentor.title}, who is not recorded as having offered.`);
    if (rival) parts.push(`They spent a good part of their life opposite ${rival.name} ${rival.title}, and the book cannot say which of them started it.`);
    facts.push({
      id: 'figure.thread',
      tier: 2,
      text: parts.join(' '),
      hole: 'who they stood beside, and against',
      refs: [
        ...(mentor ? [{ kind: 'figure' as const, id: mentor.id }] : []),
        ...(rival ? [{ kind: 'figure' as const, id: rival.id }] : []),
      ],
    });
  }

  const count = mentions(world, full);
  if (count > 1) {
    facts.push({
      id: 'figure.work',
      tier: 3,
      text: `The name appears ${words(count)} times in the surviving history, which in a book this damaged is close to being famous.`,
      hole: 'how often the name comes up elsewhere',
    });
  }

  const made = world.artifacts.filter((a) => a.description.includes(full));
  if (made.length > 0) {
    facts.push({
      id: 'figure.hand',
      tier: 3,
      text: `Their work outlasted them, which they would probably have resented: ${made.map((a) => a.name).join(', ')}.`,
      hole: 'what they left behind them',
      refs: made.map((a) => ({ kind: 'artifact' as const, id: a.id })),
    });
  }

  const slayer = world.beasts.find((b) => b.id === figure.slainByBeastId);
  if (slayer) {
    facts.push({
      id: 'figure.end',
      tier: 4,
      text: `What ended them is named: ${slayer.name}, ${slayer.epithet}. It is still down there. The Chronicler mentions this in the same tone he mentions the weather.`,
      hole: 'what ended them',
      refs: [{ kind: 'beast', id: slayer.id }],
    });
  }

  return facts;
}

// --- gate ----------------------------------------------------------------

function gateFacts(world: GeneratedWorld, gateId: GateId, rng: SeededRng): Fact[] {
  const facts: Fact[] = [];
  const gate = GATES[gateId];

  facts.push({
    id: 'gate.depth',
    tier: 1,
    text: `${Words(gate.floors.length)} descents, and then whatever is keeping the bottom one. Every map in the book agrees on the number and on nothing else.`,
  });

  facts.push({
    id: 'gate.denizens',
    tier: 2,
    text: `What comes up out of it, in the order the surveys met them: ${gateFamilies(gateId).join(', ')}.`,
    hole: 'what lives in it',
  });

  const weaknesses = [...new Set(gateFamilies(gateId).map(familyWeakness).filter((w): w is Exclude<Element, 'None'> => w !== null))];
  if (weaknesses.length > 0) {
    facts.push({
      id: 'gate.weakness',
      tier: 3,
      text: `Provision accordingly. Across everything the ${gate.name} sends up, the openings the surveys found were ${weaknesses.map((w) => ELEMENT_WORD[w].toLowerCase()).join(', ')} — no one opening for all of it, which is the whole difficulty of the place.`,
      hole: 'what to bring against the things in it',
    });
  }

  const residents = world.beasts.filter((b) => b.gateId === gateId);
  const relics = world.artifacts.filter((a) => a.gateId === gateId && !world.beasts.some((b) => b.holdsArtifactId === a.id));
  if (residents.length > 0 || relics.length > 0) {
    const parts: string[] = [];
    if (residents.length > 0) parts.push(`It keeps ${residents.map((b) => `${b.name}, ${b.epithet}`).join('; and ')}.`);
    if (relics.length > 0) parts.push(`It is also holding onto ${relics.map((a) => a.name).join(', ')}, which is the reason most parties gave for going in.`);
    facts.push({
      id: 'gate.residents',
      tier: 3,
      text: parts.join(' '),
      hole: 'what it is keeping',
      refs: [
        ...residents.map((b) => ({ kind: 'beast' as const, id: b.id })),
        ...relics.map((a) => ({ kind: 'artifact' as const, id: a.id })),
      ],
    });
  }

  // t4 — the warden at the bottom. Named, measured, and its habits listed.
  const kit = BOSS_KITS[gate.bossName];
  facts.push({
    id: 'gate.warden',
    tier: 4,
    text: `The thing at the bottom has a name and the book gives it: ${gate.bossName}. ${FAMILY_NATURE[gate.bossFamily]} The margin gives a number for it, and for nothing else in this entry: ${gate.bossLevel}. Everything else in this book is described. That is measured.`,
    hole: 'the name of the thing at the bottom',
  });
  if (kit) {
    const ordinary = kit.moves.filter((m) => m.belowHpPct === undefined);
    const enrage = kit.moves.filter((m) => m.belowHpPct !== undefined);
    const shown = [...ordinary];
    for (let i = shown.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      const t = shown[i];
      shown[i] = shown[j];
      shown[j] = t;
    }
    facts.push({
      id: 'gate.wardenArts',
      tier: 4,
      text: `Its habits, as far as anyone got them down: ${shown.slice(0, 3).map(moveLine).join(' ')}`,
      hole: 'the habits of the thing at the bottom',
    });
    if (enrage.length > 0) {
      facts.push({
        id: 'gate.wardenTurn',
        tier: 4,
        text: `And there is a thing it does only once it is dying, which is why so few accounts of it are firsthand. ${enrage.map(moveLine).join(' ')} Half. Every account that gives a threshold gives the same one: half.`,
        hole: 'what it does at the end',
      });
    }
  }

  return facts;
}

// ===========================================================================
// Sources & recovery
// ===========================================================================

function charted(gateId: GateId, k: ChroniclerKnowledge): boolean {
  // The abyss has no Warden of its own — its bottom IS the end of the book.
  return gateId === 'abyss' ? k.triumphs > 0 : k.wardensFelled.includes(gateId);
}

function chartedHint(gateId: GateId): string {
  return gateId === 'abyss'
    ? 'Read the book through to its end, once. The abyss keeps no Warden; it keeps the ending.'
    : `Fell the Warden at the bottom of the ${GATES[gateId].name}. Any telling. It only has to have happened.`;
}

function source(
  id: IntelSource['id'],
  label: string,
  earned: boolean,
  hint: string,
  earnable = true,
): IntelSource {
  return { id, label, earned, hint, earnable };
}

const RETOLD_HINT = `Begin the book a ${['', 'first', 'second', 'third', 'fourth', 'fifth'][RETOLD_AT] ?? `${RETOLD_AT}th`} time. Some of this only comes back with rereading.`;

function beastSources(world: GeneratedWorld, beast: FamousBeast, k: ChroniclerKnowledge): IntelSource[] {
  return [
    source(
      'attested',
      'Attested',
      world.figures.some((f) => f.slainByBeastId === beast.id),
      'Someone the histories bothered to name died to it, and somebody else wrote that down. Nothing you do can add this. The record either has it or never did.',
      false,
    ),
    source('studied', 'Recognised', k.speciesFaced.includes(beast.speciesId), 'Face its kind. Anywhere, in any telling. The Chronicler does not need it to have been this one.'),
    source('charted', 'Charted', charted(beast.gateId, k), chartedHint(beast.gateId)),
    source('retold', 'Retold', k.tellings >= RETOLD_AT, RETOLD_HINT),
    source('confronted', 'Confronted', k.beastsSlain.includes(beast.id), 'Kill it. This telling. The page will not keep — but what you learn of its kind will.'),
  ];
}

function artifactSources(world: GeneratedWorld, artifact: LostArtifact, k: ChroniclerKnowledge): IntelSource[] {
  const heldByBeast = world.beasts.some((b) => b.holdsArtifactId === artifact.id);
  return [
    source(
      'attested',
      'Attested',
      !heldByBeast,
      'Its loss was written down at the time by somebody who saw it. A thing taken off a corpse by something with teeth gets no such entry. Nothing you do can add this.',
      false,
    ),
    // Earnable on purpose. `attested` is already world-intrinsic, and a relic
    // whose ceiling was ALSO set by worldgen luck could never be read in full
    // however well the player played — which is exactly the kind of reward
    // gated behind something the game cannot produce that this codebase has
    // been bitten by before. Every relic can reach four through play.
    source(
      'studied',
      'Surveyed',
      gateSpeciesPool(artifact.gateId).some((s) => k.speciesFaced.includes(s.id)),
      `Go into the ${GATES[artifact.gateId].name} and face what lives there. Expeditions that come back are how a rumour becomes a second account.`,
    ),
    source('charted', 'Charted', charted(artifact.gateId, k), chartedHint(artifact.gateId)),
    source('retold', 'Retold', k.tellings >= RETOLD_AT, RETOLD_HINT),
    source('confronted', 'Handled', k.artifactsFound.includes(artifact.id), 'Put your hands on it. This telling. Nothing in a book is worth what one afternoon of holding the thing is worth.'),
  ];
}

function figureSources(world: GeneratedWorld, figure: WorldFigure, k: ChroniclerKnowledge): IntelSource[] {
  return [
    source('attested', 'Attested', figure.diedYear !== null, 'A year of death, entered by someone at the time. Without one the entry stays open, and an open entry is a thin entry. Nothing you do can add this.', false),
    source('studied', 'Corroborated', mentions(world, `${figure.name} ${figure.title}`) > 1, 'The name has to appear in more than one surviving event.'),
    // A figure nothing hunted has no vengeance available, so this rung is
    // marked unearnable rather than offered as an errand that cannot be run.
    // Such an entry simply never reaches four, which is the honest outcome:
    // some lives left less behind them than others.
    source(
      'charted',
      'Avenged',
      figure.slainByBeastId !== undefined && k.beastsSlain.includes(figure.slainByBeastId),
      figure.slainByBeastId
        ? 'Put down the thing that ended them. This telling.'
        : 'Nothing this book can name killed them, so there is nothing here to settle, and this entry will stay short.',
      figure.slainByBeastId !== undefined,
    ),
    source('retold', 'Retold', k.tellings >= RETOLD_AT, RETOLD_HINT),
    source('confronted', 'Attended', k.triumphs > 0, 'Read the book to its end, once. The Chronicler is more forthcoming about the dead with someone who finished.'),
  ];
}

function gateSources(world: GeneratedWorld, gateId: GateId, k: ChroniclerKnowledge): IntelSource[] {
  const pool = gateSpeciesPool(gateId).map((s) => s.id);
  return [
    source('attested', 'Attested', true, 'A gate is not a secret. Everyone has always known where they are. That was never the difficult part.', false),
    source('studied', 'Surveyed', pool.some((id) => k.speciesFaced.includes(id)), 'Face something that lives in it and come back out.'),
    source('charted', 'Charted', charted(gateId, k), chartedHint(gateId)),
    source('retold', 'Retold', k.tellings >= RETOLD_AT, RETOLD_HINT),
    source('confronted', 'Sounded', world.beasts.filter((b) => b.gateId === gateId).some((b) => k.beastsSlain.includes(b.id)) || charted(gateId, k), 'Put down one of the legends it keeps. This telling.'),
  ];
}

function recoveryOf(sources: IntelSource[]): Recovery {
  const earned = sources.filter((s) => s.earned).length;
  return Math.max(0, Math.min(4, earned)) as Recovery;
}

// ===========================================================================
// Assembly
// ===========================================================================

function assemble(
  kind: IntelSubjectKind,
  id: string,
  title: string,
  subtitle: string,
  facts: Fact[],
  sources: IntelSource[],
  rng: SeededRng,
): IntelRecord {
  const recovery = recoveryOf(sources);

  // The hole: chosen once from the FULL fact list, never from the visible
  // subset, so it cannot move as knowledge grows. Tier-1 facts are excluded
  // (they carry no `hole`), so a record is never damaged down to nothing.
  const holed = facts.filter((f) => f.hole !== undefined);
  const missing = holed.length > 0 ? holed[rng.int(holed.length)] : null;
  const lacuna: IntelLacuna | null = missing
    ? {
        factId: missing.id,
        text: LACUNA_LINES[rng.int(LACUNA_LINES.length)].replace('{what}', missing.hole as string),
        visible: recovery >= missing.tier,
      }
    : null;

  // Surviving passages read outward from the best-attested core: everything
  // tier 1 first, then tier 2, and so on. Stable within a tier, so authored
  // order still decides how a tier reads. Without this the arts parcels
  // (2/3/4) interleave with the tier-3 block and the entry reads shuffled.
  const surviving = facts.filter((f) => f.tier <= recovery && f.id !== missing?.id);
  const fragments = surviving
    .map((f, i) => ({ f, i }))
    .sort((a, b) => a.f.tier - b.f.tier || a.i - b.i)
    .map(({ f }) => ({ id: f.id, tier: f.tier, text: f.text }));

  const refSeen = new Set<string>();
  const refs: IntelRecord['refs'] = [];
  for (const f of surviving) {
    for (const r of f.refs ?? []) {
      const key = `${r.kind}:${r.id}`;
      if (refSeen.has(key)) continue;
      refSeen.add(key);
      refs.push(r);
    }
  }

  // At the cap there is nothing further to offer, even when an unearned source
  // remains — four is as whole as a record gets, and dangling a fifth errand in
  // front of a finished entry would be a lie about what it buys you.
  const nextSource = recovery >= 4 ? undefined : sources.find((s) => !s.earned && s.earnable);
  const condition = CONDITIONS[recovery];

  return {
    kind,
    id,
    title,
    subtitle,
    recovery,
    condition: condition.label,
    conditionLine: condition.line,
    fragments,
    lacuna,
    sources,
    next: nextSource ? nextSource.hint : null,
    refs,
  };
}

// ===========================================================================
// Public API
// ===========================================================================

export function beastIntel(world: GeneratedWorld, beastId: string, k: ChroniclerKnowledge): IntelRecord | null {
  const beast = world.beasts.find((b) => b.id === beastId);
  if (!beast) return null;
  const rng = new SeededRng(subjectSeed(world.seed, beast.id));
  const species = speciesById(beast.speciesId);
  return assemble(
    'beast',
    beast.id,
    `${beast.name}, ${beast.epithet}`,
    `${species?.name ?? beast.speciesId} · ${GATES[beast.gateId].name}`,
    beastFacts(world, beast, rng),
    beastSources(world, beast, k),
    rng,
  );
}

export function artifactIntel(world: GeneratedWorld, artifactId: string, k: ChroniclerKnowledge): IntelRecord | null {
  const artifact = world.artifacts.find((a) => a.id === artifactId);
  if (!artifact) return null;
  const rng = new SeededRng(subjectSeed(world.seed, artifact.id));
  return assemble(
    'artifact',
    artifact.id,
    artifact.name,
    `${artifact.baseType} · ${GATES[artifact.gateId].name}`,
    artifactFacts(world, artifact, rng),
    artifactSources(world, artifact, k),
    rng,
  );
}

export function figureIntel(world: GeneratedWorld, figureId: string, k: ChroniclerKnowledge): IntelRecord | null {
  const figure = world.figures.find((f) => f.id === figureId);
  if (!figure) return null;
  const rng = new SeededRng(subjectSeed(world.seed, figure.id));
  return assemble(
    'figure',
    figure.id,
    `${figure.name} ${figure.title}`,
    `${figure.role} · ${figure.bornYear}–${figure.diedYear ?? '?'}`,
    figureFacts(world, figure, rng),
    figureSources(world, figure, k),
    rng,
  );
}

export function gateIntel(world: GeneratedWorld, gateId: string, k: ChroniclerKnowledge): IntelRecord | null {
  if (!GATE_ORDER.includes(gateId as GateId)) return null;
  const id = gateId as GateId;
  const rng = new SeededRng(subjectSeed(world.seed, id));
  return assemble(
    'gate',
    id,
    GATES[id].name,
    `${GATES[id].floors.length} descents · ${GATES[id].bossName} at the bottom`,
    gateFacts(world, id, rng),
    gateSources(world, id, k),
    rng,
  );
}

/**
 * The click-through entry point. `ref` is exactly the `ChronRef` that
 * `ChronicleText` already emits when a highlighted keyword is pressed.
 */
export function intelFor(
  world: GeneratedWorld,
  ref: { kind: IntelSubjectKind; id: string },
  k: ChroniclerKnowledge,
): IntelRecord | null {
  switch (ref.kind) {
    case 'beast':
      return beastIntel(world, ref.id, k);
    case 'artifact':
      return artifactIntel(world, ref.id, k);
    case 'figure':
      return figureIntel(world, ref.id, k);
    case 'gate':
      return gateIntel(world, ref.id, k);
  }
}

/** Every record in the world, for a "how much of the book is legible" readout. */
export function intelDigest(
  world: GeneratedWorld,
  k: ChroniclerKnowledge,
): { recovered: number; total: number; records: IntelRecord[] } {
  const records: IntelRecord[] = [
    ...world.beasts.map((b) => beastIntel(world, b.id, k)),
    ...world.artifacts.map((a) => artifactIntel(world, a.id, k)),
    ...GATE_ORDER.map((g) => gateIntel(world, g, k)),
  ].filter((r): r is IntelRecord => r !== null);
  return {
    recovered: records.reduce((sum, r) => sum + r.recovery, 0),
    total: records.length * 4,
    records,
  };
}
