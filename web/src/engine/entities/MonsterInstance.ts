import type { ActiveMod, ItemV2, MonsterFamily, MonsterRarity, SpawnTable, Stat, StatBlock, StatusEffect } from '../types';
import { SPECIES, speciesById, speciesMatching } from '../data/species';
import { ASPECTS, pickAspect, type AspectDef } from '../data/aspects';
import { PERSONALITIES, personalityById, type PersonalityDef } from '../data/personalities';
import { BALANCE } from '../data/balance';
import { randInt } from '../random';

const RARITY_STAT_MULT: Record<MonsterRarity, number> = BALANCE.rarityStatMult;
const RARITY_EXP_MULT: Record<MonsterRarity, number> = BALANCE.rarityExpMult;
export const RARITY_TAME_MULT: Record<MonsterRarity, number> = BALANCE.rarityTameMult;

const EXP_PER_LEVEL = 8;
const PLUS_GROWTH_BONUS = 0.04;
const EMPTY_STATS: StatBlock = { STR: 0, DEF: 0, DEX: 0, MANA: 0, MAGDEF: 0, INT: 0, LUCK: 0 };
const ASPECT_BY_ID = new Map(ASPECTS.map((a) => [a.id, a]));

let uidCounter = 0;
export function freshUid(prefix: string): string {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return `${prefix}-${Date.now().toString(36)}-${uidCounter}`;
}

/**
 * A concrete monster: an enemy in an encounter, a tamed party member, or a
 * stabled/bred creature. Species defines the blueprint; this carries level,
 * rarity, breeding bonuses, and combat state.
 */
export class MonsterInstance {
  uid: string;
  speciesId: string;
  nickname: string;
  level: number;
  exp = 0;
  /** Breeding generation (+N). Each plus adds 4% growth. */
  plus: number;
  rarity: MonsterRarity;
  /** Inherited-from-parents flat bonus, on top of species-derived stats. */
  bonusStats: StatBlock;
  /** True for bred monsters: skills were hand-picked, no innate auto-unlocks. */
  customSkills: boolean;
  knownSkills: string[];
  isTamed = false;
  isBoss = false;
  /** Named aspect for uncommon spawns ("Ironhide", "Duskborn"...); replaces the bare rarity tag. */
  aspectId: string | null;
  /** DQM-style temperament (PLAN5 #48): growth bias + battle instinct. */
  personalityId: string;
  /** Battles survived at the player's side; instincts strengthen with bond. */
  bond = 0;
  /** Accessories worn by this monster: a charm and a trinket. */
  charm: ItemV2 | null = null;
  trinket: ItemV2 | null = null;

  stats: StatBlock = { ...EMPTY_STATS };
  maxHp = 1;
  hp = 1;
  maxMp = 0;
  mp = 0;

  statusEffects: StatusEffect[] = [];
  activeMods: ActiveMod[] = [];
  defending = false;
  /** Accumulated bait bonus for the current encounter (enemies only). */
  tameBonus = 0;

  constructor(init: {
    speciesId: string;
    level: number;
    rarity?: MonsterRarity;
    plus?: number;
    bonusStats?: StatBlock;
    nickname?: string;
    knownSkills?: string[];
    customSkills?: boolean;
    aspectId?: string | null;
    personalityId?: string;
  }) {
    const species = speciesById(init.speciesId);
    if (!species) throw new Error(`Unknown species: ${init.speciesId}`);
    this.uid = freshUid(init.speciesId);
    this.speciesId = init.speciesId;
    this.nickname = init.nickname ?? species.name;
    this.level = init.level;
    this.rarity = init.rarity ?? 'Common';
    this.plus = init.plus ?? 0;
    this.bonusStats = init.bonusStats ? { ...init.bonusStats } : { ...EMPTY_STATS };
    this.customSkills = init.customSkills ?? false;
    this.knownSkills = init.knownSkills ? [...init.knownSkills] : [];
    this.aspectId = init.aspectId ?? null;
    this.personalityId = init.personalityId ?? PERSONALITIES[randInt(PERSONALITIES.length)].id;
    this.deriveStats();
    this.hp = this.maxHp;
    this.mp = this.maxMp;
    if (!this.customSkills && this.knownSkills.length === 0) {
      this.knownSkills = this.unlockedInnateSkills();
    }
  }

