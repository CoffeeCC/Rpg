// ---------------------------------------------------------------------------
// Where a number comes from.
//
// The character sheet used to print totals and leave the player to guess at
// their parentage. These selectors take the same arithmetic the engine
// performs — Character.effectiveStat, Character.recomputeDerived, the card
// resolver, the floor walker — and hand back every term of it, signed and
// attributed, in the order the engine applies them.
//
// Pure. No state is touched, nothing is stored. If a formula here ever
// disagrees with the engine, the engine is right and this file is a lie;
// engine/test/charSheet.test.ts exists to catch that the moment it happens.
// ---------------------------------------------------------------------------

import type { Character, EquipKey } from './entities/Character';
import type { CardScaling, ItemV2, Stat } from './types';
import { RACES } from './data/races';
import { CLASSES } from './data/classes';
import { BALANCE } from './data/balance';
import { STAT_LABEL } from './data/keywords';
import { CLASS_TRAITS, RACE_TRAITS, TALENTS, talentsFor, type TraitInfo, type TraitSet } from './data/traits';
import { lanternRadius, movFor } from './systems/floors';
import { energyFor, handSizeFor, heroMitigation } from './systems/cardBattle';
import type { DamageSchool } from './data/damageTypes';

/** Every hero begins with this in each of the seven stats, before blood,
 *  schooling, or anything the road adds. Mirrors BASE_STATS in Character. */
export const HERO_BASE_STAT = 3;

/** Hero-wearable slots, in the order Character iterates them. */
export const EQUIP_KEYS: EquipKey[] = ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring', 'ring2', 'amulet', 'pendant'];

export type ContributionKind =
  | 'base' // the flat floor every hero stands on
  | 'race'
  | 'class'
  | 'training' // level-up points, event boons, spoils
  | 'level'
  | 'stat' // a lower stat feeding a higher one
  | 'implicit' // a base item's own weight
  | 'affix' // a rolled or unique affix
  | 'mod' // a buff or debuff still counting down
  | 'talent'
  | 'trait';

export interface Contribution {
  kind: ContributionKind;
  /** Who or what is responsible. */
  source: string;
  /** The fine print — an affix name, a turn count, the arithmetic. */
  detail?: string;
  /** Signed additive term. Ignored when `mult` is set. */
  amount: number;
  /** A multiplicative step applied to the running subtotal, in order. */
  mult?: number;
}

export interface Breakdown {
  id: string;
  label: string;
  /** What the engine actually reports. Authoritative. */
  total: number;
  /** The terms, in application order. */
  contributions: Contribution[];
  /** The formula as the engine writes it. */
  formula: string;
  /** What the number buys you, in play. */
  meaning: string;
  /** Set when the engine clamps or floors the folded sum. */
  note?: string;
}

/** Applies contributions in order: additive terms sum, `mult` terms scale the
 *  running subtotal. This is the shape of every formula in the engine. */
export function foldContributions(contributions: Contribution[]): number {
  let running = 0;
  for (const c of contributions) running = c.mult !== undefined ? running * c.mult : running + c.amount;
  return running;
}

// ---------------------------------------------------------------------------
// Equipment terms
// ---------------------------------------------------------------------------

export function equippedItems(hero: Character): { key: EquipKey; item: ItemV2 }[] {
  const worn: { key: EquipKey; item: ItemV2 }[] = [];
  for (const key of EQUIP_KEYS) {
    const item = hero.equipment[key];
    if (item) worn.push({ key, item });
  }
  return worn;
}

/** Every affix across worn gear that targets `target`, one line apiece. */
function affixTerms(hero: Character, target: string): Contribution[] {
  const terms: Contribution[] = [];
  for (const { item } of equippedItems(hero)) {
    for (const affix of item.affixes) {
      if (affix.target !== target) continue;
      terms.push({ kind: 'affix', source: item.name, detail: affix.name, amount: affix.amount });
    }
  }
  return terms;
}

