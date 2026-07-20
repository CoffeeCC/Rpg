const { PREFIXES, SUFFIXES } = require('../data/monsterNames');

function randInt(max) {
  return Math.floor(Math.random() * max);
}

function randomName() {
  const pre = PREFIXES[randInt(PREFIXES.length)];
  const suf = SUFFIXES[randInt(SUFFIXES.length)];
  return `${pre}-${suf}`;
}

class Monster {
  constructor({ name, level, maxHp, attack, dexterity, defense, magicDefense, luck, wild, exp }) {
    this.name = name;
    this.level = level;
    this.maxHp = maxHp;
    this.hp = maxHp;
    this.attack = attack;
    this.dexterity = dexterity;
    this.defense = defense;
    this.magicDefense = magicDefense;
    this.luck = luck;
    this.wild = wild; // 0-100, lower = easier to tame
    this.exp = exp;
    this.isTamed = false;
    this.statusEffects = [];
    this.tempMods = {};
  }

  // Scales a fresh monster around the given player level. Mirrors the
  // original CreateMonster(), but guarantees sane, non-zero stats.
  static generate(playerLevel) {
    const level = Math.max(1, randInt(5) + playerLevel);
    const maxHp = Math.max(15, randInt(30) + level * 4);
    return new Monster({
      name: randomName(),
      level,
      maxHp,
      attack: randInt(3) + level,
      dexterity: randInt(3) + level,
      defense: randInt(3) + level,
      magicDefense: randInt(2) + level,
      luck: randInt(5),
      wild: 100,
      exp: Math.floor((randInt(5) + 1) * level),
    });
  }

  effectiveStat(name) {
    return (this[name] || 0) + (this.tempMods[name] || 0);
  }

  getAttack() {
    return this.effectiveStat('attack');
  }

  getDefense() {
    return this.effectiveStat('defense');
  }

  getMagicDefense() {
    return this.effectiveStat('magicDefense');
  }

  isAlive() {
    return this.hp > 0;
  }

  takeDamage(amount) {
    const dmg = Math.max(0, Math.round(amount));
    this.hp = Math.max(0, this.hp - dmg);
    return dmg;
  }

  heal(amount) {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.round(amount));
    return this.hp - before;
  }

  applyStatus(name, turns) {
    const existing = this.statusEffects.find((s) => s.name === name);
    if (existing) existing.turns = Math.max(existing.turns, turns);
    else this.statusEffects.push({ name, turns });
  }

  hasStatus(name) {
    return this.statusEffects.some((s) => s.name === name);
  }

  tickStatus() {
    const logs = [];
    for (const effect of this.statusEffects) {
      if (effect.name === 'Burned') {
        const dmg = this.takeDamage(5);
        logs.push(`${this.name} takes ${dmg} damage from being Burned!`);
      }
      effect.turns--;
    }
    this.statusEffects = this.statusEffects.filter((s) => s.turns > 0);
    return logs;
  }

  // Offering bait lowers Wild. Once it's low enough, taming succeeds.
  reduceWild(amount) {
    this.wild = Math.max(0, this.wild - amount);
    return this.wild;
  }

  tameChanceRoll() {
    // Wild 100 -> ~0% chance, Wild 0 -> guaranteed.
    return randInt(100) >= this.wild;
  }
}

module.exports = { Monster, randInt };
