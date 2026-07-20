import type { ClassName, RaceName } from '../types';

// ---------------------------------------------------------------------------
// Mechanical identities (PLAN3.md): every race and class bends a DIFFERENT
// game mechanic. Composed at read-time from race + class — nothing stored.
// ---------------------------------------------------------------------------

export interface TraitSet {
  /** Boon cards offered after victory. */
  rewardChoices: number;
  /** Added to max Vigor. */
  maxVigorBonus: number;
  /** Multiplier on hero max HP. */
  heroHpMult: number;
  /** Ward carries over between turns instead of fading. */
  wardPersists: boolean;
  /** Added to hand size. */
  handSizeDelta: number;
  /** Multiplier on hero card damage. */
  damageMult: number;
  /** Multiplier on healing the hero receives. */
  healMult: number;
  /** Active party monster cap. */
  partyCap: number;
  /** Fleeing never fails. */
  fleeAlways: boolean;
  /** Multiplier on shop prices. */
  shopDiscount: number;
  /** The hero takes hits BEFORE party monsters (Knight's oath). */
  protectorHero: boolean;
  /** The first strike-type card each battle costs 0. */
  firstStrikeFree: boolean;
}

const BASE: TraitSet = {
  rewardChoices: 3,
  maxVigorBonus: 0,
  heroHpMult: 1,
  wardPersists: false,
  handSizeDelta: 0,
  damageMult: 1,
  healMult: 1,
  partyCap: 2,
  fleeAlways: false,
  shopDiscount: 1,
  protectorHero: false,
  firstStrikeFree: false,
};

export interface TraitInfo {
  name: string;
  text: string;
  mods: Partial<TraitSet>;
}

export const RACE_TRAITS: Record<RaceName, TraitInfo> = {
  Human: {
    name: 'Adaptable',
    text: 'Boons offer four choices instead of three.',
    mods: { rewardChoices: 4 },
  },
  Elf: {
    name: 'Duskblooded',
    text: '+1 max Vigor. Max HP reduced by 15%.',
    mods: { maxVigorBonus: 1, heroHpMult: 0.85 },
  },
  Dwarf: {
    name: 'Stoneward',
    text: 'Ward does not fade between turns. Hand size −1.',
    mods: { wardPersists: true, handSizeDelta: -1 },
  },
  Orc: {
    name: 'Bloodprice',
    text: 'Card damage ×1.25. Healing received ×0.5.',
    mods: { damageMult: 1.25, healMult: 0.5 },
  },
};

export const CLASS_TRAITS: Record<ClassName, TraitInfo> = {
  Warrior: {
    name: 'Bladesworn',
    text: 'The first strike-type card each battle costs 0.',
    mods: { firstStrikeFree: true },
  },
  Mage: {
    name: 'Attuned',
    text: 'Hand size +1.',
    mods: { handSizeDelta: 1 },
  },
  Thief: {
    name: 'Fleetfoot',
    text: 'Fleeing never fails. Shops charge 20% less.',
    mods: { fleeAlways: true, shopDiscount: 0.8 },
  },
  Bard: {
    name: 'Chorusmaster',
    text: 'Three monsters may walk beside you. Your card damage ×0.85.',
    mods: { partyCap: 3, damageMult: 0.85 },
  },
  Knight: {
    name: 'Oathshield',
    text: 'You take hits before your monsters do.',
    mods: { protectorHero: true },
  },
};

export function traitsFor(race: RaceName, className: ClassName): TraitSet {
  const merged: TraitSet = { ...BASE };
  for (const mods of [RACE_TRAITS[race].mods, CLASS_TRAITS[className].mods]) {
    for (const [key, value] of Object.entries(mods)) {
      const k = key as keyof TraitSet;
      if (typeof value === 'number' && typeof merged[k] === 'number') {
        // Additive for deltas/bonuses, multiplicative for mults, override for caps/choices.
        if (k === 'handSizeDelta' || k === 'maxVigorBonus') (merged[k] as number) += value;
        else if (k === 'heroHpMult' || k === 'damageMult' || k === 'healMult' || k === 'shopDiscount') (merged[k] as number) *= value;
        else (merged[k] as number) = value;
      } else {
        (merged[k] as TraitSet[typeof k]) = value as TraitSet[typeof k];
      }
    }
  }
  return merged;
}

// ---------------------------------------------------------------------------
// Talents: what leveling is FOR. Rare automatic passives that touch the card
// system directly. (The hero's old combat-skill list is retired.)
// ---------------------------------------------------------------------------

export interface TalentDef {
  level: number;
  id: string;
  name: string;
  text: string;
}

export const TALENTS: TalentDef[] = [
  { level: 3, id: 'secondBreath', name: 'Second Breath', text: 'Draw +1 on the first turn of each battle.' },
  { level: 6, id: 'deepVigor', name: 'Deep Vigor', text: '+1 max Vigor.' },
  { level: 9, id: 'firstLight', name: 'First Light', text: 'Your first card each battle costs 0.' },
  { level: 12, id: 'wideGrasp', name: 'Wide Grasp', text: 'Hand size +1.' },
  { level: 15, id: 'killersEye', name: "Killer's Eye", text: '+10% critical chance.' },
];

export interface TalentEffects {
  firstTurnDraw: number;
  maxVigor: number;
  firstCardFree: boolean;
  handSize: number;
  critBonus: number;
}

export function talentsFor(level: number): TalentEffects {
  const has = (id: string) => TALENTS.some((t) => t.id === id && level >= t.level);
  return {
    firstTurnDraw: has('secondBreath') ? 1 : 0,
    maxVigor: has('deepVigor') ? 1 : 0,
    firstCardFree: has('firstLight'),
    handSize: has('wideGrasp') ? 1 : 0,
    critBonus: has('killersEye') ? 10 : 0,
  };
}

export function unlockedTalents(level: number): TalentDef[] {
  return TALENTS.filter((t) => level >= t.level);
}
