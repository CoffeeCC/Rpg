const { MATERIALS, ITEM_TYPES, STAT_MODS } = require('../data/items');
const { randInt } = require('../entities/Monster');

const BASE_VALUE = { Sword: 20, Staff: 20, Armor: 25, Headpiece: 15, Glove: 10, Boot: 10, Ring: 30 };

// Picks up to `quality` distinct bonus stats (no duplicates - the original
// game's Mods array allowed the same stat to be rolled multiple times).
function rollMods(quality) {
  const count = Math.max(0, quality);
  const pool = [...STAT_MODS];
  const mods = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = randInt(pool.length);
    const stat = pool.splice(idx, 1)[0];
    const amount = 1 + Math.floor(quality / 3);
    mods.push({ stat, amount });
  }
  return mods;
}

// Generates one randomized item. `luck` nudges quality upward slightly.
function generateItem(luck = 0) {
  const typeNames = Object.keys(ITEM_TYPES);
  const itemType = typeNames[randInt(typeNames.length)];
  const typeInfo = ITEM_TYPES[itemType];

  const materialRoll = Math.min(
    typeInfo.materials.length - 1,
    Math.max(0, randInt(typeInfo.materials.length) + Math.floor(randInt(luck + 1) / 4))
  );
  const material = typeInfo.materials[materialRoll];
  const quality = MATERIALS[material].quality;

  const mods = rollMods(quality);

  const item = {
    itemType,
    material,
    displayName: `${material} ${itemType}`,
    slot: typeInfo.slot,
    quality,
    Attack: 0,
    Magic: 0,
    Defense: 0,
    mods,
    value: Math.max(1, Math.round(BASE_VALUE[itemType] * MATERIALS[material].valueMult * (1 + 0.15 * mods.length))),
  };

  const primaryBonus = Math.max(1, 2 + quality);
  if (typeInfo.primaryStat === 'Attack') item.Attack = primaryBonus;
  else if (typeInfo.primaryStat === 'Magic') item.Magic = primaryBonus;
  else if (typeInfo.primaryStat === 'Defense') item.Defense = primaryBonus;
  // Rings have no primaryStat - their value comes entirely from mods.

  return item;
}

function describeItem(item) {
  const parts = [`${item.displayName} (Quality ${item.quality >= 0 ? '+' : ''}${item.quality}, ${item.value}g)`];
  if (item.Attack) parts.push(`Attack +${item.Attack}`);
  if (item.Magic) parts.push(`Magic +${item.Magic}`);
  if (item.Defense) parts.push(`Defense +${item.Defense}`);
  for (const mod of item.mods) parts.push(`${mod.stat} +${mod.amount}`);
  return parts.join(', ');
}

module.exports = { generateItem, describeItem, rollMods };