/** Sum of one implicit across worn gear, as one line per item that carries it. */
function implicitTerms(hero: Character, key: 'implicitAttack' | 'implicitMagic' | 'implicitDefense', word: string): Contribution[] {
  const terms: Contribution[] = [];
  for (const { item } of equippedItems(hero)) {
    if (item[key] === 0) continue;
    terms.push({ kind: 'implicit', source: item.name, detail: word, amount: item[key] });
  }
  return terms;
}

function equipmentSum(hero: Character, target: string): number {
  return affixTerms(hero, target).reduce((s, c) => s + c.amount, 0);
}

function implicitSum(hero: Character, key: 'implicitAttack' | 'implicitMagic' | 'implicitDefense'): number {
  return equippedItems(hero).reduce((s, { item }) => s + item[key], 0);
}

// ---------------------------------------------------------------------------
// Trait terms
// ---------------------------------------------------------------------------

function traitPair(hero: Character): { info: TraitInfo; origin: string }[] {
  return [
    { info: RACE_TRAITS[hero.race], origin: hero.race },
    { info: CLASS_TRAITS[hero.className], origin: hero.className },
  ];
}

/** Additive trait terms (handSizeDelta, maxVigorBonus, moveBonus), attributed
 *  to the race or class oath that grants them. */
function traitAdditive(hero: Character, key: keyof TraitSet): Contribution[] {
  const terms: Contribution[] = [];
  for (const { info, origin } of traitPair(hero)) {
    const value = info.mods[key];
    if (typeof value !== 'number' || value === 0) continue;
    terms.push({ kind: 'trait', source: info.name, detail: origin, amount: value });
  }
  return terms;
}

/** Multiplicative trait terms (heroHpMult, damageMult, healMult, shopDiscount). */
export function traitMultipliers(hero: Character, key: keyof TraitSet): Contribution[] {
  const terms: Contribution[] = [];
  for (const { info, origin } of traitPair(hero)) {
    const value = info.mods[key];
    if (typeof value !== 'number' || value === 1) continue;
    terms.push({ kind: 'trait', source: info.name, detail: `${origin} · ×${value}`, amount: 0, mult: value });
  }
  return terms;
}

function talentTerm(hero: Character, id: string, amount: number): Contribution[] {
  const def = TALENTS.find((t) => t.id === id);
  if (!def || hero.level < def.level || amount === 0) return [];
  return [{ kind: 'talent', source: def.name, detail: `Level ${def.level}`, amount }];
}

// ---------------------------------------------------------------------------
// The seven attributes
// ---------------------------------------------------------------------------

const STAT_MEANING: Record<Stat, string> = {
  STR: 'Feeds Attack. Every Strength-scaling card adds half your Attack to its number. Trained Strength — not the borrowed kind — is worth 3 max HP apiece.',
  DEF: 'Feeds Defense, which is shaved off every enemy blow of muscle while it is still being telegraphed, and half of which arms Defense-scaling guard cards with Block. Sorcery goes around it — that is what Magic Defense is for. Trained Defense is worth 2 max HP apiece.',
  DEX: 'Buys ground. One further step through a gate for every 15, and the difference between your Dexterity and the enemy pack decides whether fleeing works.',
  MANA: 'Trained Mana is 4 max MP apiece. Effective Mana buys one more Vigor — the Energy you spend on cards — every 12 points.',
  MAGDEF: `Feeds Magic Defense, which stands in for Defense whenever the blow is sorcery — dragonfire, a soul-drain, a boss's decree, any skill that reads a caster's Intellect. It is taken off harder than Defense is (${Math.round(BALANCE.intentMagicDefMitigation * 100)} hundredths against ${Math.round(BALANCE.intentDefMitigation * 100)}), because it is read on far fewer blows. Your monsters read their own.`,
  INT: 'Feeds Magic Power. Every Intellect-scaling spell adds half of it to its number, and your monsters mend for a share of theirs.',
  LUCK: 'One point of critical chance for every 3. Loot rolls its rarity a step kinder for every 4. The Last Lantern reaches one tile further for every 20.',
};

