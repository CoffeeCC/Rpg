const { randInt } = require('../entities/Monster');
const { generateItem, describeItem } = require('./itemGenerator');
const { ITEM_EFFECTS } = require('../data/items');
const { colors } = require('../ui/io');

const DROP_CHANCE = 0.35;
const FLEE_BASE_CHANCE = 0.5;

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

// --- Pure combat math, unit-testable without any IO ---

function rollHit(attackerDex, defenderDex) {
  const chance = clamp(70 + (attackerDex - defenderDex) * 2, 10, 95);
  return randInt(100) < chance;
}

function computeAttackDamage(attacker, defender) {
  const raw = attacker.getAttack() - defender.getDefense() + randInt(3);
  return Math.max(1, raw);
}

function computeSpellDamage(caster, spell, defender) {
  const raw = caster.getMagicAttack() + spell.power - defender.getMagicDefense() + randInt(3);
  return Math.max(1, raw);
}

function applyDefendMitigation(rawDamage) {
  return Math.max(0, Math.round(rawDamage * 0.4));
}

function fleeSucceeds(playerDex, monsterDex) {
  const chance = clamp(FLEE_BASE_CHANCE + (playerDex - monsterDex) * 0.03, 0.1, 0.9);
  return Math.random() < chance;
}

// --- Interactive combat loop ---

function printCombatStatus(io, player, party, monster) {
  io.print(colors.yellow('----------------------------------------------------------------'));
  io.print(`${colors.blue(player.name)}  HP: ${player.hp}/${player.maxHp}  MP: ${player.mp}/${player.maxMp}  Lv${player.level}`);
  for (const member of party) {
    if (member === player) continue;
    io.print(`${colors.cyan(member.name)} (tamed)  HP: ${member.hp}/${member.maxHp}  Lv${member.level}`);
  }
  io.print(colors.red(`${monster.name}  HP: ${monster.hp}/${monster.maxHp}  Lv${monster.level}  Wild: ${monster.wild}`));
  if (monster.statusEffects.length) {
    io.print(colors.magenta(`${monster.name} is ${monster.statusEffects.map((s) => s.name).join(', ')}`));
  }
  io.print(colors.yellow('----------------------------------------------------------------'));
}

function monsterActs(io, monster, party) {
  const alive = party.filter((c) => c.isAlive());
  if (alive.length === 0) return;
  const target = alive[randInt(alive.length)];
  if (monster.hasStatus('Stunned')) {
    io.print(colors.magenta(`${monster.name} is Stunned and can't move!`));
    return;
  }
  if (!rollHit(monster.getAttack(), target.effectiveStat ? target.effectiveStat('DEX') : target.dexterity)) {
    io.print(colors.red(`${monster.name} attacks ${target.name} and misses!`));
    return;
  }
  let dmg = computeAttackDamage(monster, target);
  if (target._defending) dmg = applyDefendMitigation(dmg);
  target.takeDamage(dmg);
  io.print(colors.red(`${monster.name} attacks ${target.name} for ${dmg} damage!`));
}