  get species() {
    const s = speciesById(this.speciesId);
    if (!s) throw new Error(`Unknown species: ${this.speciesId}`);
    return s;
  }

  get family(): MonsterFamily {
    return this.species.family;
  }

  get aspect(): AspectDef | null {
    return this.aspectId ? ASPECT_BY_ID.get(this.aspectId) ?? null : null;
  }

  get personality(): PersonalityDef | null {
    return personalityById(this.personalityId);
  }

  displayName(): string {
    if (this.isBoss) return this.nickname;
    const a = this.aspect;
    // Wilds wear their aspect as a title; tamed monsters go by their given name.
    if (a && !this.isTamed) return `${a.name} ${this.nickname}`;
    if (!a && this.rarity !== 'Common' && !this.isTamed) return `${this.nickname} [${this.rarity}]`;
    return this.nickname;
  }

  private growthMult(): number {
    return 1 + this.plus * PLUS_GROWTH_BONUS;
  }

  /** Innate skills unlocked at levels 1 / 5 / 10. */
  unlockedInnateSkills(): string[] {
    const gates = [1, 5, 10];
    return this.species.innateSkills.filter((_, i) => this.level >= (gates[i] ?? 99));
  }

  deriveStats() {
    const s = this.species;
    const mult = RARITY_STAT_MULT[this.rarity];
    const levels = this.level - 1;
    for (const stat of Object.keys(EMPTY_STATS) as Stat[]) {
      const raw = s.baseStats[stat] + s.growth[stat] * levels * this.growthMult() + this.bonusStats[stat];
      this.stats[stat] = Math.max(1, Math.floor(raw * mult));
    }
    this.maxHp = Math.max(5, Math.floor((s.baseHp + s.hpGrowth * levels * this.growthMult() + this.bonusStats.STR) * mult));
    this.maxMp = Math.max(0, Math.floor(s.baseMp + s.mpGrowth * levels * this.growthMult() + this.bonusStats.MANA));
    const a = this.aspect;
    if (a) {
      if (a.mods.strMult) this.stats.STR = Math.max(1, Math.floor(this.stats.STR * a.mods.strMult));
      if (a.mods.defMult) this.stats.DEF = Math.max(1, Math.floor(this.stats.DEF * a.mods.defMult));
      if (a.mods.hpMult) this.maxHp = Math.max(5, Math.floor(this.maxHp * a.mods.hpMult));
    }
    const p = this.personality;
    if (p) {
      for (const stat of Object.keys(EMPTY_STATS) as Stat[]) {
        const g = p.growth[stat];
        if (g) this.stats[stat] = Math.max(1, Math.floor(this.stats[stat] * g));
      }
    }
    for (const acc of [this.charm, this.trinket]) {
      if (!acc) continue;
      for (const affix of acc.affixes) {
        if (affix.target in EMPTY_STATS) {
          this.stats[affix.target as Stat] += affix.amount;
        } else if (affix.target === 'HP') {
          this.maxHp += affix.amount;
        }
      }
    }
  }

  effectiveStat(stat: Stat): number {
    let value = this.stats[stat];
    for (const mod of this.activeMods) {
      if (mod.stat === stat) value += mod.amount;
    }
    return Math.max(1, value);
  }

  getAttack(): number {
    return this.effectiveStat('STR');
  }

  getMagicPower(): number {
    return this.effectiveStat('INT');
  }

  getDefense(): number {
    return this.effectiveStat('DEF');
  }

