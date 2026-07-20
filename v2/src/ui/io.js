// All game logic talks to an IO interface instead of readline-sync/console
// directly. That lets tests drive the entire game with scripted input instead
// of spawning a real subprocess and piping stdin.
const colors = require('colors/safe');

class ConsoleIO {
  print(msg = '') {
    console.log(msg);
  }

  ask(prompt) {
    const input = require('readline-sync');
    return input.question(prompt);
  }

  clear() {
    console.clear();
  }
}

class ScriptedIO {
  constructor(answers = []) {
    this.answers = [...answers];
    this.log = [];
  }

  print(msg = '') {
    this.log.push(String(msg));
  }

  ask(prompt) {
    this.log.push(`ASK: ${prompt}`);
    if (this.answers.length === 0) {
      throw new Error(`ScriptedIO ran out of answers. Last prompt: ${prompt}`);
    }
    return this.answers.shift();
  }

  clear() {
    this.log.push('--- clear ---');
  }
}

module.exports = { ConsoleIO, ScriptedIO, colors };
