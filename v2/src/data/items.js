// Material quality determines how good a generated item is, and its shop value.
// Expanded from the original's per-type if-chains into one shared table.
const MATERIALS = {
  Broken: { quality: -3, valueMult: 0.2 },
  Rusted: { quality: -2, valueMult: 0.4 },
  Stone: { quality: -1, valueMult: 0.6 },
  Cloth: { quality: 0, valueMult: 0.8 },
  Wooden: { quality: 0, valueMult: 0.8 },
  Leather: { quality: 0, valueMult: 0.9 },
  Brass: { quality: 1, valueMult: 1.0 },
  Bronze: { quality: 1, valueMult: 1.1 },
  Carapace: { quality: 2, valueMult: 1.3 },
  Iron: { quality: 2, valueMult: 1.4 },
  Steel: { quality: 3, valueMult: 1.8 },
  Glass: { quality: 4, valueMult: 2.0 },
  Mithril: { quality: 5, valueMult: 3.0 },
  DragonScale: { quality: 6, valueMult: 4.0 },
};

// Which materials each item type can roll, and what slot/stat it affects.
const ITEM_TYPES = {
  Sword: { slot: 'weapon', primaryStat: 'Attack', materials: ['Broken', 'Rusted', 'Stone', 'Bronze', 'Iron', 'Steel', 'Glass'] },
  Staff: { slot: 'weapon', primaryStat: 'Magic', materials: ['Broken', 'Wooden', 'Stone', 'Bronze', 'Iron', 'Steel', 'Glass'] },
  Armor: { slot: 'armor', primaryStat: 'Defense', materials: ['Broken', 'Rusted', 'Leather', 'Wooden', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril'] },
  Headpiece: { slot: 'headpiece', primaryStat: 'Defense', materials: ['Broken', 'Rusted', 'Stone', 'Bronze', 'Iron', 'Steel', 'Mithril', 'Glass', 'DragonScale'] },
  Glove: { slot: 'gloves', primaryStat: 'Defense', materials: ['Broken', 'Rusted', 'Stone', 'Bronze', 'Iron', 'Steel', 'Glass', 'Carapace'] },
  Boot: { slot: 'boots', primaryStat: 'Defense', materials: ['Broken', 'Rusted', 'Cloth', 'Leather', 'Iron', 'Steel', 'Mithril', 'Carapace'] },
  Ring: { slot: 'ring', primaryStat: null, materials: ['Broken', 'Rusted', 'Stone', 'Bronze', 'Iron', 'Steel', 'Glass'] },
};

// Bonus stat mods a high-quality item can roll, beyond its primary stat.
const STAT_MODS = ['HP', 'MP', 'STR', 'DEF', 'LUCK', 'MANA', 'INT', 'DEX'];

const SHOP_INVENTORY = {
  Jerky: { price: 3, description: 'Cheap taming bait.' },
  Sirloin: { price: 8, description: 'Better taming bait.' },
  Water: { price: 1, description: 'Restores a little MP.' },
  Herb: { price: 5, description: 'Restores a little HP.' },
};

// What each consumable actually does when used, e.g. in combat via the
// "Items" action or while exploring.
const ITEM_EFFECTS = {
  Jerky: { type: 'bait', wildReduction: 15 },
  Sirloin: { type: 'bait', wildReduction: 30 },
  Herb: { type: 'heal', amount: 20 },
  Water: { type: 'mana', amount: 15 },
};

module.exports = { MATERIALS, ITEM_TYPES, STAT_MODS, SHOP_INVENTORY, ITEM_EFFECTS };
