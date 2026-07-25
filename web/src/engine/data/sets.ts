// ---------------------------------------------------------------------------
// Gear sets — "the matched pieces".
//
// A set is a named group of Legendary items that, worn together, put CARDS in
// your deck. Not stats: cards. Everdusk's texture lives in the deck, so a set
// that granted "+10 STR" would be a number you never think about again, while a
// set that puts Retribution in every hand rewrites which attribute you spend
// points on and which turn you decide the fight on.
//
// WHY CARDS AND NOT STATS (the honest engineering reason as well as the design
// one): conditional stat bonuses would have to live inside Character.ts, which
// applies equipment by summing `item.affixes` and has no notion of "a bonus
// that exists only while four particular things are worn". Writing synthetic
// affixes onto the items themselves would corrupt item identity (a piece
// sitting in the bag would advertise a bonus it is not granting) and would
// double-apply across a save round-trip. Card grants have an existing, clean,
// already-pure channel: `startBattle(..., { expeditionExtras })`. game.ts
// recomputes them from the worn gear at the top of every battle, so they are
// never stale and never persisted.
//
// MEMBERSHIP CARRIES NO SCHEMA CHANGE. A set piece is identified by its
// existing `ItemV2.uniqueId`, which every Legendary already carries and which
// already survives the save round-trip (saveGame.ts JSON-clones the state).
// Nothing was added to ItemV2, so no save migration exists to get wrong, and
// heroes in old saves who are already wearing Duskfang wake up wearing a set
// piece.
// ---------------------------------------------------------------------------

import type { EquipmentSlot, GeneratedWorld, ItemV2, WorldFigure, FigureRole } from '../types';
import { UNIQUES } from './uniques';

/** One threshold on a set: wear this many pieces, get these cards. */
export interface SetBonus {
  /** Distinct member pieces that must be WORN (not merely owned). */
  pieces: number;
  /** Card ids added to the deck at the start of every battle. Must exist in CARDS. */
  cards: string[];
  /** The plain reading, shown in the UI. Numbers and card names, no prose. */
  terms: string;
}

export interface GearSetDef {
  id: string;
  name: string;
  /** The set's framing. Prose only — no numbers. */
  text: string;
  /**
   * Member unique ids, in the order the UI lists them. A set may name two
   * pieces for the same slot (the Vigil's blade and its staff); only one can
   * ever be worn, which is why `wearableMax` is computed from slots, not
   * from this list's length.
   */
  members: string[];
  /** Thresholds, ascending by `pieces`. */
  bonuses: SetBonus[];
  /**
   * Which kind of figure from the world's own generated history this set is
   * attributed to. See `figureForSet`.
   */
  figureRole: FigureRole;
  /** How the attribution line reads. `{figure}` is filled with "Name Title". */
  attribution: string;
}

export const GEAR_SETS: GearSetDef[] = [
  {
    id: 'duskbound-vigil',
    name: 'The Duskbound Vigil',
    text:
      'The kit of a watch that was never relieved. Every piece of it is heavier than it needs to be, and every piece of it was made to be stood in for a long time.',
    // Six named pieces, five wearable at once: the Vigil was issued with both a
    // blade and a staff, and nobody was ever expected to carry both.
    members: ['duskfang', 'cinderwake', 'duskwardensPlate', 'duskboundVow', 'duskfallStriders', 'lastLanternChime'],
    bonuses: [
      {
        pieces: 2,
        cards: ['aegisOath'],
        terms: 'Aegis Oath is in your deck every battle.',
      },
      {
        pieces: 4,
        cards: ['aegisOath', 'retribution'],
        terms: 'Aegis Oath and Retribution are in your deck every battle. What you can take, you can return.',
      },
      {
        pieces: 5,
        cards: ['aegisOath', 'retribution', 'adamantBulwark'],
        terms: 'Aegis Oath, Retribution and Adamant Bulwark are in your deck every battle.',
      },
    ],
    figureRole: 'knight',
    attribution: 'Issued to {figure}, and never handed back in.',
  },
  {
    id: 'unlit-procession',
    name: 'The Unlit Procession',
    text:
      'What the pallbearers wore, on the long walk out and the longer walk back. Nothing in it is armour. All of it is quiet, and quiet is its own kind of speed.',
    // Four pieces, no weapon: any class can carry the Procession.
    members: ['pallbearersHood', 'quietHands', 'ringOfTheUncounted', 'processionalBell'],
    bonuses: [
      {
        pieces: 2,
        cards: ['stolenBreath'],
        terms: 'Stolen Breath is in your deck every battle.',
      },
      {
        pieces: 4,
        cards: ['stolenBreath', 'duskweaverStep', 'secondSight'],
        terms: 'Stolen Breath, Duskweaver Step and Second Sight are in your deck every battle. The expensive hand becomes an affordable one.',
      },
    ],
    figureRole: 'wanderer',
    attribution: 'Walked in by {figure}, who is recorded as having attended every funeral but their own.',
  },
  {
    id: 'ashen-verdict',
    name: 'The Ashen Verdict',
    text:
      'A heretic\'s working clothes. The argument they were making was settled in their favour, some years after there was anyone left to tell.',
    members: ['verdictEdge', 'pyreWeave', 'emberbittenGrips', 'bandOfTheLastArgument'],
    bonuses: [
      {
        pieces: 2,
        cards: ['markedForRuin'],
        terms: 'Marked for Ruin is in your deck every battle.',
      },
      {
        pieces: 4,
        cards: ['markedForRuin', 'kingslayerThrust', 'thousandCuts'],
        terms: 'Marked for Ruin, Kingslayer Thrust and Thousand Cuts are in your deck every battle. Finish it early or explain yourself.',
      },
    ],
    figureRole: 'heretic',
    attribution: 'Worn by {figure} to the argument that ended them.',
  },
];

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

