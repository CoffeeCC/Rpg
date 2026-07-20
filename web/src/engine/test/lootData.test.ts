import { describe, it, expect } from 'vitest';
import { AFFIXES, RARE_NAME_PREFIXES, RARE_NAME_SUFFIXES } from '../data/affixes';
import { UNIQUES } from '../data/uniques';
import { ITEM_TYPES } from '../data/items';
import type { AffixTarget, Stat } from '../types';

const STATS: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];
const ALL_TARGETS: AffixTarget[] = [...STATS, 'HP', 'MP', 'Attack', 'Magic', 'Defense'];

describe('AFFIXES', () => {
  it('has at least 45 entries', () => {
    expect(AFFIXES.length).toBeGreaterThanOrEqual(45);
  });

  it('has unique ids', () => {
    const ids = AFFIXES.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every affix has min <= max and sane positive rolls', () => {
    for (const a of AFFIXES) {
      expect(a.min, `affix ${a.id} min`).toBeGreaterThanOrEqual(1);
      expect(a.min, `affix ${a.id} min<=max`).toBeLessThanOrEqual(a.max);
    }
  });

  it('every affix has minIlvl >= 1 and tier in 1|2|3', () => {
    for (const a of AFFIXES) {
      expect(a.minIlvl, `affix ${a.id} minIlvl`).toBeGreaterThanOrEqual(1);
      expect([1, 2, 3], `affix ${a.id} tier`).toContain(a.tier);
    }
  });

  it('pool contains both prefix and suffix affixes', () => {
    const types = new Set(AFFIXES.map((a) => a.type));
    expect(types.has('prefix')).toBe(true);
    expect(types.has('suffix')).toBe(true);
  });

  it('covers every AffixTarget at least once', () => {
    const covered = new Set(AFFIXES.map((a) => a.target));
    for (const target of ALL_TARGETS) {
      expect(covered.has(target), `target ${target} covered`).toBe(true);
    }
  });

  it('at every ilvl >= 1 there are at least 3 prefixes and 3 suffixes available', () => {
    // Availability is monotonic in ilvl, so the ilvl-1 pool is the floor.
    const prefixesAt1 = AFFIXES.filter((a) => a.type === 'prefix' && a.minIlvl <= 1);
    const suffixesAt1 = AFFIXES.filter((a) => a.type === 'suffix' && a.minIlvl <= 1);
    expect(prefixesAt1.length).toBeGreaterThanOrEqual(3);
    expect(suffixesAt1.length).toBeGreaterThanOrEqual(3);
  });
});

describe('rare name parts', () => {
  it('has at least 16 prefixes and 16 suffixes', () => {
    expect(RARE_NAME_PREFIXES.length).toBeGreaterThanOrEqual(16);
    expect(RARE_NAME_SUFFIXES.length).toBeGreaterThanOrEqual(16);
  });

  it('all parts are non-empty strings', () => {
    for (const p of [...RARE_NAME_PREFIXES, ...RARE_NAME_SUFFIXES]) {
      expect(typeof p).toBe('string');
      expect(p.trim().length).toBeGreaterThan(0);
    }
  });
});

describe('UNIQUES', () => {
  it('has at least 10 entries', () => {
    expect(UNIQUES.length).toBeGreaterThanOrEqual(10);
  });

  it('has unique ids', () => {
    const ids = UNIQUES.map((u) => u.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('covers at least 5 distinct base types, all of them valid', () => {
    const baseTypes = new Set(UNIQUES.map((u) => u.baseType));
    expect(baseTypes.size).toBeGreaterThanOrEqual(5);
    for (const bt of baseTypes) {
      expect(Object.keys(ITEM_TYPES), `baseType ${bt}`).toContain(bt);
    }
  });

  it('every unique has 2-4 affixes and minIlvl >= 1', () => {
    for (const u of UNIQUES) {
      expect(u.affixes.length, `unique ${u.id} affix count`).toBeGreaterThanOrEqual(2);
      expect(u.affixes.length, `unique ${u.id} affix count`).toBeLessThanOrEqual(4);
      expect(u.minIlvl, `unique ${u.id} minIlvl`).toBeGreaterThanOrEqual(1);
    }
  });
});
