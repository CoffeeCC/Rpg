import type { Stat } from '../types';

/**
 * PLAN5 (#48): DQM-style personalities. A tamed monster's personality shapes
 * how it GROWS (small stat-growth bias) and what it DOES on its own each
 * battle turn (its instinct — fires after your cards, before the enemy acts,
 * fueled by the monster's MP).
 */
export type InstinctKind = 'strike' | 'maul' | 'mend' | 'wardHero' | 'cower' | 'hex' | 'rally' | 'venom';

export interface PersonalityDef {
  id: string;
  name: string;
  /** One line shown to the player: temperament + what the instinct does. */
  blurb: string;
  /** Stat-growth multipliers applied in deriveStats (subtle: 0.92–1.10). */
  growth: Partial<Record<Stat, number>>;
  instinct: InstinctKind;
  instinctText: string;
}

export const INSTINCT_MP_COST = 3;

export const PERSONALITIES: PersonalityDef[] = [
  {
    id: 'valiant',
    name: 'Valiant',
    blurb: 'It puts itself between danger and the people it loves.',
    growth: { STR: 1.08, DEF: 1.04, DEX: 0.96 },
    instinct: 'strike',
    instinctText: 'Strikes the strongest foe unbidden.',
  },
  {
    id: 'savage',
    name: 'Savage',
    blurb: 'Something in it never fully came out of the dark.',
    growth: { STR: 1.1, DEF: 0.94 },
    instinct: 'maul',
    instinctText: 'Mauls a random foe, hard.',
  },
  {
    id: 'doting',
    name: 'Doting',
    blurb: 'It frets. It fusses. It keeps everyone alive.',
    growth: { INT: 1.08, MANA: 1.06, STR: 0.94 },
    instinct: 'mend',
    instinctText: 'Tends the most wounded ally.',
  },
  {
    id: 'stoic',
    name: 'Stoic',
    blurb: 'It endures, and it teaches you to.',
    growth: { DEF: 1.1, MAGDEF: 1.05, DEX: 0.95 },
    instinct: 'wardHero',
    instinctText: 'Shields you with its own calm.',
  },
  {
    id: 'craven',
    name: 'Craven',
    blurb: 'It is afraid of everything, and quick because of it.',
    growth: { DEX: 1.1, LUCK: 1.04, STR: 0.92 },
    instinct: 'cower',
    instinctText: 'Hides well — and you learn from watching.',
  },
  {
    id: 'sly',
    name: 'Sly',
    blurb: 'It watches for weakness the way others watch for food.',
    growth: { DEX: 1.06, INT: 1.05, DEF: 0.95 },
    instinct: 'hex',
    instinctText: 'Saps the strongest foe’s strength.',
  },
  {
    id: 'bright',
    name: 'Bright',
    blurb: 'It believes in you loudly and constantly.',
    growth: { LUCK: 1.08, MANA: 1.04, MAGDEF: 0.96 },
    instinct: 'rally',
    instinctText: 'Cheers you into hitting harder.',
  },
  {
    id: 'dour',
    name: 'Dour',
    blurb: 'It expects the worst, and sometimes delivers it.',
    growth: { MAGDEF: 1.08, INT: 1.04, LUCK: 0.94 },
    instinct: 'venom',
    instinctText: 'Its bitterness poisons a foe.',
  },
];

const BY_ID = new Map(PERSONALITIES.map((p) => [p.id, p]));

export function personalityById(id: string | null | undefined): PersonalityDef | null {
  return id ? BY_ID.get(id) ?? null : null;
}

export function rollPersonality(roll: number): PersonalityDef {
  return PERSONALITIES[Math.abs(roll) % PERSONALITIES.length];
}

/** Bond thresholds: instincts hit harder the longer a companion survives. */
export function bondPowerMult(bond: number): number {
  if (bond >= 25) return 1.5;
  if (bond >= 10) return 1.25;
  return 1;
}
