import { describe, it, expect } from 'vitest';
import {
  TAME_CARD_ID,
  CARDS,
  CLASS_DECKS,
  RACE_CARDS,
  SPECIES_CARDS,
  REWARD_POOLS,
  getCard,
} from '../data/cards';
import { SPECIES } from '../data/species';
import type { ClassName, RaceName } from '../types';

const CLASS_NAMES: ClassName[] = ['Warrior', 'Mage', 'Thief', 'Bard', 'Knight'];
const RACE_NAMES: RaceName[] = ['Human', 'Elf', 'Dwarf', 'Orc'];

describe('CARDS', () => {
  it('has at least 180 cards', () => {
    expect(Object.keys(CARDS).length).toBeGreaterThanOrEqual(180);
  });

  it('key === id for every entry', () => {
    for (const [key, card] of Object.entries(CARDS)) {
      expect(card.id, `card key ${key}`).toBe(key);
    }
  });

  it('every card has at least one effect, non-empty text, and cost 0-3', () => {
    for (const card of Object.values(CARDS)) {
      expect(card.effects.length, `card ${card.id} effects`).toBeGreaterThanOrEqual(1);
      expect(card.text.trim().length, `card ${card.id} text`).toBeGreaterThan(0);
      expect(card.cost, `card ${card.id} cost`).toBeGreaterThanOrEqual(0);
      expect(card.cost, `card ${card.id} cost`).toBeLessThanOrEqual(3);
    }
  });

  it('getCard returns entries for known ids and undefined for unknown', () => {
    expect(getCard('strike')).toBe(CARDS.strike);
    expect(getCard('definitelyNotACard')).toBeUndefined();
  });
});

describe('TAME_CARD_ID', () => {
  it('exists in CARDS with a tame effect and exhaust', () => {
    const card = CARDS[TAME_CARD_ID];
    expect(card, 'tame card exists').toBeDefined();
    expect(card.effects.some((e) => e.kind === 'tame'), 'has tame effect').toBe(true);
    expect(card.exhaust, 'tame card exhausts').toBe(true);
  });

  it('taming stays exclusive to the tame card', () => {
    for (const card of Object.values(CARDS)) {
      if (card.id === TAME_CARD_ID) continue;
      expect(
        card.effects.some((e) => e.kind === 'tame'),
        `card ${card.id} must not have a tame effect`,
      ).toBe(false);
    }
  });
});

describe('CLASS_DECKS', () => {
  it('covers all five classes with exactly 10 existing card ids each', () => {
    for (const cls of CLASS_NAMES) {
      const deck = CLASS_DECKS[cls];
      expect(deck, `class ${cls}`).toBeDefined();
      expect(deck.length, `class ${cls} deck size`).toBe(10);
      for (const id of deck) {
        expect(CARDS[id], `class ${cls} references ${id}`).toBeDefined();
      }
    }
  });
});

describe('RACE_CARDS', () => {
  it('covers all four races with 2-3 existing card ids each', () => {
    for (const race of RACE_NAMES) {
      const cards = RACE_CARDS[race];
      expect(cards, `race ${race}`).toBeDefined();
      expect(cards.length, `race ${race} card count`).toBeGreaterThanOrEqual(2);
      expect(cards.length, `race ${race} card count`).toBeLessThanOrEqual(3);
      for (const id of cards) {
        expect(CARDS[id], `race ${race} references ${id}`).toBeDefined();
      }
    }
  });
});

describe('SPECIES_CARDS', () => {
  it('covers every species id with 1-3 existing card ids', () => {
    for (const speciesId of Object.keys(SPECIES)) {
      const cards = SPECIES_CARDS[speciesId];
      expect(cards, `species ${speciesId} has cards`).toBeDefined();
      expect(cards.length, `species ${speciesId} card count`).toBeGreaterThanOrEqual(1);
      expect(cards.length, `species ${speciesId} card count`).toBeLessThanOrEqual(3);
      for (const id of cards) {
        expect(CARDS[id], `species ${speciesId} references ${id}`).toBeDefined();
      }
    }
  });

  it('has no entries for unknown species', () => {
    for (const speciesId of Object.keys(SPECIES_CARDS)) {
      expect(SPECIES[speciesId], `SPECIES_CARDS key ${speciesId}`).toBeDefined();
    }
  });

  it('species-card damage/block/heal/drain effects scale MSTR or MINT only', () => {
    for (const [speciesId, cardIds] of Object.entries(SPECIES_CARDS)) {
      for (const id of cardIds) {
        const card = CARDS[id];
        for (const effect of card.effects) {
          if (
            effect.kind === 'damage' ||
            effect.kind === 'block' ||
            effect.kind === 'heal' ||
            effect.kind === 'drain'
          ) {
            expect(
              ['MSTR', 'MINT'],
              `species ${speciesId} card ${id} ${effect.kind} scaling`,
            ).toContain(effect.scaling);
          }
        }
      }
    }
  });
});

describe('REWARD_POOLS', () => {
  it('meets minimum pool sizes (common 20, uncommon 15, rare 10)', () => {
    expect(REWARD_POOLS.common.length).toBeGreaterThanOrEqual(20);
    expect(REWARD_POOLS.uncommon.length).toBeGreaterThanOrEqual(15);
    expect(REWARD_POOLS.rare.length).toBeGreaterThanOrEqual(10);
  });

  it('every pooled id exists, has matching non-starter rarity, and pools have no duplicates', () => {
    for (const rarity of ['common', 'uncommon', 'rare'] as const) {
      const pool = REWARD_POOLS[rarity];
      expect(new Set(pool).size, `${rarity} pool unique`).toBe(pool.length);
      for (const id of pool) {
        const card = CARDS[id];
        expect(card, `${rarity} pool references ${id}`).toBeDefined();
        expect(card.rarity, `${rarity} pool card ${id} rarity`).toBe(rarity);
      }
    }
  });
});
