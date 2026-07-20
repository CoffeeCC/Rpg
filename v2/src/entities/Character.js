const { RACES } = require('../data/races');
const { CLASSES } = require('../data/classes');

const BASE_STATS = { STR: 3, DEF: 3, DEX: 3, MANA: 3, MAGDEF: 3, INT: 3, LUCK: 3 };
const EXP_PER_LEVEL = 10; // amount of EXP needed scales as level * this

class Character {
  constructor(name, race, className) {
    this.name = name;
    this.race = race;
    this.className = className;
    this.level = 1;
    this.exp = 0;
    this.attributePoints = 0;
    this.isTamed = false;

    const raceMods = RACES[race].mods;
    const classMods = CLASSES[className].mods;
    this.stats = {};
    for (const stat of Object.keys(BASE_STATS)) {
      this.stats[stat] = BASE_STATS[stat] + (raceMods[stat] || 0) + (classMods[stat] || 0);
    }

    this.equipment = {
      weapon: { ...CLASSES[className].weapon },
      armor: { ...CLASSES[className].armor },
      headpiece: null,
      gloves: null,
      boots: null,
      ring: null,
    };

    this.spells = CLASSES[className].spells.map((s) => ({ ...s }));
    this.skills = CLASSES[className].skills.map((s) => ({ ...s }));

    this.inventory = ['Jerky']; // consumables/bait, by name
    this.items = []; // generated equipment sitting in the bag, not equipped
    this.gold = 25;
    this.searchesRemaining = 1;
    this.progress = 1;

    this.statusEffects = []; // { name: 'Burned'|'Stunned', turns: n }
    this.tempMods = {}; // stat -> temporary delta from skills, cleared between fights

    this.recomputeDerived();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  // Recomputes MaxHP/MaxMP from current stats. Call after any stat change.
  recomputeDerived() {
    this.maxHp = 40 + this.stats.STR * 3 + this.stats.DEF * 2 + this.level * 10;
    this.maxMp = 10 + this.stats.MANA * 4 + this.level * 3;
  }

  effectiveStat(stat) {
    return this.stats[stat] + (this.tempMods[stat] || 0);
  }

  getAttack() {
    return this.effectiveStat('STR') + (this.equipment.weapon ? this.equipment.weapon.Attack : 0);
  }

  getMagicAttack() {
    return this.effectiveStat('INT') + (this.equipment.weapon ? this.equipment.weapon.Magic : 0);
  }

  getDefense() {
    let def = this.effectiveStat('DEF');
    for (const slot of ['armor', 'headpiece', 'gloves', 'boots']) {
      if (this.equipment[slot]) def += this.equipment[slot].Defense || 0;
    }
    return def;
  }

  getMagicDefense() {
    let mgdef = this.effectiveStat('MAGDEF');
    for (const slot of ['armor', 'headpiece', 'gloves', 'boots']) {
      if (this.equipment[slot]) mgdef += this.equipment[slot].Magic || 0;
    }
    return mgdef;
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

  restoreMp(amount) {
    const before = this.mp;
    this.mp = Math.min(this.maxMp, this.mp + Math.round(amount));
    return this.mp - before;
  }

  spendMp(amount) {
    if (this.mp < amount) return false;
    this.mp -= amount;
    return true;
  }

  // Returns true if this character leveled up (possibly more than once).
  gainExp(amount) {
    this.exp += amount;
    let leveledUp = false;
    while (this.exp >= this.level * EXP_PER_LEVEL) {
      this.exp -= this.level * EXP_PER_LEVEL;
      this.level++;
      this.attributePoints += 6;
      this.recomputeDerived();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      leveledUp = true;
    }
    return leveledUp;
  }

  spendAttributePoint(stat) {
    if (this.attributePoints <= 0) return false;
    if (!(stat in this.stats)) return false;
    this.stats[stat]++;
    this.attributePoints--;
    this.recomputeDerived();
    return true;
  }

  // Equips an item into its slot, returns the previously equipped item (or null).
  // Any `mods` on the item (from generated gear) are applied/reverted as
  // permanent stat changes so a Ring of +2 LUCK actually does something.
  equip(item) {
    const slot = item.slot;
    const previous = this.equipment[slot];
    if (previous && previous.mods) {
      for (const mod of previous.mods) this.stats[mod.stat] -= mod.amount;
    }
    this.equipment[slot] = item;
    if (item.mods) {
      for (const mod of item.mods) this.stats[mod.stat] += mod.amount;
    }
    const idx = this.items.indexOf(item);
    if (idx !== -1) this.items.splice(idx, 1);
    if (previous) this.items.push(previous);
    this.recomputeDerived();
    return previous;
  }

  addItem(item) {
    this.items.push(item);
  }

  addConsumable(name) {
    this.inventory.push(name);
  }

  addGold(amount) {
    this.gold += amount;
  }

  spendGold(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  removeConsumable(name) {
    const idx = this.inventory.indexOf(name);
    if (idx === -1) return false;
    this.inventory.splice(idx, 1);
    return true;
  }

  applyStatus(name, turns) {
    const existing = this.statusEffects.find((s) => s.name === name);
    if (existing) {
      existing.turns = Math.max(existing.turns, turns);
    } else {
      this.statusEffects.push({ name, turns });
    }
  }

  hasStatus(name) {
    return this.statusEffects.some((s) => s.name === name);
  }

  // Advances status effects by one turn. Returns log lines describing what happened.
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

  clearFightState() {
    this.tempMods = {};
    this.statusEffects = [];
  }
}

module.exports = { Character, BASE_STATS };