export function attributeBreakdown(hero: Character, stat: Stat): Breakdown {
  const raceMod = RACES[hero.race].mods[stat] ?? 0;
  const classMod = CLASSES[hero.className].mods[stat] ?? 0;
  const trained = hero.stats[stat] - HERO_BASE_STAT - raceMod - classMod;

  const contributions: Contribution[] = [
    { kind: 'base', source: 'Mortal stock', detail: 'what everyone is born with', amount: HERO_BASE_STAT },
    { kind: 'race', source: `${hero.race} blood`, detail: RACE_TRAITS[hero.race].name, amount: raceMod },
    { kind: 'class', source: `${hero.className} schooling`, detail: CLASS_TRAITS[hero.className].name, amount: classMod },
  ];
  if (trained !== 0) {
    contributions.push({ kind: 'training', source: 'Points spent, and what the road gave', detail: 'levels, shrines, events', amount: trained });
  }
  contributions.push(...affixTerms(hero, stat));
  for (const mod of hero.activeMods) {
    if (mod.stat !== stat) continue;
    contributions.push({
      kind: 'mod',
      source: mod.amount > 0 ? 'A blessing still holding' : 'An affliction still biting',
      detail: `${mod.turns} turn${mod.turns === 1 ? '' : 's'} remain`,
      amount: mod.amount,
    });
  }

  const raw = foldContributions(contributions);
  return {
    id: stat,
    label: STAT_LABEL[stat],
    total: hero.effectiveStat(stat),
    contributions,
    formula: 'base + blood + schooling + training + gear + what is currently on you',
    meaning: STAT_MEANING[stat],
    note: raw < 1 ? `The terms sum to ${raw}; nothing is permitted below 1, so it is held at 1.` : undefined,
  };
}

export const STAT_ORDER: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];

export function attributeBreakdowns(hero: Character): Breakdown[] {
  return STAT_ORDER.map((stat) => attributeBreakdown(hero, stat));
}

// ---------------------------------------------------------------------------
// Derived numbers
// ---------------------------------------------------------------------------

function statTerm(hero: Character, stat: Stat): Contribution {
  return { kind: 'stat', source: STAT_LABEL[stat], detail: 'effective', amount: hero.effectiveStat(stat) };
}

export function attackBreakdown(hero: Character): Breakdown {
  const contributions = [statTerm(hero, 'STR'), ...implicitTerms(hero, 'implicitAttack', 'base weight'), ...affixTerms(hero, 'Attack')];
  return {
    id: 'attack',
    label: 'Attack',
    total: hero.getAttack(),
    contributions,
    formula: 'Strength + every implicit weapon weight + every Attack affix',
    meaning: 'Halved and added to the printed number of every Strength-scaling card.',
  };
}

export function magicBreakdown(hero: Character): Breakdown {
  const contributions = [statTerm(hero, 'INT'), ...implicitTerms(hero, 'implicitMagic', 'base weight'), ...affixTerms(hero, 'Magic')];
  return {
    id: 'magic',
    label: 'Magic Power',
    total: hero.getMagicPower(),
    contributions,
    formula: 'Intellect + every implicit stave weight + every Magic affix',
    meaning: 'Halved and added to the printed number of every Intellect-scaling card.',
  };
}

export function defenseBreakdown(hero: Character): Breakdown {
  const contributions = [statTerm(hero, 'DEF'), ...implicitTerms(hero, 'implicitDefense', 'base weight'), ...affixTerms(hero, 'Defense')];
  return {
    id: 'defense',
    label: 'Defense',
    total: hero.getDefense(),
    contributions,
    formula: 'Defense + every implicit armour weight + every Defense affix',
    meaning: `Three tenths of it is taken off each enemy blow of muscle before the blow is announced, so a telegraphed number already has your armour in it. Half of it arms Defense-scaling cards with Block. It does nothing against sorcery.`,
  };
}

