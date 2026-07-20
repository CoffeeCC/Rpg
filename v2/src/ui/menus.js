const { colors } = require('./io');
const { describeItem } = require('../systems/itemGenerator');

function printHud(io, player, location) {
  io.print(colors.yellow('----------------------------------------------------------------'));
  io.print(`Location: ${location}   Progress: ${player.progress}`);
  io.print(`Name: ${player.name}   Level: ${player.level}   EXP: ${player.exp}/${player.level * 10}`);
  io.print(`HP: ${player.hp}/${player.maxHp}   MP: ${player.mp}/${player.maxMp}   Gold: ${player.gold}`);
  io.print(`Race: ${player.race}   Class: ${player.className}`);
  io.print(colors.yellow('----------------------------------------------------------------'));
}

function runCharacterSheet(io, player) {
  while (true) {
    io.clear();
    io.print(colors.yellow('----------------------------------------------------------------'));
    io.print(`${player.name} - Level ${player.level} ${player.race} ${player.className}`);
    io.print(`EXP: ${player.exp}/${player.level * 10}   Attribute points: ${player.attributePoints}`);
    io.print('');
    io.print(`1: STR  ${player.stats.STR}`);
    io.print(`2: DEF  ${player.stats.DEF}`);
    io.print(`3: DEX  ${player.stats.DEX}`);
    io.print(`4: MANA ${player.stats.MANA}`);
    io.print(`5: MAGDEF ${player.stats.MAGDEF}`);
    io.print(`6: INT  ${player.stats.INT}`);
    io.print(`7: LUCK ${player.stats.LUCK}`);
    io.print(colors.yellow('----------------------------------------------------------------'));

    if (player.attributePoints <= 0) {
      io.ask('Type 1 to return to the main screen\n');
      return;
    }
    const choice = io.ask('Which attribute would you like to increase? (0 to stop)\n');
    const statByChoice = { 1: 'STR', 2: 'DEF', 3: 'DEX', 4: 'MANA', 5: 'MAGDEF', 6: 'INT', 7: 'LUCK' };
    const stat = statByChoice[choice];
    if (!stat) return;
    player.spendAttributePoint(stat);
    io.print(colors.green(`${stat} increased by 1!`));
  }
}

function runEquipmentMenu(io, player) {
  while (true) {
    io.clear();
    io.print(colors.green('Current Equipment'));
    io.print(colors.yellow('----------------------------------------------------------------'));
    for (const slot of ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring']) {
      const equipped = player.equipment[slot];
      io.print(`${slot}: ${equipped ? equipped.displayName || equipped.name : '(empty)'}`);
    }
    io.print(colors.yellow('----------------------------------------------------------------'));

    if (player.items.length === 0) {
      io.ask('Bag is empty. Type 1 to return to the main screen\n');
      return;
    }
    io.print('Bag:');
    player.items.forEach((item, i) => io.print(`${i + 1}: ${describeItem(item)}`));
    const pick = io.ask('\nEquip which item? (0 to go back)\n');
    const idx = parseInt(pick, 10) - 1;
    const item = player.items[idx];
    if (!item) return;
    const previous = player.equip(item);
    io.print(colors.green(`Equipped ${item.displayName}.${previous ? ` ${previous.displayName} was unequipped.` : ''}`));
    io.ask('(press enter to continue)');
  }
}

function runPartyMenu(io, party) {
  io.clear();
  io.print(colors.green('Party'));
  io.print(colors.yellow('----------------------------------------------------------------'));
  for (const member of party) {
    const tag = member.isTamed ? ' (tamed)' : '';
    io.print(`${member.name}${tag} - Level ${member.level}  HP: ${member.hp}/${member.maxHp}`);
  }
  io.print(colors.yellow('----------------------------------------------------------------'));
  io.ask('Type 1 to return to the main screen\n');
}

module.exports = { printHud, runCharacterSheet, runEquipmentMenu, runPartyMenu };
