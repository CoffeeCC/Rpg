// ---------------------------------------------------------------------------
// The Next Draft: Bindings and Depths.
//
// The Tellings gave Everdusk a meta-loop that survived death but never changed
// the SHAPE of a run — every boon was a flat numeric bump, so the eighth
// telling played exactly like the second, only stronger. This file is the
// other half: a premise the Chronicler writes into the next draft before you
// begin it (a Binding), and, once the Hollow Sovereign has fallen at least
// once, how far down the book is willing to be read again (a Depth).
//
// Bindings and Depths are inscribed at the Chronicler's Desk and stored in the
// Tellings meta (src/platform/tellings.ts). They are read exactly once, at
// CREATE_CHARACTER, and copied onto GameState so the reducer stays pure and a
// run's premise can never change under it mid-telling.
//
// Every effect here is applied inside src/engine/game.ts and nowhere else.
// Deliberately so: levers that leak into screens this system does not own
// (rest price, shop price, party cap, orb gating) were considered and dropped,
// because a modifier the UI cannot see is a modifier that lies to the player.
// ---------------------------------------------------------------------------

import { GATES } from './gates';
import { speciesMatching } from './species';

/** Everything a Binding or Depth is allowed to bend. Merged, then read by game.ts. */
export interface RunModifiers {
  /** Absolute override of starting gold (not a delta). */
  startGold: number | null;
  /** A beast is already at your side when the telling opens. */
  startCompanion: boolean;
  /** Cards seeded into the deck at the start of EVERY expedition. */
  seedCards: number;
  /** Boon cards persist for the whole telling instead of one expedition. */
  keepCards: boolean;
  /** Added to the number of cards a Boon lays out (floored at 1). */
  rewardDelta: number;
  /** Boons roll from the uncommon/rare pools far more often. */
  richPools: boolean;
  /** Extra monsters per wild pack. */
  packBonus: number;
  /** Percent chance the lead monster of a wild pack is forced to an elite. */
  eliteChance: number;
  /** Flat bonus to the tame chance of every wild monster. */
  wildTameBonus: number;
  /** Tamed beasts arrive at your level rather than two below it. */
  tamedAtLevel: boolean;
  /** Added to the level of everything the dark sends at you. */
  enemyLevelBonus: number;
  /** Multiplier on verses banked when the telling ends, either way. */
  verseMult: number;
}

export const NO_MODIFIERS: RunModifiers = {
  startGold: null,
  startCompanion: false,
  seedCards: 0,
  keepCards: false,
  rewardDelta: 0,
  richPools: false,
  packBonus: 0,
  eliteChance: 0,
  wildTameBonus: 0,
  tamedAtLevel: false,
  enemyLevelBonus: 0,
  verseMult: 1,
};

/** What the Ledger must hold before a Binding can be inscribed. */
export interface BindingRequirement {
  /** Distinct species ever faced, across every telling. */
  species?: number;
  /** Distinct Wardens ever felled, across every telling. */
  wardens?: number;
  /** Tellings begun (so: 2 means "after your first draft has closed"). */
  telling?: number;
}

export interface BindingDef {
  id: string;
  name: string;
  /** The Chronicler's framing. Prose only — no numbers. */
  text: string;
  /** The plain reading. Numbers only — no prose. */
  terms: string;
  requires: BindingRequirement;
  /** How the requirement reads while still unmet. */
  requirementText: string;
  /**
   * Verses to write the premise into the book, once. Free to select forever
   * after. Verses previously bought five flat stat bumps and then had nothing
   * left to be for; this is what they are for now.
   */
  cost: number;
  mods: Partial<RunModifiers>;
}