// Runs one encounter to completion. Returns:
//   { result: 'victory' | 'fled' | 'defeat' | 'tamed', tamedMonster? }
function runCombat(io, player, party, monster) {
  for (const c of party) c._defending = false;

  while (true) {
    if (!monster.isAlive()) {
      io.print(colors.yellow(`\n${monster.name} was defeated!`));
      const leveled = player.gainExp(monster.exp);
      io.print(colors.green(`${player.name} gained ${monster.exp} EXP!`));
      if (leveled) io.print(colors.yellow(`${player.name} leveled up! Now level ${player.level}, with ${player.attributePoints} attribute points to spend.`));
      let droppedItem = null;
      if (Math.random() < DROP_CHANCE) {
        droppedItem = generateItem(player.effectiveStat('LUCK'));
        player.addItem(droppedItem);
        io.print(colors.green(`It dropped: ${describeItem(droppedItem)}`));
      }
      player.clearFightState();
      return { result: 'victory', droppedItem };
    }
    if (party.every((c) => !c.isAlive())) {
      io.print(colors.red(`\n${player.name}'s party has been defeated...`));
      return { result: 'defeat' };
    }

    io.clear();
    printCombatStatus(io, player, party, monster);

    if (!player.isAlive()) {
      // Leader is down but a tamed monster is still fighting - it just auto-attacks.
      io.print(colors.red(`${player.name} is down! The rest of the party fights on.`));
      monsterActs(io, monster, party.filter((c) => c.isAlive()));
      for (const member of party) {
        if (member !== player && member.isAlive() && monster.isAlive()) {
          const dmg = computeAttackDamage(member, monster);
          monster.takeDamage(dmg);
          io.print(colors.cyan(`${member.name} attacks ${monster.name} for ${dmg} damage!`));
        }
      }
      io.ask('(press enter to continue)');
      continue;
    }

    io.print(colors.blue('1: Attack\n2: Defend\n3: Magic/Skill\n4: Tame\n5: Items\n6: Flee'));
    const choice = io.ask('Choose an action...\n');
    player._defending = false;

    let playerTookTurn = true;
    switch (choice) {
      case '1': {
        if (!rollHit(player.effectiveStat('DEX'), monster.dexterity)) {
          io.print(colors.green(`${player.name} attacks and misses!`));
        } else {
          const dmg = computeAttackDamage(player, monster);
          monster.takeDamage(dmg);
          io.print(colors.green(`${player.name} attacks ${monster.name} for ${dmg} damage!`));
        }
        break;
      }
      case '2': {
        player._defending = true;
        io.print(colors.green(`${player.name} braces for impact.`));
        break;
      }
      case '3': {
        const options = [...player.spells, ...player.skills];
        if (options.length === 0) {
          io.print(colors.yellow(`${player.name} has no spells or skills.`));
          playerTookTurn = false;
          break;
        }
        options.forEach((s, i) => io.print(`${i + 1}: ${s.name}${s.mpCost ? ` (${s.mpCost} MP)` : ''}`));
        const pick = parseInt(io.ask('Choose a spell/skill...\n'), 10);
        const spell = options[pick - 1];
        if (!spell) {
          io.print(colors.yellow('Nothing happens.'));
          playerTookTurn = false;
          break;
        }
        if (spell.mpCost && !player.spendMp(spell.mpCost)) {
          io.print(colors.yellow(`${player.name} doesn't have enough MP!`));
          playerTookTurn = false;
          break;
        }
        if (spell.kind === 'heal') {
          const healed = player.heal(spell.power);
          io.print(colors.blue(`${player.name} casts ${spell.name} and recovers ${healed} HP!`));
        } else {
          let dmg = computeSpellDamage(player, spell, monster);
          if (spell.ignoreDefensePct) dmg += Math.round(monster.getDefense() * spell.ignoreDefensePct);
          monster.takeDamage(dmg);
          io.print(colors.green(`${player.name} uses ${spell.name} on ${monster.name} for ${dmg} damage!`));
          if (spell.debuff) {
            monster.tempMods[spell.debuff.stat === 'Defense' ? 'defense' : spell.debuff.stat] = (monster.tempMods[spell.debuff.stat] || 0) - spell.debuff.amount;
            io.print(colors.green(`${monster.name}'s ${spell.debuff.stat} was lowered!`));
          }
          if (spell.statusChance && Math.random() < spell.statusChance) {
            monster.applyStatus(spell.status, 2);
            io.print(colors.magenta(`${monster.name} was ${spell.status}!`));
          }
        }
        break;
      }
      case '4': {
        io.print(colors.green(`${player.name} attempts to tame ${monster.name}...`));
        if (monster.tameChanceRoll()) {
          io.print(colors.green(`${monster.name} was successfully tamed!`));
          monster.isTamed = true;
          return { result: 'tamed', tamedMonster: monster };
        }
        io.print(colors.red(`${monster.name} resisted!`));
        break;
      }
      case '5': {
        if (player.inventory.length === 0) {
          io.print(colors.yellow('No items to use.'));
          playerTookTurn = false;
          break;
        }
        player.inventory.forEach((name, i) => io.print(`${i + 1}: ${name}`));
        const pick = parseInt(io.ask('Use which item?\n'), 10);
        const itemName = player.inventory[pick - 1];
        const effect = itemName ? ITEM_EFFECTS[itemName] : null;
        if (!effect) {
          io.print(colors.yellow('Nothing happens.'));
          playerTookTurn = false;
          break;
        }
        player.removeConsumable(itemName);
        if (effect.type === 'bait') {
          const wild = monster.reduceWild(effect.wildReduction);
          io.print(colors.green(`${itemName} was offered to ${monster.name}. Wild is now ${wild}.`));
        } else if (effect.type === 'heal') {
          const healed = player.heal(effect.amount);
          io.print(colors.green(`${player.name} eats ${itemName} and recovers ${healed} HP.`));
        } else if (effect.type === 'mana') {
          const restored = player.restoreMp(effect.amount);
          io.print(colors.green(`${player.name} drinks ${itemName} and recovers ${restored} MP.`));
        }
        break;
      }
      case '6': {
        if (fleeSucceeds(player.effectiveStat('DEX'), monster.dexterity)) {
          io.print(colors.green(`${player.name}'s party flees safely!`));
          player.clearFightState();
          return { result: 'fled' };
        }
        io.print(colors.red(`${player.name} couldn't get away!`));
        break;
      }
      default:
        io.print(colors.yellow('Nothing happens.'));
        playerTookTurn = false;
    }

    if (!playerTookTurn) {
      io.ask('(press enter to continue)');
      continue;
    }

    if (monster.isAlive()) {
      monsterActs(io, monster, party);
      for (const member of party) {
        if (member !== player && member.isAlive()) {
          const dmg = computeAttackDamage(member, monster);
          if (rollHit(member.effectiveStat ? member.effectiveStat('DEX') : member.dexterity, monster.dexterity)) {
            monster.takeDamage(dmg);
            io.print(colors.cyan(`${member.name} attacks ${monster.name} for ${dmg} damage!`));
          }
        }
      }
    }

    const statusLogs = [...player.tickStatus(), ...monster.tickStatus()];
    for (const log of statusLogs) io.print(colors.magenta(log));

    io.ask('(press enter to continue)');
  }
}

module.exports = {
  rollHit,
  computeAttackDamage,
  computeSpellDamage,
  applyDefendMitigation,
  fleeSucceeds,
  runCombat,
};