export function magicDefenseBreakdown(hero: Character): Breakdown {
  const armour = implicitSum(hero, 'implicitDefense') + equipmentSum(hero, 'Defense');
  const half = Math.floor(armour / 2);
  const contributions: Contribution[] = [
    statTerm(hero, 'MAGDEF'),
    { kind: 'implicit', source: 'Half of all your armour', detail: `${armour} ÷ 2, rounded down`, amount: half },
  ];
  return {
    id: 'magicDefense',
    label: 'Magic Defense',
    total: hero.getMagicDefense(),
    contributions,
    formula: 'Magic Defense + (all armour ÷ 2)',
    meaning: `${Math.round(BALANCE.intentMagicDefMitigation * 100)} hundredths of it is taken off every magical blow before the blow is announced — so a caster's telegraphed number already has your wards in it, exactly as Defense sits inside a swordsman's. A blow is magical when it carries an element, when it is a spell, or when it draws on Intellect rather than Strength.`,
    note: `Armour counts here at half weight, and that is deliberate: plate turns some of a spell aside, and without it a hero who never spends a point on Magic Defense would stand in dragonfire with nothing on. Points spent on Magic Defense count at full.`,
  };
}

export function maxHpBreakdown(hero: Character): Breakdown {
  const contributions: Contribution[] = [
    { kind: 'base', source: 'A body', detail: 'the flat allowance', amount: 40 },
    { kind: 'stat', source: 'Trained Strength', detail: `${hero.stats.STR} × 3`, amount: hero.stats.STR * 3 },
    { kind: 'stat', source: 'Trained Defense', detail: `${hero.stats.DEF} × 2`, amount: hero.stats.DEF * 2 },
    { kind: 'level', source: `Level ${hero.level}`, detail: `${hero.level} × 8`, amount: hero.level * 8 },
    ...affixTerms(hero, 'HP'),
    ...traitMultipliers(hero, 'heroHpMult'),
  ];
  return {
    id: 'maxHp',
    label: 'Max HP',
    total: hero.maxHp,
    contributions,
    formula: '(40 + trained Strength×3 + trained Defense×2 + level×8 + HP affixes) × blood',
    meaning: 'How much you can be asked to bear before the run ends.',
    note: 'Only trained Strength and Defense count here — a ring that lends you Strength lends no HP with it, and neither does a battle blessing.',
  };
}

export function maxMpBreakdown(hero: Character): Breakdown {
  const contributions: Contribution[] = [
    { kind: 'base', source: 'A quiet well', detail: 'the flat allowance', amount: 10 },
    { kind: 'stat', source: 'Trained Mana', detail: `${hero.stats.MANA} × 4`, amount: hero.stats.MANA * 4 },
    { kind: 'level', source: `Level ${hero.level}`, detail: `${hero.level} × 3`, amount: hero.level * 3 },
    ...affixTerms(hero, 'MP'),
  ];
  return {
    id: 'maxMp',
    label: 'Max MP',
    total: hero.maxMp,
    contributions,
    formula: '10 + trained Mana×4 + level×3 + MP affixes',
    meaning: "Spent on your monsters' instincts. As with HP, only trained Mana feeds it.",
  };
}

export function critBreakdown(hero: Character): Breakdown {
  const luck = hero.effectiveStat('LUCK');
  const contributions: Contribution[] = [
    { kind: 'base', source: "Everyone's share", detail: 'the house floor', amount: BALANCE.critBase },
    { kind: 'stat', source: 'Luck', detail: `${luck} ÷ ${BALANCE.critLuckDiv}, rounded down`, amount: Math.floor(luck / BALANCE.critLuckDiv) },
    ...talentTerm(hero, 'killersEye', talentsFor(hero.level).critBonus),
  ];
  return {
    id: 'crit',
    label: 'Critical chance',
    total: foldContributions(contributions),
    contributions,
    formula: `${BALANCE.critBase} + Luck ÷ ${BALANCE.critLuckDiv} + talents`,
    meaning: 'Rolled once per damaging card. A critical strikes far harder.',
  };
}

