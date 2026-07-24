// Validation for agent-authored monsters content: skills, species, breeding.
import { describe, it, expect } from 'vitest';
import type { ClassName, MonsterFamily } from '../types';
import { SKILLS, CLASS_LEARNSETS, getSkill } from '../data/skills';
import { FAMILY_INFO, SPECIES, speciesById, speciesMatching } from '../data/species';
import { FAMILY_MATRIX, PAIR_OVERRIDES } from '../data/breeding';

const ALL_FAMILIES: MonsterFamily[] = [
  'Slime',
  'Dragon',
  'Beast',
  'Bird',
  'Plant',
  'Bug',
  'Devil',
  'Undead',
  'Material',
];

const ALL_CLASSES: ClassName[] = ['Warrior', 'Mage', 'Thief', 'Bard', 'Knight'];

describe('SKILLS', () => {
  it('has at least 50 skills', () => {
    expect(Object.keys(SKILLS).length).toBeGreaterThanOrEqual(50);
  });

  it('every skill id matches its key and mpCost is non-negative', () => {
    for (const [key, skill] of Object.entries(SKILLS)) {
      expect(skill.id).toBe(key);
      expect(skill.mpCost).toBeGreaterThanOrEqual(0);
    }
  });

  it('buffs and debuffs carry modStat/modAmount/modTurns', () => {
    for (const skill of Object.values(SKILLS)) {
      if (skill.kind === 'buff' || skill.kind === 'debuff') {
        expect(skill.modStat, `${skill.id} missing modStat`).toBeDefined();
        expect(skill.modAmount, `${skill.id} missing modAmount`).toBeDefined();
        expect(skill.modTurns, `${skill.id} missing modTurns`).toBeDefined();
        expect(skill.modAmount).not.toBe(0);
        expect(skill.modTurns!).toBeGreaterThan(0);
        if (skill.kind === 'buff') {
          expect(skill.modAmount!).toBeGreaterThan(0);
        } else {
          expect(skill.modAmount!).toBeLessThan(0);
        }
      }
    }
  });

  it('status-inflicting skills carry status + statusTurns', () => {
    for (const skill of Object.values(SKILLS)) {
      if (skill.statusChance !== undefined) {
        expect(skill.status, `${skill.id} missing status`).toBeDefined();
        expect(skill.statusTurns, `${skill.id} missing statusTurns`).toBeDefined();
        expect(skill.statusChance).toBeGreaterThan(0);
        expect(skill.statusChance).toBeLessThanOrEqual(1);
        expect(skill.statusTurns!).toBeGreaterThan(0);
      }
      if (skill.status !== undefined) {
        expect(skill.statusChance, `${skill.id} has status but no statusChance`).toBeDefined();
      }
    }
  });

  it('covers all elements and all skill kinds', () => {
    const elements = new Set(Object.values(SKILLS).map((s) => s.element));
    const kinds = new Set(Object.values(SKILLS).map((s) => s.kind));
    for (const el of ['None', 'Fire', 'Ice', 'Electric', 'Dark', 'Holy']) {
      expect(elements.has(el as never), `no ${el} skills`).toBe(true);
    }
    for (const kind of ['damage', 'heal', 'buff', 'debuff', 'drain']) {
      expect(kinds.has(kind as never), `no ${kind} skills`).toBe(true);
    }
  });

  it('getSkill resolves known ids and rejects unknown', () => {
    expect(getSkill('slash')?.name).toBe('Slash');
    expect(getSkill('doesNotExist')).toBeUndefined();
  });
});

describe('CLASS_LEARNSETS', () => {
  it('every class has >=5 entries, starts at level 1, sorted ascending', () => {
    for (const cls of ALL_CLASSES) {
      const learnset = CLASS_LEARNSETS[cls];
      expect(learnset, `${cls} missing learnset`).toBeDefined();
      expect(learnset.length, `${cls} learnset too small`).toBeGreaterThanOrEqual(5);
      expect(learnset[0].level, `${cls} first skill not at level 1`).toBe(1);
      for (let i = 1; i < learnset.length; i++) {
        expect(
          learnset[i].level,
          `${cls} learnset not sorted ascending at index ${i}`
        ).toBeGreaterThanOrEqual(learnset[i - 1].level);
      }
    }
  });

  it('every referenced skillId exists in SKILLS', () => {
    for (const cls of ALL_CLASSES) {
      for (const entry of CLASS_LEARNSETS[cls]) {
        expect(SKILLS[entry.skillId], `${cls} references unknown skill ${entry.skillId}`).toBeDefined();
      }
    }
  });
});

