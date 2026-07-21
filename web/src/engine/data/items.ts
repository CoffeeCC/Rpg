import type { EquipmentSlot, ItemTypeName } from '../types';

// --- Base gear (used by lootGen) ---

export interface MaterialDef {
  quality: number; // 0-based rank within its list; higher = later-game
  valueMult: number;
}

export const MATERIALS: Record<string, MaterialDef> = {
  Broken: { quality: 0, valueMult: 0.2 },
  Rusted: { quality: 1, valueMult: 0.4 },
  Stone: { quality: 1, valueMult: 0.5 },
  Cloth: { quality: 1, valueMult: 0.5 },
  Wooden: { quality: 2, valueMult: 0.6 },
  Leather: { quality: 2, valueMult: 0.7 },
  Bronze: { quality: 3, valueMult: 1.0 },
  Iron: { quality: 4, valueMult: 1.4 },
  Carapace: { quality: 4, valueMult: 1.5 },
  Steel: { quality: 5, valueMult: 1.9 },
  Glass: { quality: 6, valueMult: 2.4 },
  Mithril: { quality: 7, valueMult: 3.2 },
  DragonScale: { quality: 8, valueMult: 4.5 },
};

export interface ItemTypeDef {
  slot: EquipmentSlot;
  primaryStat: 'Attack' | 'Magic' | 'Defense' | null;
  materials: string[]; // ordered worst -> best; ilvl indexes into this
  baseValue: number;
}

export const ITEM_TYPES: Record<ItemTypeName, ItemTypeDef> = {
  Sword: { slot: 'weapon', primaryStat: 'Attack', materials: ['Broken', 'Rusted', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril', 'DragonScale'], baseValue: 20 },
  Staff: { slot: 'weapon', primaryStat: 'Magic', materials: ['Broken', 'Wooden', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril', 'DragonScale'], baseValue: 20 },
  Armor: { slot: 'armor', primaryStat: 'Defense', materials: ['Cloth', 'Leather', 'Bronze', 'Iron', 'Steel', 'Mithril', 'DragonScale'], baseValue: 25 },
  Headpiece: { slot: 'headpiece', primaryStat: 'Defense', materials: ['Cloth', 'Leather', 'Bronze', 'Iron', 'Steel', 'Mithril', 'DragonScale'], baseValue: 15 },
  Glove: { slot: 'gloves', primaryStat: 'Defense', materials: ['Cloth', 'Leather', 'Carapace', 'Iron', 'Steel', 'Mithril', 'DragonScale'], baseValue: 10 },
  Boot: { slot: 'boots', primaryStat: 'Defense', materials: ['Cloth', 'Leather', 'Carapace', 'Iron', 'Steel', 'Mithril', 'DragonScale'], baseValue: 10 },
  Ring: { slot: 'ring', primaryStat: null, materials: ['Stone', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril'], baseValue: 30 },
  Amulet: { slot: 'amulet', primaryStat: null, materials: ['Stone', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril'], baseValue: 34 },
  Pendant: { slot: 'pendant', primaryStat: null, materials: ['Stone', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril'], baseValue: 34 },
  Charm: { slot: 'charm', primaryStat: null, materials: ['Stone', 'Bronze', 'Iron', 'Steel', 'Glass', 'Mithril'], baseValue: 44 },
  Trinket: { slot: 'trinket', primaryStat: null, materials: ['Bone', 'Bronze', 'Iron', 'Silver', 'Glass', 'Mithril'], baseValue: 40 },
};

// --- Consumables ---

export type ConsumableEffect =
  | { type: 'heal'; amount: number }
  | { type: 'mana'; amount: number }
  | { type: 'bait'; tameBonus: number };

export interface ConsumableDef {
  name: string;
  emoji: string;
  price: number;
  description: string;
  effect: ConsumableEffect;
}

export const CONSUMABLES: Record<string, ConsumableDef> = {
  Herb: { name: 'Herb', emoji: '🌿', price: 5, description: 'Restores 20 HP.', effect: { type: 'heal', amount: 20 } },
  Potion: { name: 'Potion', emoji: '🧪', price: 18, description: 'Restores 60 HP.', effect: { type: 'heal', amount: 60 } },
  Elixir: { name: 'Elixir', emoji: '⚗️', price: 60, description: 'Restores 200 HP.', effect: { type: 'heal', amount: 200 } },
  Water: { name: 'Water', emoji: '💧', price: 6, description: 'Restores 15 MP.', effect: { type: 'mana', amount: 15 } },
  Ether: { name: 'Ether', emoji: '🫧', price: 22, description: 'Restores 40 MP.', effect: { type: 'mana', amount: 40 } },
  Jerky: { name: 'Jerky', emoji: '🥓', price: 4, description: 'Tame bait: +10% tame chance this fight.', effect: { type: 'bait', tameBonus: 10 } },
  Sirloin: { name: 'Sirloin', emoji: '🥩', price: 12, description: 'Tame bait: +20% tame chance this fight.', effect: { type: 'bait', tameBonus: 20 } },
  PrimeSteak: { name: 'PrimeSteak', emoji: '🍖', price: 30, description: 'Tame bait: +35% tame chance this fight.', effect: { type: 'bait', tameBonus: 35 } },
};