export function vigorBreakdown(hero: Character): Breakdown {
  const mana = hero.effectiveStat('MANA');
  const contributions: Contribution[] = [
    { kind: 'base', source: 'The turn itself', detail: 'the flat allowance', amount: BALANCE.baseEnergy },
    { kind: 'stat', source: 'Mana', detail: `${mana} ÷ ${BALANCE.manaPerEnergy}, rounded down`, amount: Math.floor(mana / BALANCE.manaPerEnergy) },
    ...traitAdditive(hero, 'maxVigorBonus'),
    ...talentTerm(hero, 'deepVigor', talentsFor(hero.level).maxVigor),
  ];
  return {
    id: 'vigor',
    label: 'Vigor',
    total: energyFor(hero),
    contributions,
    formula: `${BALANCE.baseEnergy} + Mana ÷ ${BALANCE.manaPerEnergy} + oaths + talents`,
    meaning: 'The Energy each of your turns is worth. Cards are paid for out of it.',
  };
}

export function handSizeBreakdown(hero: Character): Breakdown {
  const contributions: Contribution[] = [
    { kind: 'base', source: 'A dealt hand', detail: 'the flat allowance', amount: BALANCE.handSize },
    ...traitAdditive(hero, 'handSizeDelta'),
    ...talentTerm(hero, 'wideGrasp', talentsFor(hero.level).handSize),
  ];
  const raw = foldContributions(contributions);
  return {
    id: 'handSize',
    label: 'Hand size',
    total: handSizeFor(hero),
    contributions,
    formula: `${BALANCE.handSize} + oaths + talents, never below 3`,
    meaning: 'Cards drawn at the top of each of your turns.',
    note: raw < 3 ? `The terms sum to ${raw}; three is the floor.` : undefined,
  };
}

export function movBreakdown(hero: Character): Breakdown {
  const dex = hero.effectiveStat('DEX');
  const contributions: Contribution[] = [
    { kind: 'base', source: 'A walking pace', detail: 'the flat allowance', amount: 4 },
    { kind: 'stat', source: 'Dexterity', detail: `${dex} ÷ 15, rounded down`, amount: Math.floor(dex / 15) },
  ];
  if (hero.equipment.boots) contributions.push({ kind: 'implicit', source: hero.equipment.boots.name, detail: 'shod at all', amount: 1 });
  contributions.push(...traitAdditive(hero, 'moveBonus'));
  const raw = foldContributions(contributions);
  return {
    id: 'mov',
    label: 'MOV',
    total: movFor(hero),
    contributions,
    formula: '4 + Dexterity ÷ 15 + boots + oaths, never below 2',
    meaning: 'Tiles you may cross in one turn on a gate floor.',
    note: raw < 2 ? `The terms sum to ${raw}; two is the floor.` : undefined,
  };
}

export function lanternBreakdown(hero: Character): Breakdown {
  const luck = hero.effectiveStat('LUCK');
  const contributions: Contribution[] = [
    { kind: 'base', source: 'The Last Lantern', detail: 'its own reach', amount: BALANCE.lanternRadius },
    { kind: 'stat', source: 'Luck', detail: `${luck} ÷ 20, rounded down`, amount: Math.floor(luck / 20) },
  ];
  return {
    id: 'lantern',
    label: 'Lantern reach',
    total: lanternRadius(hero),
    contributions,
    formula: `${BALANCE.lanternRadius} + Luck ÷ 20`,
    meaning: 'How far the dark is held off you in the gates.',
  };
}

/** The combat block, in the order a player reads it. */
export function derivedBreakdowns(hero: Character): Breakdown[] {
  return [
    attackBreakdown(hero),
    magicBreakdown(hero),
    defenseBreakdown(hero),
    magicDefenseBreakdown(hero),
    maxHpBreakdown(hero),
    maxMpBreakdown(hero),
    critBreakdown(hero),
    vigorBreakdown(hero),
    handSizeBreakdown(hero),
    movBreakdown(hero),
    lanternBreakdown(hero),
  ];
}

// ---------------------------------------------------------------------------
// What the two defences actually turn aside
//
// Deliberately NOT a re-derivation: this calls the resolver's own
// `heroMitigation`, so the sheet cannot drift from the number the engine
// subtracts. Both schools are listed together because the only way to read
// Magic Defense honestly is against Defense — the player's real question is
// "which of my two walls is this blow going to meet, and how thick is it".
// ---------------------------------------------------------------------------