describe('FAMILY_INFO', () => {
  it('covers all 9 families with the mandated trainsStat', () => {
    const expected: Record<MonsterFamily, string> = {
      Slime: 'LUCK',
      Dragon: 'INT',
      Beast: 'STR',
      Bird: 'DEX',
      Plant: 'MANA',
      Bug: 'DEX',
      Devil: 'INT',
      Undead: 'MAGDEF',
      Material: 'DEF',
    };
    for (const family of ALL_FAMILIES) {
      const info = FAMILY_INFO[family];
      expect(info, `${family} missing from FAMILY_INFO`).toBeDefined();
      expect(info.trainsStat, `${family} wrong trainsStat`).toBe(expected[family]);
      expect(info.emoji.length).toBeGreaterThan(0);
      expect(info.description.length).toBeGreaterThan(0);
    }
  });

  it('resists use only 0.5 / 1.5 multipliers with 1-3 entries per family', () => {
    for (const family of ALL_FAMILIES) {
      const entries = Object.values(FAMILY_INFO[family].resists);
      expect(entries.length, `${family} resist count`).toBeGreaterThanOrEqual(1);
      expect(entries.length, `${family} resist count`).toBeLessThanOrEqual(3);
      for (const mult of entries) {
        expect([0.5, 1.5]).toContain(mult);
      }
    }
  });
});

describe('SPECIES', () => {
  it('has at least 45 species with >=5 per family', () => {
    const all = Object.values(SPECIES);
    expect(all.length).toBeGreaterThanOrEqual(45);
    for (const family of ALL_FAMILIES) {
      const count = all.filter((s) => s.family === family).length;
      expect(count, `${family} has too few species`).toBeGreaterThanOrEqual(5);
    }
  });

  it('every species id matches its key', () => {
    for (const [key, species] of Object.entries(SPECIES)) {
      expect(species.id).toBe(key);
    }
  });

  it('every innate skill exists in SKILLS (1-3 per species)', () => {
    for (const species of Object.values(SPECIES)) {
      expect(species.innateSkills.length).toBeGreaterThanOrEqual(1);
      expect(species.innateSkills.length).toBeLessThanOrEqual(3);
      for (const skillId of species.innateSkills) {
        expect(SKILLS[skillId], `${species.id} references unknown skill ${skillId}`).toBeDefined();
      }
    }
  });

  it('tameBase is within 5-45 for every species', () => {
    for (const species of Object.values(SPECIES)) {
      expect(species.tameBase, `${species.id} tameBase`).toBeGreaterThanOrEqual(5);
      expect(species.tameBase, `${species.id} tameBase`).toBeLessThanOrEqual(45);
    }
  });

  it('every family has a low-tier (1-2) and a high-tier (4-5) species', () => {
    for (const family of ALL_FAMILIES) {
      expect(speciesMatching([family], 1, 2).length, `${family} lacks tier 1-2`).toBeGreaterThan(0);
      expect(speciesMatching([family], 4, 5).length, `${family} lacks tier 4-5`).toBeGreaterThan(0);
    }
  });

  it('satisfies the specific gate/boss picks', () => {
    expect(speciesMatching(['Plant'], 2, 5).length, 'Plant tier 2+').toBeGreaterThan(0);
    expect(speciesMatching(['Material'], 3, 5).length, 'Material tier 3+').toBeGreaterThan(0);
    expect(speciesMatching(['Undead'], 4, 5).length, 'Undead tier 4+').toBeGreaterThan(0);
    expect(speciesMatching(['Dragon'], 4, 5).length, 'Dragon tier 4+').toBeGreaterThan(0);
    expect(speciesMatching(['Devil'], 5, 5).length, 'Devil tier 5').toBeGreaterThan(0);
  });

  it('speciesById resolves known ids and rejects unknown', () => {
    expect(speciesById('goober')?.family).toBe('Slime');
    expect(speciesById('doesNotExist')).toBeUndefined();
  });
});

describe('FAMILY_MATRIX', () => {
  it('is total: all 81 cells present and valid families', () => {
    for (const a of ALL_FAMILIES) {
      expect(FAMILY_MATRIX[a], `missing row ${a}`).toBeDefined();
      for (const b of ALL_FAMILIES) {
        const result = FAMILY_MATRIX[a][b];
        expect(result, `missing cell ${a} x ${b}`).toBeDefined();
        expect(ALL_FAMILIES, `invalid family in cell ${a} x ${b}`).toContain(result);
      }
    }
  });

  it('is symmetric and same-family pairs breed true', () => {
    for (const a of ALL_FAMILIES) {
      expect(FAMILY_MATRIX[a][a], `${a} x ${a} should breed true`).toBe(a);
      for (const b of ALL_FAMILIES) {
        expect(FAMILY_MATRIX[a][b], `matrix asymmetric at ${a} x ${b}`).toBe(FAMILY_MATRIX[b][a]);
      }
    }
  });
});

describe('PAIR_OVERRIDES', () => {
  it('has at least 10 overrides', () => {
    expect(PAIR_OVERRIDES.length).toBeGreaterThanOrEqual(10);
  });

  it('every override references existing species ids', () => {
    for (const override of PAIR_OVERRIDES) {
      expect(SPECIES[override.a], `unknown species ${override.a}`).toBeDefined();
      expect(SPECIES[override.b], `unknown species ${override.b}`).toBeDefined();
      expect(SPECIES[override.result], `unknown species ${override.result}`).toBeDefined();
    }
  });
});
