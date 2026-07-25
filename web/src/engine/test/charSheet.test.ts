import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import type { ClassName, ItemV2, RaceName, RolledAffix, Stat } from '../types';
import { RACES } from '../data/races';
import { CLASSES } from '../data/classes';
import { BALANCE } from '../data/balance';
import { talentsFor } from '../data/traits';
import { lanternRadius, movFor } from '../systems/floors';
import { energyFor, handSizeFor } from '../systems/cardBattle';
import {
  HERO_BASE_STAT,
  STAT_ORDER,
  attributeBreakdown,
  critBreakdown,
  derivedBreakdowns,
  foldContributions,
  handSizeBreakdown,
  heroScalingLines,
  lanternBreakdown,
  maxHpBreakdown,
  maxMpBreakdown,
  movBreakdown,
  scalingBonusOf,
  standingEffects,
  vigorBreakdown,
} from '../statBreakdown';

const RACE_NAMES = Object.keys(RACES) as RaceName[];
const CLASS_NAMES = Object.keys(CLASSES) as ClassName[];

function affix(target: RolledAffix['target'], amount: number, name = 'of Testing'): RolledAffix {
  return { affixId: `test_${target}_${amount}`, name, type: 'suffix', target, amount };
}

function item(overrides: Partial<ItemV2> = {}): ItemV2 {
  return {
    uid: `it_${Math.random().toString(36).slice(2)}`,
    baseType: 'Ring',
    slot: 'ring',
    material: 'Iron',
    ilvl: 10,
    rarity: 'Rare',
    name: 'Proof Band',
    implicitAttack: 0,
    implicitMagic: 0,
    implicitDefense: 0,
    affixes: [],
    value: 10,
    ...overrides,
  };
}

/** A hero with gear on every kind of affix target, a couple of buffs, some
 *  levels, and a debuff — so no term of any formula goes unexercised. */
function loadedHero(race: RaceName = 'Elf', className: ClassName = 'Bard'): Character {
  const hero = new Character('Proof', race, className);
  hero.gainExp(6000);
  hero.equip(
    item({
      slot: 'ring',
      name: 'Band of Every Virtue',
      affixes: (['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'] as Stat[]).map((s) => affix(s, 4, `of the ${s}`)),
    })
  );
  hero.equip(
    item({
      slot: 'amulet',
      baseType: 'Amulet',
      name: 'Torc of Sums',
      implicitAttack: 2,
      implicitMagic: 3,
      implicitDefense: 5,
      affixes: [affix('Attack', 7), affix('Magic', 6), affix('Defense', 9), affix('HP', 30), affix('MP', 14)],
    })
  );
  hero.equip(item({ slot: 'boots', baseType: 'Boot', name: 'Trudging Boots', implicitDefense: 2, affixes: [affix('DEX', 30)] }));
  hero.addMod({ stat: 'STR', amount: 5, turns: 2 });
  hero.addMod({ stat: 'LUCK', amount: -3, turns: 1 });
  hero.applyStatus('Burned', 3);
  hero.recomputeDerived();
  return hero;
}

describe('statBreakdown — the attribute ledger', () => {
  it('knows the flat stock every hero is built on', () => {
    for (const race of RACE_NAMES) {
      for (const className of CLASS_NAMES) {
        const hero = new Character('T', race, className);
        for (const stat of STAT_ORDER) {
          const raceMod = RACES[race].mods[stat] ?? 0;
          const classMod = CLASSES[className].mods[stat] ?? 0;
          expect(hero.stats[stat]).toBe(HERO_BASE_STAT + raceMod + classMod);
        }
      }
    }
  });

  it('totals every attribute exactly as the engine does, for every blood and oath', () => {
    for (const race of RACE_NAMES) {
      for (const className of CLASS_NAMES) {
        const hero = loadedHero(race, className);
        for (const stat of STAT_ORDER) {
          const b = attributeBreakdown(hero, stat);
          expect(b.total).toBe(hero.effectiveStat(stat));
          expect(Math.max(1, foldContributions(b.contributions))).toBe(hero.effectiveStat(stat));
        }
      }
    }
  });

  it('attributes gear affixes and standing mods by name', () => {
    const hero = loadedHero();
    const str = attributeBreakdown(hero, 'STR');
    expect(str.contributions.some((c) => c.kind === 'affix' && c.source === 'Band of Every Virtue' && c.amount === 4)).toBe(true);
    expect(str.contributions.some((c) => c.kind === 'mod' && c.amount === 5)).toBe(true);
    const luck = attributeBreakdown(hero, 'LUCK');
    expect(luck.contributions.some((c) => c.kind === 'mod' && c.amount === -3)).toBe(true);
  });

  it('reports the clamp when the terms fall below one', () => {
    const hero = new Character('T', 'Orc', 'Warrior');
    hero.addMod({ stat: 'INT', amount: -99, turns: 3 });
    const b = attributeBreakdown(hero, 'INT');
    expect(b.total).toBe(1);
    expect(b.note).toBeTruthy();
    expect(foldContributions(b.contributions)).toBeLessThan(1);
  });

  it('keeps race and class lines even when they contribute nothing', () => {
    const hero = new Character('T', 'Orc', 'Warrior'); // Orc DEX +0, Warrior DEX +0
    const dex = attributeBreakdown(hero, 'DEX');
    expect(dex.contributions.filter((c) => c.kind === 'race' || c.kind === 'class')).toHaveLength(2);
  });
});

