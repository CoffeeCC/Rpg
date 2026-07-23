// Smoke test for the battle-art layer: every species / class / card combo
// must render to SVG markup without throwing. Uses createElement (no JSX in .ts).
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SPECIES } from '../data/species';
import type { CardRarity, CardType, ClassName, GateId, MonsterRarity } from '../types';
import { MonsterArt } from '../../art/monsterArt';
import { HeroArt } from '../../art/heroArt';
import { CardArtBackdrop, CardOrnament } from '../../art/cardFrames';
import { BattleBackdrop, CardBack, TownBackdrop } from '../../art/backdrops';

const CLASSES: ClassName[] = ['Warrior', 'Mage', 'Thief', 'Bard', 'Knight'];
const CARD_TYPES: CardType[] = ['strike', 'spell', 'guard', 'tactic', 'summon'];
const CARD_RARITIES: CardRarity[] = ['starter', 'common', 'uncommon', 'rare'];
const MONSTER_RARITIES: MonsterRarity[] = ['Common', 'Alpha', 'Rare'];
const GATE_IDS: GateId[] = ['verdant', 'hollow', 'sunken', 'storm', 'abyss'];

describe('MonsterArt', () => {
  it('renders an svg for every species in the roster', () => {
    const ids = Object.keys(SPECIES);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) {
      const html = renderToStaticMarkup(createElement(MonsterArt, { speciesId: id, size: 200 }));
      expect(html, `species ${id}`).toContain('<svg');
    }
  });

  it('renders an unknown speciesId without throwing', () => {
    const html = renderToStaticMarkup(
      createElement(MonsterArt, { speciesId: 'definitelyNotASpecies', size: 200 })
    );
    expect(html).toContain('<svg');
  });

  it('renders all rarity variants and boss without throwing', () => {
    for (const rarity of MONSTER_RARITIES) {
      for (const boss of [false, true]) {
        const html = renderToStaticMarkup(
          createElement(MonsterArt, { speciesId: 'infernoDragon', size: 240, rarity, boss })
        );
        expect(html, `rarity ${rarity} boss ${boss}`).toContain('<svg');
      }
    }
  });
});

describe('HeroArt', () => {
  it('renders an svg for every class', () => {
    for (const className of CLASSES) {
      const html = renderToStaticMarkup(createElement(HeroArt, { className, size: 160 }));
      expect(html, `class ${className}`).toContain('<svg');
    }
  });

  it('renders pairwise distinct markup for every class', () => {
    const markup = CLASSES.map((className) =>
      renderToStaticMarkup(createElement(HeroArt, { className, size: 160 }))
    );
    for (let i = 0; i < markup.length; i++) {
      for (let j = i + 1; j < markup.length; j++) {
        expect(markup[i], `${CLASSES[i]} vs ${CLASSES[j]}`).not.toBe(markup[j]);
      }
    }
  });
});

describe('backdrops', () => {
  it('renders an svg for every gate', () => {
    for (const gateId of GATE_IDS) {
      const html = renderToStaticMarkup(createElement(BattleBackdrop, { gateId }));
      expect(html, `gate ${gateId}`).toContain('<svg');
    }
  });

  it('renders an svg for the town', () => {
    const html = renderToStaticMarkup(createElement(TownBackdrop, {}));
    expect(html).toContain('<svg');
  });

  it('renders the card back', () => {
    // Grok-painted image, not procedural SVG - just confirm it renders the art.
    const html = renderToStaticMarkup(createElement(CardBack, { width: 120 }));
    expect(html).toContain('back_lantern.jpg');
  });
});

describe('card frames', () => {
  it('renders CardOrnament for all type x rarity combos', () => {
    // One painted frame image per rarity tier (not per type x rarity) - just
    // confirm every rarity resolves to its own frame art without crashing.
    for (const type of CARD_TYPES) {
      for (const rarity of CARD_RARITIES) {
        const html = renderToStaticMarkup(createElement(CardOrnament, { type, rarity }));
        expect(html, `${type}/${rarity}`).toContain(`frame_${rarity}.png`);
      }
    }
  });

  it('renders CardArtBackdrop for all types', () => {
    for (const type of CARD_TYPES) {
      const html = renderToStaticMarkup(createElement(CardArtBackdrop, { type }));
      expect(html.length, `backdrop ${type}`).toBeGreaterThan(0);
    }
  });
});
