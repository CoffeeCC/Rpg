const { test } = require('node:test');
const assert = require('node:assert/strict');
const { runGame } = require('../src/game');

// Drives the entire game (character creation -> exploring -> combat -> menus)
// end to end with a rule-based bot instead of a human, so the whole loop gets
// exercised the same way a real playthrough would without needing a real
// terminal or piped stdin.
class BotIO {
  constructor() {
    this.printed = [];
    this.moveForwardCount = 0;
    this.askCount = 0;
  }

  print(msg = '') {
    this.printed.push(String(msg));
  }

  clear() {}

  ask(prompt) {
    this.askCount++;
    if (this.askCount > 5000) throw new Error('BotIO exceeded safety budget - likely an infinite loop');

    if (prompt.includes('enter your name')) return 'TestHero';
    if (prompt.includes('Does everything look correct')) return 'Y';
    if (prompt.includes('Choose an action')) return '1'; // always Attack in combat
    if (prompt.includes('Choose a spell')) return '1';

    // Anything else is either the main menu or a "press enter" pause.
    // Cap how many times we choose "Move Forward" so the game terminates.
    this.moveForwardCount++;
    if (this.moveForwardCount > 15) return '8'; // Quit
    return '1';
  }
}

test('full playthrough smoke test: character creation through combat to quit', () => {
  const io = new BotIO();
  const result = runGame(io);

  assert.ok(['quit', 'defeat'].includes(result));
  assert.ok(io.printed.some((line) => line.includes('Welcome, TestHero')));
  assert.ok(io.askCount < 5000, 'should not have hit the safety budget');

  // If the party survived to the quit path, sanity-check nothing crashed silently.
  if (result === 'quit') {
    assert.ok(io.printed.some((line) => line.includes('Goodbye')));
  } else {
    assert.ok(io.printed.some((line) => line.includes('Game over')));
  }
});

test('running the smoke test twice produces independent, non-throwing games', () => {
  for (let i = 0; i < 3; i++) {
    const io = new BotIO();
    assert.doesNotThrow(() => runGame(io));
  }
});
