import type { ActiveMod, ClassName, EquipmentSlot, ItemV2, RaceName, Stat, StatBlock, StatusEffect } from '../types';
import { RACES } from '../data/races';
import { CLASSES } from '../data/classes';
import { CLASS_LEARNSETS } from '../data/skills';
import { BALANCE } from '../data/balance';
import { traitsFor, type TraitSet } from '../data/traits';
import { makeStartingItem } from '../systems/lootGen';

const BASE_STATS: StatBlock = { STR: 3, DEF: 3, DEX: 3, MANA: 3, MAGDEF: 3, INT: 3, LUCK: 3 };
/** Hero-wearable equipment keys (charms belong to monsters; rings come in pairs). */
export type EquipKey = Exclude<EquipmentSlot, 'charm'> | 'ring2';
const EQUIPMENT_SLOTS: EquipKey[] = ['weapon', 'armor', 'headpiece', 'gloves', 'boots', 'ring', 'ring2', 'amulet', 'pendant'];

export type Equipment = Record<EquipKey, ItemV2 | null>;

export class Character {
  readonly uid = 'hero';
  name: string;
  race: RaceName;
  className: ClassName;
  level = 1;
  exp = 0;
  attributePoints = 0;
  gold = 60;

  /** Base trained stats (race + class + level-ups + EV training + events). */
  stats: StatBlock;
  equipment: Equipment;
  knownSkills: string[] = [];

  /** Equipment bag (unequipped gear). */
  items: ItemV2[] = [];
  /** Consumables by name. */
  inventory: string[] = ['Herb', 'Jerky', 'Jerky'];
  /** Per-copy smith upgrades: card id -> number of copies reforged. */
  upgradedCounts: Record<string, number> = {};

  statusEffects: StatusEffect[] = [];
  activeMods: ActiveMod[] = [];
  defending = false;

  maxHp = 1;
  hp = 1;
  maxMp = 0;
  mp = 0;

  constructor(name: string, race: RaceName, className: ClassName) {
    this.name = name;
    this.race = race;
    this.className = className;

    const raceMods = RACES[race].mods;
    const classMods = CLASSES[className].mods;
    this.stats = { ...BASE_STATS };
    for (const stat of Object.keys(BASE_STATS) as Stat[]) {
      this.stats[stat] = BASE_STATS[stat] + (raceMods[stat] || 0) + (classMods[stat] || 0);
    }

    this.equipment = {
      weapon: makeStartingItem(CLASSES[className].startingWeapon),
      armor: makeStartingItem('Armor'),
      headpiece: null,
      gloves: null,
      boots: null,
      ring: null,
      ring2: null,
      amulet: null,
      pendant: null,
    };

    this.refreshKnownSkills();
    this.recomputeDerived();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
  }

  displayName(): string {
    return this.name;
  }

  get family(): undefined {
    return undefined; // heroes have no monster family (no elemental weaknesses)
  }

  private refreshKnownSkills() {
    this.knownSkills = CLASS_LEARNSETS[this.className]
      .filter((entry) => entry.level <= this.level)
      .map((entry) => entry.skillId);
  }

  /** Sum of a given affix/implicit target across all equipped items. */
  private equipmentBonus(target: string): number {
    let total = 0;
    for (const slot of EQUIPMENT_SLOTS) {
      const item = this.equipment[slot];
      if (!item) continue;
      for (const affix of item.affixes) {
        if (affix.target === target) total += affix.amount;
      }
    }
    return total;
  }

  private implicitSum(key: 'implicitAttack' | 'implicitMagic' | 'implicitDefense'): number {
    let total = 0;
    for (const slot of EQUIPMENT_SLOTS) {
      const item = this.equipment[slot];
      if (item) total += item[key];
    }
    return total;
  }

  recomputeDerived() {
    this.maxHp = Math.floor((40 + this.stats.STR * 3 + this.stats.DEF * 2 + this.level * 8 + this.equipmentBonus('HP')) * this.traits.heroHpMult);
    this.maxMp = 10 + this.stats.MANA * 4 + this.level * 3 + this.equipmentBonus('MP');
    this.hp = Math.min(this.hp, this.maxHp);
    this.mp = Math.min(this.mp, this.maxMp);
  }

  effectiveStat(stat: Stat): number {
    let value = this.stats[stat] + this.equipmentBonus(stat);
    for (const mod of this.activeMods) {
      if (mod.stat === stat) value += mod.amount;
    }
    return Math.max(1, value);
  }

  getAttack(): number {
    return this.effectiveStat('STR') + this.implicitSum('implicitAttack') + this.equipmentBonus('Attack');
  }

  getMagicPower(): number {
    return this.effectiveStat('INT') + this.implicitSum('implicitMagic') + this.equipmentBonus('Magic');
  }

