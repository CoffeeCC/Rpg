import type { RaceName, Stat } from '../types';

export interface RaceDef {
  description: string;
  mods: Partial<Record<Stat, number>>;
}

export const RACES: Record<RaceName, RaceDef> = {
  Human: {
    description: 'Balanced and adaptable. No glaring weaknesses.',
    mods: { STR: 1, DEF: 1, DEX: 1, MANA: 1, MAGDEF: 1, INT: 1, LUCK: 1 },
  },
  Elf: {
    description: 'Quick and magically gifted, but physically frail.',
    mods: { STR: -1, DEF: -1, DEX: 3, MANA: 3, MAGDEF: 2, INT: 3, LUCK: 1 },
  },
  Dwarf: {
    description: 'Sturdy and strong, but slow and mentally rigid.',
    mods: { STR: 3, DEF: 3, DEX: -1, MANA: -1, MAGDEF: 1, INT: -1, LUCK: 1 },
  },
  Orc: {
    description: 'Brutal and tough, with little patience for magic.',
    mods: { STR: 4, DEF: 2, DEX: 0, MANA: -2, MAGDEF: -1, INT: -2, LUCK: 0 },
  },
};
