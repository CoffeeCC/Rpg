import { describe, it, expect } from 'vitest';
import { ASPECTS, aspectsFor, pickAspect } from '../data/aspects';
import type { MonsterRarity } from '../types';

const ASPECT_RARITIES: MonsterRarity[] = ['Alpha', 'Rare'];

const MULT_RANGE = { min: 0.9, max: 1.25 };
const TAME_RANGE = { min: 0.7, max: 1.3 };

describe('ASPECTS', () => {
  it('has unique ids', () => {
    const ids = ASPECTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has unique names', () => {
    const names = ASPECTS.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('ids are kebab-case', () => {
    for (const a of ASPECTS) {
      expect(a.id, `id "${a.id}"`).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it('every aspect has a non-empty name', () => {
    for (const a of ASPECTS) {
      expect(a.name.trim().length, `aspect ${a.id} name`).toBeGreaterThan(0);
    }
  });

  it('every aspect has a non-empty blurb of at most 140 chars', () => {
    for (const a of ASPECTS) {
      expect(a.blurb.trim().length, `aspect ${a.id} blurb non-empty`).toBeGreaterThan(0);
      expect(a.blurb.length, `aspect ${a.id} blurb length (${a.blurb.length})`).toBeLessThanOrEqual(140);
    }
  });

  it('every aspect declares a valid rollable rarity (Alpha or Rare only)', () => {
    for (const a of ASPECTS) {
      expect(['Alpha', 'Rare'], `aspect ${a.id} rarity`).toContain(a.rarity);
    }
  });

  it('meets minimum counts per rarity: 22+ Alpha, 10+ Rare', () => {
    expect(aspectsFor('Alpha').length).toBeGreaterThanOrEqual(22);
    expect(aspectsFor('Rare').length).toBeGreaterThanOrEqual(10);
  });

  it('has no aspects for Common', () => {
    expect(aspectsFor('Common').length).toBe(0);
  });

  it('every aspect has 1-2 mods', () => {
    for (const a of ASPECTS) {
      const keys = Object.keys(a.mods);
      expect(keys.length, `aspect ${a.id} mod count`).toBeGreaterThanOrEqual(1);
      expect(keys.length, `aspect ${a.id} mod count`).toBeLessThanOrEqual(2);
    }
  });

  it('hpMult/strMult/defMult stay within 0.9-1.25, tameMult within 0.7-1.3', () => {
    for (const a of ASPECTS) {
      const { hpMult, strMult, defMult, tameMult } = a.mods;
      for (const [label, v] of [
        ['hpMult', hpMult],
        ['strMult', strMult],
        ['defMult', defMult],
      ] as const) {
        if (v !== undefined) {
          expect(v, `aspect ${a.id} ${label}`).toBeGreaterThanOrEqual(MULT_RANGE.min);
          expect(v, `aspect ${a.id} ${label}`).toBeLessThanOrEqual(MULT_RANGE.max);
        }
      }
      if (tameMult !== undefined) {
        expect(tameMult, `aspect ${a.id} tameMult`).toBeGreaterThanOrEqual(TAME_RANGE.min);
        expect(tameMult, `aspect ${a.id} tameMult`).toBeLessThanOrEqual(TAME_RANGE.max);
      }
    }
  });
});

describe('aspectsFor', () => {
  it('returns only aspects matching the requested rarity', () => {
    for (const rarity of ASPECT_RARITIES) {
      const pool = aspectsFor(rarity);
      expect(pool.length).toBeGreaterThan(0);
      for (const a of pool) {
        expect(a.rarity).toBe(rarity);
      }
    }
  });
});

describe('pickAspect', () => {
  it('returns null for Common', () => {
    expect(pickAspect('Common', 0)).toBeNull();
    expect(pickAspect('Common', 7)).toBeNull();
  });

  it('is deterministic: same rarity+roll always yields the same aspect', () => {
    for (const rarity of ASPECT_RARITIES) {
      for (const roll of [0, 1, 5, 13, 100, 999]) {
        const a = pickAspect(rarity, roll);
        const b = pickAspect(rarity, roll);
        expect(a).toEqual(b);
      }
    }
  });

  it('returns an aspect matching the requested rarity for non-Common rarities', () => {
    for (const rarity of ASPECT_RARITIES) {
      for (const roll of [0, 1, 2, 3, 4, 5, 50, 1000]) {
        const a = pickAspect(rarity, roll);
        expect(a, `pickAspect(${rarity}, ${roll})`).not.toBeNull();
        expect(a?.rarity).toBe(rarity);
      }
    }
  });

  it('modulo wraps roll deterministically across the pool', () => {
    const pool = aspectsFor('Alpha');
    const first = pickAspect('Alpha', 0);
    const wrapped = pickAspect('Alpha', pool.length);
    expect(wrapped).toEqual(first);
  });

  it('cycles through every aspect in the pool as roll increases', () => {
    for (const rarity of ASPECT_RARITIES) {
      const pool = aspectsFor(rarity);
      const seen = new Set<string>();
      for (let roll = 0; roll < pool.length; roll++) {
        const a = pickAspect(rarity, roll);
        expect(a).not.toBeNull();
        seen.add(a!.id);
      }
      expect(seen.size).toBe(pool.length);
    }
  });
});
