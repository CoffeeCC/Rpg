const { Character } = require('./entities/Character');
const { Monster, randInt } = require('./entities/Monster');
const { RACES } = require('./data/races');
const { CLASSES } = require('./data/classes');
const { runCombat } = require('./systems/combat');
const { runShop } = require('./systems/shop');
const { search } = require('./systems/exploration');
const { printHud, runCharacterSheet, runEquipmentMenu, runPartyMenu } = require('./ui/menus');
const { colors } = require('./ui/io');

const MAX_PARTY_SIZE = 3;
const ENCOUNTER_CHANCE = 0.5;

function createCharacter(io) {
  const raceNames = Object.keys(RACES);
  const classNames = Object.keys(CLASSES);

  while (true) {
    io.clear();
    const name = io.ask(colors.green('Please enter your name...\n\n'));

    io.clear();
    io.print(colors.green('Please choose a Race\n'));
    raceNames.forEach((r, i) => io.print(`${i + 1}: ${r} - ${RACES[r].description}`));
    const raceIdx = parseInt(io.ask('\n'), 10) - 1;
    const race = raceNames[raceIdx] || raceNames[0];

    io.clear();
    io.print(colors.green('Please choose a Class\n'));
    classNames.forEach((c, i) => io.print(`${i + 1}: ${c} - ${CLASSES[c].description}`));
    const classIdx = parseInt(io.ask('\n'), 10) - 1;
    const className = classNames[classIdx] || classNames[0];

    io.clear();
    io.print(colors.yellow('----------------------------------------------------------------'));
    io.print(`Name:  ${colors.blue(name)}`);
    io.print(`Race:  ${colors.blue(race)}`);
    io.print(`Class: ${colors.blue(className)}`);
    io.print(colors.yellow('----------------------------------------------------------------'));
    const confirm = io.ask(colors.green('Does everything look correct? Begin? (Y/N)\n'));
    if (confirm === 'Y' || confirm === 'y') {
      return new Character(name, race, className);
    }
  }
}

function moveForward(io, player, party) {
  player.progress++;
  player.searchesRemaining = 1;
  io.clear();
  if (Math.random() < ENCOUNTER_CHANCE) {
    const monster = Monster.generate(player.level);
    const outcome = runCombat(io, player, party, monster);
    if (outcome.result === 'defeat') return 'defeat';
    if (outcome.result === 'tamed') {
      if (party.length < MAX_PARTY_SIZE) {
        party.push(outcome.tamedMonster);
        io.print(colors.green(`${outcome.tamedMonster.name} joins the party!`));
      } else {
        io.print(colors.yellow(`Party is full - ${outcome.tamedMonster.name} wanders off.`));
      }
      io.ask('(press enter to continue)');
    }
  } else {
    io.print(colors.green('You press onward. The path ahead is quiet.'));
    io.ask('(press enter to continue)');
  }
  return 'ok';
}

function rest(io, player, party) {
  for (const c of party) {
    c.heal(c.maxHp);
    if (c.mp !== undefined) c.restoreMp(c.maxMp);
  }
  io.print(colors.green('The party rests. HP and MP fully restored.'));
  io.ask('(press enter to continue)');
}

function runGame(io) {
  const player = createCharacter(io);
  const party = [player];
  const location = 'Town';

  io.clear();
  io.print(colors.yellow(`Welcome, ${player.name}! Your adventure begins.`));
  io.ask('(press enter to continue)');

  while (true) {
    if (!player.isAlive()) {
      io.clear();
      io.print(colors.red(`${player.name} has fallen. Game over.`));
      return 'defeat';
    }

    io.clear();
    printHud(io, player, location);
    io.print('1: Move Forward\n2: Rest\n3: Shop\n4: Search\n5: Character\n6: Equipment\n7: Party\n8: Quit');
    const choice = io.ask(colors.yellow('----------------------------------------------------------------\n'));

    switch (choice) {
      case '1': {
        const result = moveForward(io, player, party);
        if (result === 'defeat') {
          io.clear();
          io.print(colors.red('Your party has been defeated. Game over.'));
          return 'defeat';
        }
        break;
      }
      case '2':
        rest(io, player, party);
        break;
      case '3':
        runShop(io, player);
        break;
      case '4':
        search(io, player);
        io.ask('(press enter to continue)');
        break;
      case '5':
        runCharacterSheet(io, player);
        break;
      case '6':
        runEquipmentMenu(io, player);
        break;
      case '7':
        runPartyMenu(io, party);
        break;
      case '8':
        io.print(colors.green('Goodbye!'));
        return 'quit';
      default:
        io.print(colors.yellow('Not a valid choice.'));
        io.ask('(press enter to continue)');
    }
  }
}

module.exports = { runGame, createCharacter };
