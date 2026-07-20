const { runGame } = require('./src/game');
const { ConsoleIO } = require('./src/ui/io');

runGame(new ConsoleIO());