/** uniqueId -> the set it belongs to. Built once; the tables are static. */
const SET_BY_PIECE: Map<string, GearSetDef> = (() => {
  const map = new Map<string, GearSetDef>();
  for (const set of GEAR_SETS) {
    for (const id of set.members) map.set(id, set);
  }
  return map;
})();

export function setById(id: string | null | undefined): GearSetDef | null {
  if (!id) return null;
  return GEAR_SETS.find((s) => s.id === id) ?? null;
}

/** The set a given item belongs to, or null. Keys off `uniqueId` alone. */
export function setOfItem(item: ItemV2 | null | undefined): GearSetDef | null {
  if (!item || !item.uniqueId) return null;
  return SET_BY_PIECE.get(item.uniqueId) ?? null;
}

/** Every unique id that is a member of some set. */
export function allSetPieceIds(): string[] {
  return [...SET_BY_PIECE.keys()];
}

/**
 * The most pieces of this set that can be worn at once.
 *
 * Counted by distinct equipment SLOT, not by member count: the Vigil names six
 * pieces but two of them are weapons, so its ceiling is five. Rings are the one
 * slot a hero has two of, so a set naming two rings could reach both — none
 * currently does, but the arithmetic allows for it rather than quietly
 * under-reporting.
 */
export function wearableMax(set: GearSetDef): number {
  const perSlot = new Map<EquipmentSlot, number>();
  for (const id of set.members) {
    const def = UNIQUES.find((u) => u.id === id);
    if (!def) continue;
    const slot = SLOT_OF_BASE[def.baseType];
    if (!slot) continue;
    perSlot.set(slot, (perSlot.get(slot) ?? 0) + 1);
  }
  let total = 0;
  for (const [slot, count] of perSlot) {
    const capacity = slot === 'ring' ? 2 : 1;
    total += Math.min(capacity, count);
  }
  return total;
}

/**
 * Base type -> slot, mirrored from ITEM_TYPES. Kept as a local literal rather
 * than importing items.ts so that `sets.ts` stays a leaf of the data graph and
 * cannot participate in an import cycle with lootGen.
 */
const SLOT_OF_BASE: Record<string, EquipmentSlot | undefined> = {
  Sword: 'weapon',
  Staff: 'weapon',
  Armor: 'armor',
  Headpiece: 'headpiece',
  Glove: 'gloves',
  Boot: 'boots',
  Ring: 'ring',
  Amulet: 'amulet',
  Pendant: 'pendant',
  Charm: 'charm',
  Trinket: 'trinket',
};

// ---------------------------------------------------------------------------
// What a loadout is actually granting
// ---------------------------------------------------------------------------

export interface SetStanding {
  set: GearSetDef;
  /** Distinct member pieces currently WORN. */
  worn: number;
  /** Distinct member pieces held anywhere (worn or in the bag). */
  held: number;
  /** Member unique ids currently worn. */
  wornIds: string[];
  /** Member unique ids sitting in the bag. */
  bagIds: string[];
  /** The highest threshold met by `worn`, or null. */
  active: SetBonus | null;
  /** The next threshold above `worn`, or null if the set is complete. */
  next: SetBonus | null;
  /** The most pieces of this set that could ever be worn at once. */
  max: number;
}