  getDefense(): number {
    return this.effectiveStat('DEF') + this.implicitSum('implicitDefense') + this.equipmentBonus('Defense');
  }

  getMagicDefense(): number {
    return this.effectiveStat('MAGDEF') + Math.floor((this.implicitSum('implicitDefense') + this.equipmentBonus('Defense')) / 2);
  }

  isAlive(): boolean {
    return this.hp > 0;
  }

  takeDamage(amount: number): number {
    const dmg = Math.max(0, Math.round(amount));
    this.hp = Math.max(0, this.hp - dmg);
    return dmg;
  }

  heal(amount: number): number {
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + Math.round(amount));
    return this.hp - before;
  }

  restoreMp(amount: number): number {
    const before = this.mp;
    this.mp = Math.min(this.maxMp, this.mp + Math.round(amount));
    return this.mp - before;
  }

  spendMp(amount: number): boolean {
    if (this.mp < amount) return false;
    this.mp -= amount;
    return true;
  }

  expToNext(): number {
    return Math.floor(BALANCE.heroExpBase * Math.pow(this.level, BALANCE.heroExpExponent));
  }

  /** Race + class mechanical identity (PLAN3). Computed, never stored. */
  get traits(): TraitSet {
    return traitsFor(this.race, this.className);
  }

  /** Returns log lines for level-ups and newly learned skills. */
  gainExp(amount: number): string[] {
    const logs: string[] = [];
    this.exp += amount;
    while (this.exp >= this.expToNext()) {
      this.exp -= this.expToNext();
      this.level++;
      this.attributePoints += BALANCE.attributePointsPerLevel;
      const before = new Set(this.knownSkills);
      this.refreshKnownSkills();
      this.recomputeDerived();
      this.hp = this.maxHp;
      this.mp = this.maxMp;
      logs.push(`${this.name} reached level ${this.level}. (+${BALANCE.attributePointsPerLevel} attribute points)`);
      for (const skillId of this.knownSkills) {
        if (!before.has(skillId)) logs.push(`${this.name} learned a new skill!`);
      }
    }
    return logs;
  }

  spendAttributePoint(stat: Stat): boolean {
    if (this.attributePoints <= 0) return false;
    this.stats[stat]++;
    this.attributePoints--;
    this.recomputeDerived();
    return true;
  }

  /** Equip from bag; previous item (if any) returns to the bag. */
  equip(item: ItemV2): ItemV2 | null {
    if (item.slot === 'charm') return null; // charms are worn by monsters
    // Rings pair up: fill the empty finger first.
    const key: EquipKey = item.slot === 'ring' && this.equipment.ring && !this.equipment.ring2 ? 'ring2' : (item.slot as EquipKey);
    const previous = this.equipment[key];
    this.equipment[key] = item;
    const idx = this.items.findIndex((i) => i.uid === item.uid);
    if (idx !== -1) this.items.splice(idx, 1);
    if (previous) this.items.push(previous);
    this.recomputeDerived();
    return previous;
  }

  addItem(item: ItemV2) {
    this.items.push(item);
  }

  addConsumable(name: string, count = 1) {
    for (let i = 0; i < count; i++) this.inventory.push(name);
  }

  removeConsumable(name: string): boolean {
    const idx = this.inventory.indexOf(name);
    if (idx === -1) return false;
    this.inventory.splice(idx, 1);
    return true;
  }

  addGold(amount: number) {
    this.gold += amount;
  }

  spendGold(amount: number): boolean {
    if (this.gold < amount) return false;
    this.gold -= amount;
    return true;
  }

  applyStatus(name: StatusEffect['name'], turns: number) {
    const existing = this.statusEffects.find((s) => s.name === name);
    if (existing) existing.turns = Math.max(existing.turns, turns);
    else this.statusEffects.push({ name, turns });
  }

  hasStatus(name: StatusEffect['name']): boolean {
    return this.statusEffects.some((s) => s.name === name);
  }

  addMod(mod: ActiveMod) {
    this.activeMods.push({ ...mod });
  }

  clone(): Character {
    const copy = Object.create(Character.prototype) as Character;
    Object.assign(copy, this, {
      stats: { ...this.stats },
      equipment: Object.fromEntries(
        Object.entries(this.equipment).map(([slot, item]) => [slot, item ? { ...item, affixes: item.affixes.map((a) => ({ ...a })) } : null])
      ) as Equipment,
      knownSkills: [...this.knownSkills],
      items: this.items.map((item) => ({ ...item, affixes: item.affixes.map((a) => ({ ...a })) })),
      inventory: [...this.inventory],
      upgradedCounts: { ...this.upgradedCounts },
      statusEffects: this.statusEffects.map((s) => ({ ...s })),
      activeMods: this.activeMods.map((m) => ({ ...m })),
    });
    return copy;
  }
}
