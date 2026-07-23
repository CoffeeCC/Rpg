import type { Stat, StatusName } from '../types';

/** Player-facing label for each stat, as it should appear in generated text
 * ("Strength" rather than "STR"). Shared between describeEffect's sentence
 * generation and the keyword glossary so they can't drift out of sync. */
export const STAT_LABEL: Record<Stat, string> = {
  STR: 'Strength',
  DEF: 'Defense',
  DEX: 'Dexterity',
  MANA: 'Mana',
  MAGDEF: 'Magic Defense',
  INT: 'Intellect',
  LUCK: 'Luck',
};

const STAT_DESC: Record<Stat, string> = {
  STR: 'Increases damage on Strength-scaling cards and raises your max HP.',
  DEF: 'Reduces damage taken from physical attacks and raises your max HP.',
  DEX: 'Increases movement points on the gate map and improves your odds in speed-based checks.',
  MANA: 'Increases your maximum MP, the resource some skills spend.',
  MAGDEF: 'Reduces damage taken from magic attacks.',
  INT: 'Increases damage on Intellect-scaling spells.',
  LUCK: 'Increases your chance to land a critical hit.',
};

/** Plain-language glossary for the card-inspect view — "Apply Encroach for
 * 12 turns" means nothing on its own, so spell out what the keyword does. */
export const STATUS_DESC: Record<StatusName, string> = {
  Burned: 'Deals fire damage at the start of each of its turns.',
  Poisoned: 'Deals dark damage at the start of each of its turns.',
  Stunned: 'Skips its next action entirely.',
  Frozen: 'Takes 25% more damage while it lasts.',
  Fated: "Does nothing until it expires, then detonates for a heavy burst of damage — it's a delayed strike, not a per-turn one.",
  Encroach: "Deals dark damage every turn that grows larger each time — it doesn't decay and can't be cleansed.",
};

const MECHANIC_DESC: Record<string, string> = {
  Block: 'A shield that absorbs incoming damage before it touches your HP. Clears at the start of your next turn unless something says otherwise.',
  Energy: 'The resource spent to play cards. Refills at the start of your turn.',
  Exhaust: 'Removed from play for the rest of this battle after use, instead of going to your discard pile.',
};

export type KeywordCategory = 'status' | 'stat' | 'mechanic';

export interface KeywordInfo {
  category: KeywordCategory;
  description: string;
}

/** Every term the card-inspect view will highlight and explain on hover/tap.
 * Keyed by the exact word(s) as they appear in generated card text, so the
 * highlighter can match on it directly. */
export const KEYWORDS: Record<string, KeywordInfo> = {
  ...Object.fromEntries(
    (Object.entries(STATUS_DESC) as [StatusName, string][]).map(([status, description]) => [status, { category: 'status' as const, description }])
  ),
  ...Object.fromEntries(
    (Object.entries(STAT_LABEL) as [Stat, string][]).map(([stat, label]) => [label, { category: 'stat' as const, description: STAT_DESC[stat] }])
  ),
  ...Object.fromEntries(Object.entries(MECHANIC_DESC).map(([term, description]) => [term, { category: 'mechanic' as const, description }])),
};
