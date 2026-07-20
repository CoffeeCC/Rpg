import type { ClassName, ItemTypeName, Stat } from '../types';

export interface ClassDef {
  description: string;
  mods: Partial<Record<Stat, number>>;
  /** Starting weapon base; generated as a Normal-rarity ilvl-1 item. */
  startingWeapon: ItemTypeName;
}

export const CLASSES: Record<ClassName, ClassDef> = {
  Warrior: {
    description: 'A front-line fighter who lives and dies by the sword.',
    mods: { STR: 3, DEF: 2, DEX: 0, MANA: -2, MAGDEF: 0, INT: -1, LUCK: 0 },
    startingWeapon: 'Sword',
  },
  Mage: {
    description: 'A spellcaster who trades raw toughness for magical power.',
    mods: { STR: -1, DEF: -1, DEX: 0, MANA: 4, MAGDEF: 2, INT: 3, LUCK: 0 },
    startingWeapon: 'Staff',
  },
  Thief: {
    description: "Fast, lucky, and happiest when something isn't nailed down.",
    mods: { STR: 1, DEF: -1, DEX: 4, MANA: 0, MAGDEF: 0, INT: 0, LUCK: 3 },
    startingWeapon: 'Sword',
  },
  Bard: {
    description: 'Fights with songs as much as steel.',
    mods: { STR: 0, DEF: 0, DEX: 1, MANA: 2, MAGDEF: 1, INT: 1, LUCK: 3 },
    startingWeapon: 'Staff',
  },
  Knight: {
    description: 'Slow, heavily armored, and hard to put down.',
    mods: { STR: 2, DEF: 4, DEX: -1, MANA: -1, MAGDEF: 1, INT: 0, LUCK: 0 },
    startingWeapon: 'Sword',
  },
};
