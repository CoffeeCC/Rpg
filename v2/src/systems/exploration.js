const { generateItem, describeItem } = require('./itemGenerator');
const { colors } = require('../ui/io');
const { randInt } = require('../entities/Monster');

const COMMON_FINDS = ['Herb', 'Water', 'Jerky'];
const RARE_FIND_CHANCE = 0.15;
const FIND_CHANCE = 0.6;

// One search attempt at the current location. Returns a log line for callers
// that want it (the interactive loop also prints directly via io).
function search(io, player) {
  if (player.searchesRemaining <= 0) {
    io.print(colors.yellow('You have already searched this area thoroughly.'));
    return;
  }
  player.searchesRemaining--;
  io.print(colors.green('You search the area for anything useful...'));
  if (Math.random() >= FIND_CHANCE) {
    io.print(colors.green('You found nothing of note.'));
    return;
  }
  if (Math.random() < RARE_FIND_CHANCE) {
    const item = generateItem(player.effectiveStat('LUCK'));
    player.addItem(item);
    io.print(colors.green(`You found: ${describeItem(item)}`));
    return;
  }
  const found = COMMON_FINDS[randInt(COMMON_FINDS.length)];
  player.addConsumable(found);
  io.print(colors.green(`You found a ${found}.`));
}

module.exports = { search };