export interface MitigationLine {
  school: DamageSchool;
  /** How the player would name this kind of blow. */
  label: string;
  /** Which number the engine reads for it. */
  source: string;
  value: number;
  /** Taken off one incoming blow, before the blow is telegraphed. */
  turnsAside: number;
  meaning: string;
}

export function mitigationLines(hero: Character): MitigationLine[] {
  return [
    {
      school: 'physical',
      label: 'Muscle',
      source: 'Defense',
      value: hero.getDefense(),
      turnsAside: heroMitigation(hero, 'physical'),
      meaning: 'Claws, jaws, stone fists, a swordsman. Anything with no element and no Intellect behind it.',
    },
    {
      school: 'magical',
      label: 'Sorcery',
      source: 'Magic Defense',
      value: hero.getMagicDefense(),
      turnsAside: heroMitigation(hero, 'magical'),
      meaning: "Dragonfire, a soul-drain, a boss's decree, any skill that reads a caster's Intellect. Your Defense is no help against it.",
    },
  ];
}

// ---------------------------------------------------------------------------
// Card scaling
// ---------------------------------------------------------------------------

/** The engine's own conversion from a source stat to a card's added number. */
export function scalingBonusOf(sourceValue: number): number {
  return Math.floor(sourceValue / BALANCE.scalingDivisor);
}

export interface ScalingLine {
  scaling: CardScaling;
  /** Which number the card reads. */
  source: string;
  value: number;
  bonus: number;
  meaning: string;
}

/** The three hero-read scalings. MSTR/MINT read a party monster instead and
 *  are listed against each monster by the sheet. */
export function heroScalingLines(hero: Character): ScalingLine[] {
  const d = BALANCE.scalingDivisor;
  return [
    {
      scaling: 'STR',
      source: 'Attack',
      value: hero.getAttack(),
      bonus: scalingBonusOf(hero.getAttack()),
      meaning: `Strikes read your Attack and add it ÷ ${d}.`,
    },
    {
      scaling: 'INT',
      source: 'Magic Power',
      value: hero.getMagicPower(),
      bonus: scalingBonusOf(hero.getMagicPower()),
      meaning: `Spells read your Magic Power and add it ÷ ${d}.`,
    },
    {
      scaling: 'DEF',
      source: 'Defense',
      value: hero.getDefense(),
      bonus: scalingBonusOf(hero.getDefense()),
      meaning: `Guards read your Defense and add it ÷ ${d} to the Block they raise.`,
    },
  ];
}

/** How the hero's blood and oath bend numbers on their way out. */
export function shapingMultipliers(hero: Character): { label: string; value: number; terms: Contribution[]; meaning: string }[] {
  return [
    {
      label: 'Card damage',
      value: hero.traits.damageMult,
      terms: traitMultipliers(hero, 'damageMult'),
      meaning: 'Applied to every damage and drain card after scaling, before the enemy sees it.',
    },
    {
      label: 'Healing received',
      value: hero.traits.healMult,
      terms: traitMultipliers(hero, 'healMult'),
      meaning: 'Applied to every mending that reaches you.',
    },
    {
      label: 'Shop prices',
      value: hero.traits.shopDiscount,
      terms: traitMultipliers(hero, 'shopDiscount'),
      meaning: 'Applied to what the stalls ask of you.',
    },
  ];
}

/** Everything worn or waiting on the hero right now, worded for reading. */
export interface StandingEffect {
  kind: 'status' | 'mod';
  name: string;
  detail: string;
  good: boolean;
}

export function standingEffects(hero: Character): StandingEffect[] {
  const out: StandingEffect[] = [];
  for (const s of hero.statusEffects) {
    out.push({
      kind: 'status',
      name: s.name,
      detail: `${s.turns} turn${s.turns === 1 ? '' : 's'} remain${s.stacks ? ` · ${s.stacks} stacks` : ''}`,
      good: false,
    });
  }
  for (const m of hero.activeMods) {
    out.push({
      kind: 'mod',
      name: `${STAT_LABEL[m.stat]} ${m.amount > 0 ? '+' : ''}${m.amount}`,
      detail: `${m.turns} turn${m.turns === 1 ? '' : 's'} remain`,
      good: m.amount > 0,
    });
  }
  return out;
}