/**
 * Read a hero's loadout against every set they have any piece of.
 *
 * Deliberately takes plain item arrays rather than a Character: this is called
 * from the reducer, from the UI, and from tests, and none of them should have
 * to build a Character to ask a question about a list of items.
 */
export function setStandings(wornItems: (ItemV2 | null | undefined)[], bagItems: (ItemV2 | null | undefined)[] = []): SetStanding[] {
  const wornBySet = new Map<string, Set<string>>();
  const bagBySet = new Map<string, Set<string>>();

  const collect = (items: (ItemV2 | null | undefined)[], into: Map<string, Set<string>>) => {
    for (const item of items) {
      const set = setOfItem(item);
      if (!set || !item?.uniqueId) continue;
      const bucket = into.get(set.id) ?? new Set<string>();
      bucket.add(item.uniqueId);
      into.set(set.id, bucket);
    }
  };
  collect(wornItems, wornBySet);
  collect(bagItems, bagBySet);

  const touched = new Set<string>([...wornBySet.keys(), ...bagBySet.keys()]);
  const out: SetStanding[] = [];
  for (const set of GEAR_SETS) {
    if (!touched.has(set.id)) continue;
    const wornIds = [...(wornBySet.get(set.id) ?? [])];
    // A piece that is worn is not also "in the bag" for counting purposes.
    const bagIds = [...(bagBySet.get(set.id) ?? [])].filter((id) => !wornIds.includes(id));
    const worn = wornIds.length;
    const max = wearableMax(set);
    const ascending = [...set.bonuses].sort((a, b) => a.pieces - b.pieces);
    let active: SetBonus | null = null;
    let next: SetBonus | null = null;
    for (const bonus of ascending) {
      if (worn >= bonus.pieces) active = bonus;
      else if (next === null) next = bonus;
    }
    out.push({
      set,
      worn,
      held: new Set([...wornIds, ...bagIds]).size,
      wornIds,
      bagIds,
      active,
      next,
      max,
    });
  }
  return out;
}

/**
 * Every card id a loadout is currently granting.
 *
 * Thresholds are NOT cumulative — each `SetBonus.cards` restates the whole
 * grant at that tier, so the 4-piece line lists the 2-piece card as well. That
 * makes the UI honest (a threshold shows everything it gives, not a delta the
 * player has to add up) at the cost of a little repetition in the data.
 *
 * Duplicates across different sets are preserved: two sets that both grant
 * Stolen Breath would put two copies in the deck, which is the correct and
 * intuitive result.
 */
export function setCardIds(wornItems: (ItemV2 | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const standing of setStandings(wornItems)) {
    if (standing.active) out.push(...standing.active.cards);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Attribution to the world's own history
// ---------------------------------------------------------------------------

/**
 * Which figure from THIS telling's generated history the set belonged to.
 *
 * The set's identity is static (a set must be nameable across tellings, or the
 * vault at Grude's forge could not have a rule about it, and the player could
 * never say "I am hunting the Vigil"). Its OWNER is drawn fresh from whatever
 * history the current world generated — so the Vigil is always the Vigil, but
 * in this telling it was issued to Aurelle the Unbowed, and in the next one it
 * was not.
 *
 * Deterministic: same world, same set, same figure, with no stored state and
 * therefore nothing to migrate. Prefers a figure whose role matches the set's
 * temperament, and falls back to the whole cast when the roll produced none.
 */
export function figureForSet(world: GeneratedWorld | null | undefined, set: GearSetDef): WorldFigure | null {
  if (!world || world.figures.length === 0) return null;
  const preferred = world.figures.filter((f) => f.role === set.figureRole);
  const pool = preferred.length > 0 ? preferred : world.figures;
  let hash = 0;
  for (let i = 0; i < set.id.length; i++) hash = (hash * 31 + set.id.charCodeAt(i)) >>> 0;
  return pool[hash % pool.length];
}

/** The attribution line, filled in. Empty string when the world has no history yet. */
export function setAttribution(world: GeneratedWorld | null | undefined, set: GearSetDef): string {
  const figure = figureForSet(world, set);
  if (!figure) return '';
  return set.attribution.replace('{figure}', `${figure.name} ${figure.title}`);
}
