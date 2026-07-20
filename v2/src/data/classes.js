// Additive stat modifiers, starting gear, and abilities per class.
// Original game only ever implemented Mage - the rest are new here.

const CLASSES = {
  Warrior: {
    description: 'A front-line fighter who lives and dies by the sword.',
    mods: { STR: 3, DEF: 2, DEX: 0, MANA: -2, MAGDEF: 0, INT: -1, LUCK: 0 },
    weapon: { name: 'Iron Sword', Attack: 4, Magic: 0 },
    armor: { name: 'Traveler\'s Mail', Defense: 3, Magic: 0 },
    spells: [],
    skills: [
      { id: 1, name: 'Warcry', mpCost: 0, kind: 'buff', power: 3, description: 'Raises Strength for the rest of the fight.' },
    ],
  },
  Mage: {
    description: 'A spellcaster who trades raw toughness for magical power.',
    mods: { STR: -1, DEF: -1, DEX: 0, MANA: 4, MAGDEF: 2, INT: 3, LUCK: 0 },
    weapon: { name: 'Wooden Staff', Attack: 1, Magic: 5 },
    armor: { name: 'Apprentice Robes', Defense: 1, Magic: 2 },
    spells: [
      { id: 1, name: 'Flare', mpCost: 4, kind: 'damage', power: 5, statusChance: 0.3, status: 'Burned', color: 'red' },
      { id: 2, name: 'Stun', mpCost: 3, kind: 'damage', power: 1, statusChance: 0.2, status: 'Stunned', color: 'yellow' },
      { id: 3, name: 'Spout', mpCost: 5, kind: 'heal', power: 8, color: 'blue' },
    ],
    skills: [],
  },
  Thief: {
    description: 'Fast, lucky, and happiest when something isn\'t nailed down.',
    mods: { STR: 1, DEF: -1, DEX: 4, MANA: 0, MAGDEF: 0, INT: 0, LUCK: 3 },
    weapon: { name: 'Rusty Dagger', Attack: 3, Magic: 0 },
    armor: { name: 'Leather Vest', Defense: 1, Magic: 0 },
    spells: [],
    skills: [
      { id: 1, name: 'Backstab', mpCost: 0, kind: 'damage', power: 6, description: 'A vicious strike that ignores some defense.', ignoreDefensePct: 0.5 },
    ],
  },
  Bard: {
    description: 'Fights with songs as much as steel.',
    mods: { STR: 0, DEF: 0, DEX: 1, MANA: 2, MAGDEF: 1, INT: 1, LUCK: 3 },
    weapon: { name: 'Traveler\'s Lute', Attack: 1, Magic: 2 },
    armor: { name: 'Performer\'s Coat', Defense: 1, Magic: 1 },
    spells: [
      { id: 1, name: 'Dirge', mpCost: 3, kind: 'damage', power: 3, statusChance: 0.25, status: 'Stunned', color: 'yellow' },
    ],
    skills: [],
  },
  Knight: {
    description: 'Slow, heavily armored, and hard to put down.',
    mods: { STR: 2, DEF: 4, DEX: -1, MANA: -1, MAGDEF: 1, INT: 0, LUCK: 0 },
    weapon: { name: 'Longsword', Attack: 3, Magic: 0 },
    armor: { name: 'Plate Armor', Defense: 5, Magic: 0 },
    spells: [],
    skills: [
      { id: 1, name: 'Guard Break', mpCost: 0, kind: 'damage', power: 2, description: 'Lowers the target\'s Defense for the rest of the fight.', debuff: { stat: 'Defense', amount: 2 } },
    ],
  },
};

module.exports = { CLASSES };