  getMagicDefense(): number {
    return this.effectiveStat('MAGDEF');
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

  /** EXP awarded for defeating this monster. */
  expValue(): number {
    return Math.floor((BALANCE.enemyExpBase + this.level * BALANCE.enemyExpPerLevel) * RARITY_EXP_MULT[this.rarity] * (this.isBoss ? 2 : 1));
  }

  expToNext(): number {
    return this.level * EXP_PER_LEVEL;
  }

  /** Returns log lines for any level-ups. */
  gainExp(amount: number): string[] {
    const logs: string[] = [];
    this.exp += amount;
    while (this.exp >= this.expToNext()) {
      this.exp -= this.expToNext();
      this.level++;
      const hpBefore = this.maxHp;
      this.deriveStats();
      this.hp = Math.min(this.maxHp, this.hp + (this.maxHp - hpBefore));
      logs.push(`${this.displayName()} grew to level ${this.level}!`);
      if (!this.customSkills) {
        for (const skillId of this.unlockedInnateSkills()) {
          if (!this.knownSkills.includes(skillId)) {
            this.knownSkills.push(skillId);
            logs.push(`${this.displayName()} learned a new skill!`);
          }
        }
      }
    }
    return logs;
  }

  /** Tame chance right now, as a percent (2-90). */
  tameChancePercent(): number {
    const missingHpBonus = (1 - this.hp / this.maxHp) * BALANCE.tameMissingHpBonus;
    const raw = (this.species.tameBase + missingHpBonus + this.tameBonus) * RARITY_TAME_MULT[this.rarity] * (this.aspect?.mods.tameMult ?? 1);
    if (this.isBoss) return 0; // bosses cannot be tamed
    return Math.max(BALANCE.tameMin, Math.min(BALANCE.tameMax, Math.round(raw)));
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

  clone(): MonsterInstance {
    const copy = Object.create(MonsterInstance.prototype) as MonsterInstance;
    Object.assign(copy, this, {
      bonusStats: { ...this.bonusStats },
      knownSkills: [...this.knownSkills],
      stats: { ...this.stats },
      statusEffects: this.statusEffects.map((s) => ({ ...s })),
      activeMods: this.activeMods.map((m) => ({ ...m })),
      charm: this.charm ? { ...this.charm, affixes: this.charm.affixes.map((a) => ({ ...a })) } : null,
      trinket: this.trinket ? { ...this.trinket, affixes: this.trinket.affixes.map((a) => ({ ...a })) } : null,
    });
    return copy;
  }

  /** Spawn a wild monster for an encounter, scaled off player level + floor. */
  static createWild(spawn: SpawnTable, forceRarity?: MonsterRarity): MonsterInstance {
    let pool = speciesMatching(spawn.families, spawn.tierMin, spawn.tierMax);
    if (pool.length === 0) pool = Object.values(SPECIES);
    const species = pool[randInt(pool.length)];
    const level = Math.max(1, 1 + spawn.levelBonus + randInt(BALANCE.wildLevelJitter));
    let rarity: MonsterRarity = 'Common';
    if (forceRarity) {
      rarity = forceRarity;
    } else {
      const roll = randInt(100);
      if (roll < BALANCE.rareSpawnPct) rarity = 'Rare';
      else if (roll < BALANCE.rareSpawnPct + BALANCE.alphaSpawnPct) rarity = 'Alpha';
    }
    const aspectId = pickAspect(rarity, randInt(10000))?.id ?? null;
    return new MonsterInstance({ speciesId: species.id, level, rarity, aspectId });
  }

  /** Spawn a gate boss: highest-tier species of the boss family within reach. */
  static createBoss(bossFamily: MonsterFamily, bossTier: number, bossName: string, bossLevel: number): MonsterInstance {
    let pool = speciesMatching([bossFamily], 1, bossTier);
    if (pool.length === 0) pool = Object.values(SPECIES);
    const topTier = Math.max(...pool.map((s) => s.tier));
    const top = pool.filter((s) => s.tier === topTier);
    const species = top[randInt(top.length)];
    const boss = new MonsterInstance({ speciesId: species.id, level: bossLevel, rarity: 'Rare', nickname: bossName });
    boss.isBoss = true;
    return boss;
  }
}
