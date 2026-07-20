const { test } = require('node:test');
const assert = require('node:assert/strict');
const { generateItem, rollMods } = require('../src/systems/itemGenerator');
const { ITEM_TYPES } = require('../src/data/items');

test('generateItem always produces a valid, known item type and slot', () => {
  for (let i = 0; i < 200; i++) {
    const item = generateItem(0);
    assert.ok(Object.keys(ITEM_TYPES).includes(item.itemType));
    assert.equal(item.slot, ITEM_TYPES[item.itemType].slot);
    assert.ok(item.value >= 1);
  }
});

test('generateItem only rolls materials valid for that item type', () => {
  for (let i = 0; i < 200; i++) {
    const item = generateItem(0);
    assert.ok(ITEM_TYPES[item.itemType].materials.includes(item.material));
  }
});

test('rollMods never returns duplicate stats and respects quality count', () => {
  const mods = rollMods(4);
  const stats = mods.map((m) => m.stat);
  assert.equal(stats.length, new Set(stats).size);
  assert.ok(mods.length <= 4);
});

test('rollMods returns nothing for non-positive quality', () => {
  assert.deepEqual(rollMods(0), []);
  assert.deepEqual(rollMods(-3), []);
});

test('weapon items only ever get Attack or Magic, never Defense', () => {
  for (let i = 0; i < 200; i++) {
    const item = generateItem(5);
    if (item.itemType === 'Sword') assert.equal(item.Defense, 0);
    if (item.itemType === 'Armor') assert.equal(item.Attack, 0);
  }
});
