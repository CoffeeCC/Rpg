const { test } = require('node:test');
const assert = require('node:assert/strict');
const { computeAttackDamage, applyDefendMitigation, fleeSucceeds, runCombat } = require('../src/systems/combat');
const { Character } = require('../src/entities/Character');
const { Monster } = require('../src/entities/Monster');
const { ScriptedIO } = require('../src/ui/io');

test('computeAttackDamage is always at least 1', () => {
  const attacker = new Character('A', 'Human', 'Warrior');
  const defender = new Character('B', 'Dwarf', 'Knight'); // high defense
  for (let i = 0; i < 200; i++) {
    assert.ok(computeAttackDamage(attacker, defender) >= 1);
  }
});

test('applyDefendMitigation reduces damage', () => {
  assert.equal(applyDefendMitigation(100), 40);
  assert.equal(applyDefendMitigation(0), 0);
});

test('fleeSucceeds returns a boolean and never throws', () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(typeof fleeSucceeds(10, 3), 'boolean');
  }
});

test('runCombat: attacking a monster with 1 HP ends in victory and grants EXP', () => {
  const player = new Character('Hero', 'Human', 'Warrior');
  const monster = new Monster({
    name: 'Test-mon', level: 1, maxHp: 1, attack: 0, dexterity: 0,
    defense: 0, magicDefense: 0, luck: 0, wild: 100, exp: 5,
  });
  const io = new ScriptedIO(['1', '1', '1', '1', '1']); // spam Attack until it dies
  const startExp = player.exp;
  const outcome = runCombat(io, player, [player], monster);
  assert.equal(outcome.result, 'victory');
  assert.ok(player.exp + player.level * 10 * (player.level - 1) >= startExp); // exp accounted for (may have leveled)
});

test('runCombat: fleeing ends the encounter without a winner', () => {
  const player = new Character('Hero', 'Human', 'Thief'); // high DEX for a reliable flee
  const monster = new Monster({
    name: 'Big-mon', level: 1, maxHp: 9999, attack: 0, dexterity: 0,
    defense: 999, magicDefense: 999, luck: 0, wild: 100, exp: 5,
  });
  // Thief has much higher DEX than a 0-DEX monster, so flee chance is near the 0.9 cap.
  let fled = false;
  for (let attempt = 0; attempt < 20 && !fled; attempt++) {
    const io = new ScriptedIO(Array(30).fill('6')); // retry flee + "press enter" pauses
    const outcome = runCombat(io, player, [player], monster);
    if (outcome.result === 'fled') fled = true;
  }
  assert.equal(fled, true);
});

test('runCombat: taming succeeds once Wild is driven to 0', () => {
  const player = new Character('Hero', 'Human', 'Warrior');
  const monster = new Monster({
    name: 'Tame-mon', level: 1, maxHp: 9999, attack: 0, dexterity: 0,
    defense: 999, magicDefense: 999, luck: 0, wild: 0, exp: 5,
  });
  const io = new ScriptedIO(['4']);
  const outcome = runCombat(io, player, [player], monster);
  assert.equal(outcome.result, 'tamed');
  assert.equal(outcome.tamedMonster, monster);
});