export const BINDINGS: BindingDef[] = [
  {
    id: 'borrowed-page',
    name: 'The Borrowed Page',
    text: 'Three cards from a telling that was never yours are in the deck before you reach the first gate. The Chronicler will not say whose telling. The margin note reads only: he had no further use for them.',
    terms: 'Every expedition begins with three cards drawn from another draft. Boons lay out one card fewer.',
    requires: { telling: 2 },
    requirementText: 'Available once a first draft has closed.',
    cost: 10,
    mods: { seedCards: 3, rewardDelta: -1 },
  },
  {
    id: 'thin-ledger',
    name: 'The Thin Ledger',
    text: 'You begin with an empty purse and no account of where it went. Everdusk does not ask; Everdusk has seen worse arrivals. But the dark has never dealt in coin, and it lays out more than it usually would.',
    terms: 'Begin with no gold. Boons lay out two more cards, drawn from richer pools.',
    requires: { wardens: 1 },
    requirementText: 'Fell one Warden, in any telling.',
    cost: 14,
    mods: { startGold: 0, rewardDelta: 2, richPools: true },
  },
  {
    id: 'covenant-kept',
    name: 'The Covenant Kept',
    text: 'Something is waiting at the road when you arrive, and it does not run. In this draft the beasts of Everdusk are minded to be kept, and the ones that are kept do not begin behind you.',
    terms: 'Begin with a companion. Wild beasts yield far more readily, and every beast tamed arrives at your level. Boons lay out one card fewer.',
    requires: { species: 10 },
    requirementText: 'Face ten distinct species, across all tellings.',
    cost: 16,
    mods: { startCompanion: true, wildTameBonus: 22, tamedAtLevel: true, rewardDelta: -1 },
  },
  {
    id: 'long-memory',
    name: 'The Long Memory',
    text: 'What a Boon gives you, you keep — not until the gate closes behind you, but until the telling does. The book remembers more than it is meant to this time. It offers less, to make up the difference.',
    terms: 'Boon cards stay in your deck for the entire telling. Boons lay out two fewer cards.',
    requires: { wardens: 2 },
    requirementText: 'Fell two Wardens, in any telling.',
    cost: 20,
    mods: { keepCards: true, rewardDelta: -2 },
  },
  {
    id: 'crowded-dark',
    name: 'The Crowded Dark',
    text: 'The dark comes in numbers this time. The Chronicler has written it this way before and does not enjoy writing it, but the pages come out longer, and there is more in them worth keeping.',
    terms: 'Wild packs run one larger, and elites are common. Verses are worth half again.',
    requires: { species: 22 },
    requirementText: 'Face twenty-two distinct species, across all tellings.',
    cost: 24,
    mods: { packBonus: 1, eliteChance: 35, verseMult: 1.5 },
  },
];

export function bindingById(id: string | null | undefined): BindingDef | null {
  if (!id) return null;
  return BINDINGS.find((b) => b.id === id) ?? null;
}

/**
 * Every species that can actually be MET in a gate — the honest denominator
 * for "species faced", and the ceiling any species requirement must sit under.
 *
 * Not simply Object.keys(SPECIES): a handful exist only as breeding results
 * and are never spawned by a floor, so counting them would make the chase
 * uncompletable and the tile read 48/51 forever. Mirrors the two pools
 * floors.ts actually draws from — the floor's own tier band, and the band
 * widened by one for the miniboss that holds the stairs.
 */
export function faceableSpeciesIds(): string[] {
  const out = new Set<string>();
  for (const gate of Object.values(GATES)) {
    for (const floor of gate.floors) {
      const s = floor.spawn;
      for (const def of speciesMatching(s.families, s.tierMin, s.tierMax)) out.add(def.id);
      for (const def of speciesMatching(s.families, s.tierMin, Math.min(5, s.tierMax + 1))) out.add(def.id);
    }
    for (const def of speciesMatching([gate.bossFamily], 1, gate.bossTier)) out.add(def.id);
  }
  return [...out];
}

/** Cached: the gate tables are static, so this only ever needs computing once. */
let faceableCount: number | null = null;
export function faceableSpeciesCount(): number {
  if (faceableCount === null) faceableCount = faceableSpeciesIds().length;
  return faceableCount;
}

// ---------------------------------------------------------------------------
// Depths. Only offered once the Hollow Sovereign has fallen at least once —
// the book will not be read again until it has been read through.
// ---------------------------------------------------------------------------

export interface DepthDef {
  depth: number;
  name: string;
  text: string;
  terms: string;
  mods: Partial<RunModifiers>;
}