describe('statBreakdown — the derived ledger', () => {
  it('matches every engine getter, for every blood and oath', () => {
    for (const race of RACE_NAMES) {
      for (const className of CLASS_NAMES) {
        const hero = loadedHero(race, className);
        const by = Object.fromEntries(derivedBreakdowns(hero).map((b) => [b.id, b]));
        expect(by.attack.total).toBe(hero.getAttack());
        expect(by.magic.total).toBe(hero.getMagicPower());
        expect(by.defense.total).toBe(hero.getDefense());
        expect(by.magicDefense.total).toBe(hero.getMagicDefense());
        expect(by.maxHp.total).toBe(hero.maxHp);
        expect(by.maxMp.total).toBe(hero.maxMp);
        expect(by.vigor.total).toBe(energyFor(hero));
        expect(by.handSize.total).toBe(handSizeFor(hero));
        expect(by.mov.total).toBe(movFor(hero));
        expect(by.lantern.total).toBe(lanternRadius(hero));
      }
    }
  });

  it('folds its own terms back to the same number', () => {
    for (const race of RACE_NAMES) {
      for (const className of CLASS_NAMES) {
        const hero = loadedHero(race, className);
        for (const b of derivedBreakdowns(hero)) {
          const folded = foldContributions(b.contributions);
          const expected = b.id === 'maxHp' ? Math.floor(folded) : b.id === 'handSize' ? Math.max(3, folded) : b.id === 'mov' ? Math.max(2, folded) : folded;
          expect(expected).toBe(b.total);
        }
      }
    }
  });

  it('mirrors the resolver’s critical formula', () => {
    for (const race of RACE_NAMES) {
      const hero = loadedHero(race, 'Thief');
      const engineCrit = BALANCE.critBase + Math.floor(hero.effectiveStat('LUCK') / BALANCE.critLuckDiv) + talentsFor(hero.level).critBonus;
      expect(critBreakdown(hero).total).toBe(engineCrit);
    }
  });

  it('counts trained stats, not borrowed ones, toward HP and MP', () => {
    const bare = new Character('T', 'Human', 'Warrior');
    const before = { hp: bare.maxHp, mp: bare.maxMp };
    bare.equip(item({ slot: 'ring', name: 'Lent Might', affixes: [affix('STR', 20), affix('MANA', 20)] }));
    expect(bare.maxHp).toBe(before.hp);
    expect(bare.maxMp).toBe(before.mp);
    const hp = maxHpBreakdown(bare);
    expect(hp.total).toBe(bare.maxHp);
    expect(hp.contributions.some((c) => c.detail === `${bare.stats.STR} × 3`)).toBe(true);
    expect(maxMpBreakdown(bare).total).toBe(bare.maxMp);
  });

  it('carries the Elf blood multiplier as a multiplicative term', () => {
    const elf = loadedHero('Elf', 'Warrior');
    const hp = maxHpBreakdown(elf);
    const mult = hp.contributions.find((c) => c.mult !== undefined);
    expect(mult?.mult).toBe(0.85);
    expect(Math.floor(foldContributions(hp.contributions))).toBe(elf.maxHp);
  });

  it('credits oaths and talents on Vigor, hand size and MOV', () => {
    const thief = loadedHero('Elf', 'Thief'); // Elf +1 Vigor, Thief +1 MOV
    expect(vigorBreakdown(thief).contributions.some((c) => c.kind === 'trait' && c.amount === 1)).toBe(true);
    expect(movBreakdown(thief).contributions.some((c) => c.kind === 'trait' && c.amount === 1)).toBe(true);
    expect(movBreakdown(thief).contributions.some((c) => c.source === 'Trudging Boots')).toBe(true);
    const dwarf = loadedHero('Dwarf', 'Mage'); // Dwarf −1 hand, Mage +1 hand
    const traits = handSizeBreakdown(dwarf).contributions.filter((c) => c.kind === 'trait');
    expect(traits.map((c) => c.amount).sort()).toEqual([-1, 1]);
    expect(lanternBreakdown(dwarf).total).toBe(lanternRadius(dwarf));
  });
});

describe('statBreakdown — cards and what stands on you', () => {
  it('reports the same scaling bonus the card resolver adds', () => {
    const hero = loadedHero();
    const lines = Object.fromEntries(heroScalingLines(hero).map((l) => [l.scaling, l]));
    expect(lines.STR.bonus).toBe(Math.floor(hero.getAttack() / BALANCE.scalingDivisor));
    expect(lines.INT.bonus).toBe(Math.floor(hero.getMagicPower() / BALANCE.scalingDivisor));
    expect(lines.DEF.bonus).toBe(Math.floor(hero.getDefense() / BALANCE.scalingDivisor));
    expect(scalingBonusOf(9)).toBe(Math.floor(9 / BALANCE.scalingDivisor));
  });

  it('lists standing statuses and mods', () => {
    const hero = loadedHero();
    const standing = standingEffects(hero);
    expect(standing.some((e) => e.kind === 'status' && e.name === 'Burned')).toBe(true);
    expect(standing.some((e) => e.kind === 'mod' && e.good)).toBe(true);
    expect(standing.some((e) => e.kind === 'mod' && !e.good)).toBe(true);
  });
});
