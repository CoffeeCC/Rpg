const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Character } = require('../src/entities/Character');

test('character creation applies race + class mods on top of base stats', () => {
  const c = new Character('Test', 'Dwarf', 'Warrior');
  // base 3 + Dwarf STR 3 + Warrior STR 3 = 9
  assert.equal(c.stats.STR, 9);
  assert.ok(c.maxHp > 0);
  assert.equal(c.hp, c.maxHp);
  assert.equal(c.equipment.weapon.name, 'Iron Sword');
});

test('gainExp levels up and grants attribute points', () => {
  const c = new Character('Test', 'Human', 'Mage');
  const leveled = c.gainExp(10); // level 1 needs 10 exp
  assert.equal(leveled, true);
  assert.equal(c.level, 2);
  assert.equal(c.attributePoints, 6);
});

test('gainExp can trigger multiple level ups at once', () => {
  const c = new Character('Test', 'Human', 'Mage');
  c.gainExp(10 + 20 + 30); // enough for level 1->2->3->4
  assert.equal(c.level, 4);
});

test('spendAttributePoint increases a stat and recomputes derived stats', () => {
  const c = new Character('Test', 'Human', 'Warrior');
  c.attributePoints = 1;
  const before = c.maxHp;
  c.spendAttributePoint('STR');
  assert.equal(c.attributePoints, 0);
  assert.ok(c.maxHp > before);
});

test('takeDamage clamps at zero and isAlive reflects it', () => {
  const c = new Character('Test', 'Human', 'Warrior');
  c.takeDamage(c.maxHp + 500);
  assert.equal(c.hp, 0);
  assert.equal(c.isAlive(), false);
});

test('equip applies item mods and unequip reverts them', () => {
  const c = new Character('Test', 'Human', 'Warrior');
  const ring = { slot: 'ring', displayName: 'Iron Ring', mods: [{ stat: 'LUCK', amount: 3 }] };
  const before = c.stats.LUCK;
  c.equip(ring);
  assert.equal(c.stats.LUCK, before + 3);

  const ring2 = { slot: 'ring', displayName: 'Steel Ring', mods: [{ stat: 'LUCK', amount: 5 }] };
  const previous = c.equip(ring2);
  assert.equal(previous, ring);
  assert.equal(c.stats.LUCK, before + 5);
  assert.ok(c.items.includes(ring));
});