export const DEPTHS: DepthDef[] = [
  {
    depth: 0,
    name: 'The Surface Draft',
    text: 'The story as it was first set down, with nothing added and nothing taken away. The Chronicler keeps it at the top of the stack out of respect, not preference.',
    terms: 'No escalation.',
    mods: {},
  },
  {
    depth: 1,
    name: 'The Second Reading',
    text: 'You know how it ends. So, now, does the dark — and it has had the same amount of time to think about it as you have.',
    terms: 'Everything in the dark is two levels older. Verses worth half again.',
    mods: { enemyLevelBonus: 2, verseMult: 1.5 },
  },
  {
    depth: 2,
    name: 'The Marginalia',
    text: 'Someone has been writing in the margins of this draft, in a hand that is almost the Chronicler\'s. The notes are not encouraging and they are not wrong.',
    terms: 'Four levels older. Packs run one larger. Verses doubled.',
    mods: { enemyLevelBonus: 4, packBonus: 1, verseMult: 2 },
  },
  {
    depth: 3,
    name: 'The Palimpsest',
    text: 'This page has carried another story before yours, scraped down and written over. Some of it shows through. It was not a kinder story.',
    terms: 'Six levels older. Packs one larger. Boons lay out one card fewer. Verses at two and a half.',
    mods: { enemyLevelBonus: 6, packBonus: 1, rewardDelta: -1, verseMult: 2.5 },
  },
  {
    depth: 4,
    name: 'The Unfinished Draft',
    text: 'The Chronicler stopped this one partway and never said why. The ink at the break is heavier than it needs to be, as though the quill was held still a long while.',
    terms: 'Nine levels older. Packs two larger. Boons lay out one card fewer. Verses tripled.',
    mods: { enemyLevelBonus: 9, packBonus: 2, rewardDelta: -1, verseMult: 3 },
  },
  {
    depth: 5,
    name: 'The Last Telling',
    text: 'There is no draft under this one. The Chronicler has laid out a clean page and set the quill across it, and has not, so far, picked the quill back up.',
    terms: 'Twelve levels older. Packs two larger. Boons lay out two cards fewer. Verses quadrupled.',
    mods: { enemyLevelBonus: 12, packBonus: 2, rewardDelta: -2, verseMult: 4 },
  },
];

export const MAX_DEPTH = DEPTHS[DEPTHS.length - 1].depth;

export function depthByLevel(depth: number | null | undefined): DepthDef {
  const found = DEPTHS.find((d) => d.depth === (depth ?? 0));
  return found ?? DEPTHS[0];
}

/**
 * Fold a Binding and a Depth into one set of modifiers.
 *
 * Additive fields add; `verseMult` multiplies (a Binding worth half again,
 * read at a doubled Depth, is worth three times); `startGold` takes the
 * Binding's override if it has one, since Depths never touch the purse.
 */
export function runModifiers(bindingId: string | null | undefined, depth: number | null | undefined): RunModifiers {
  const parts: Partial<RunModifiers>[] = [bindingById(bindingId)?.mods ?? {}, depthByLevel(depth).mods];
  const out: RunModifiers = { ...NO_MODIFIERS };
  for (const part of parts) {
    if (part.startGold !== undefined && part.startGold !== null) out.startGold = part.startGold;
    out.startCompanion = out.startCompanion || !!part.startCompanion;
    out.keepCards = out.keepCards || !!part.keepCards;
    out.richPools = out.richPools || !!part.richPools;
    out.tamedAtLevel = out.tamedAtLevel || !!part.tamedAtLevel;
    out.seedCards += part.seedCards ?? 0;
    out.rewardDelta += part.rewardDelta ?? 0;
    out.packBonus += part.packBonus ?? 0;
    out.eliteChance += part.eliteChance ?? 0;
    out.wildTameBonus += part.wildTameBonus ?? 0;
    out.enemyLevelBonus += part.enemyLevelBonus ?? 0;
    out.verseMult *= part.verseMult ?? 1;
  }
  return out;
}
