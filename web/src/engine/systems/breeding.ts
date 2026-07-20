import type { SpeciesDef, Stat, StatBlock } from '../types';
import { MonsterInstance } from '../entities/MonsterInstance';
import { SPECIES, speciesById } from '../data/species';
import { FAMILY_MATRIX, PAIR_OVERRIDES } from '../data/breeding';
import { randInt } from '../random';

export const MIN_BREEDING_LEVEL = 5;

export function canBreed(a: MonsterInstance, b: MonsterInstance): { ok: boolean; reason?: string } {
  if (a.uid === b.uid) return { ok: false, reason: 'A monster cannot breed with itself.' };
  if (!a.isTamed || !b.isTamed) return { ok: false, reason: 'Both parents must be tamed.' };
  if (a.level < MIN_BREEDING_LEVEL || b.level < MIN_BREEDING_LEVEL) {
    return { ok: false, reason: `Both parents must be at least level ${MIN_BREEDING_LEVEL}.` };
  }
  return { ok: true };
}

/** Which species a pairing produces. Deterministic given the parents. */
export function offspringSpecies(a: MonsterInstance, b: MonsterInstance): SpeciesDef {
  const override = PAIR_OVERRIDES.find(
    (o) => (o.a === a.speciesId && o.b === b.speciesId) || (o.a === b.speciesId && o.b === a.speciesId)
  );
  if (override) {
    const result = speciesById(override.result);
    if (result) return result;
  }

  const family = FAMILY_MATRIX[a.species.family][b.species.family];
  const targetTier = Math.max(1, Math.min(5, Math.floor((a.species.tier + b.species.tier) / 2) + 1));
  const candidates = Object.values(SPECIES).filter((s) => s.family === family && s.tier <= targetTier);
  if (candidates.length === 0) {
    // Family has no species at/below the target tier - fall back to any of the family, then anything.
    const anyOfFamily = Object.values(SPECIES).filter((s) => s.family === family);
    if (anyOfFamily.length > 0) return anyOfFamily.sort((x, y) => x.tier - y.tier)[0];
    return a.species;
  }
  const topTier = Math.max(...candidates.map((s) => s.tier));
  const top = candidates.filter((s) => s.tier === topTier);
  return top[randInt(top.length)];
}

/** Skills the offspring can be given: union of parents' skills + its innate ones. */
export function skillPool(a: MonsterInstance, b: MonsterInstance): string[] {
  const offspring = offspringSpecies(a, b);
  return [...new Set([...offspring.innateSkills, ...a.knownSkills, ...b.knownSkills])];
}

/**
 * Breed two tamed monsters. BOTH PARENTS ARE CONSUMED (the caller removes
 * them). Offspring: level 1, +generation growth boost, quarter-stat
 * inheritance from each parent, and up to 3 chosen skills from the pool.
 */
export function breed(a: MonsterInstance, b: MonsterInstance, chosenSkills: string[]): MonsterInstance {
  const species = offspringSpecies(a, b);
  const pool = skillPool(a, b);
  const skills = chosenSkills.filter((id) => pool.includes(id)).slice(0, 3);
  if (skills.length === 0) skills.push(...species.innateSkills.slice(0, 1));

  const bonusStats = {} as StatBlock;
  for (const stat of Object.keys(a.stats) as Stat[]) {
    bonusStats[stat] = Math.floor(a.stats[stat] / 4) + Math.floor(b.stats[stat] / 4);
  }

  const child = new MonsterInstance({
    speciesId: species.id,
    level: 1,
    plus: Math.max(a.plus, b.plus) + 1,
    bonusStats,
    knownSkills: skills,
    customSkills: true,
  });
  child.isTamed = true;
  return child;
}
