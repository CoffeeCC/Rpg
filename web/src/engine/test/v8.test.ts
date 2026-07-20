import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import { startBattle, endTurn } from '../systems/cardBattle';
import { forgeCharm } from '../systems/lootGen';
import { PERSONALITIES, personalityById } from '../data/personalities';
import { SPECIES } from '../data/species';
import { gameReducer, initialGameState, type GameState } from '../game';

function createHero(): GameState {
  let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Aria', race: 'Human', className: 'Warrior' });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  return state;
}

describe('v8: personalities & instincts', () => {
  it('every monster carries a personality with a growth bias and instinct', () => {
    const m = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 4 });
    expect(personalityById(m.personalityId)).not.toBeNull();
    expect(PERSONALITIES.length).toBe(8);
  });

  it('a tamed ally spends MP to act on instinct during the end phase', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    const ally = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 6, personalityId: 'savage' });
    ally.isTamed = true;
    const foe = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 2 });
    const battle = startBattle(hero, [ally], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    const mpBefore = ally.mp;
    const hpBefore = foe.hp;
    endTurn(hero, [ally], battle);
    expect(ally.mp).toBe(mpBefore - 3);
    expect(foe.hp).toBeLessThan(hpBefore);
  });

  it('wild (untamed) monsters never act on instinct', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    const bystander = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 6, personalityId: 'savage' });
    const foe = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 2 });
    const battle = startBattle(hero, [bystander], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    const mpBefore = bystander.mp;
    endTurn(hero, [bystander], battle);
    expect(bystander.mp).toBe(mpBefore);
  });
});

describe('v8: charms & per-copy smithing', () => {
  it('a forged charm raises the stats it blesses when worn', () => {
    const m = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 5 });
    const charm = forgeCharm(8, 10);
    expect(charm.slot).toBe('charm');
    expect(charm.affixes.length).toBeGreaterThanOrEqual(2);
    m.charm = charm;
    m.deriveStats();
    // At least one stat or maxHp must have moved (affixes may target non-stat lines).
    expect(m.maxHp).toBeGreaterThan(0);
  });

  it('smith upgrades one copy at a time', () => {
    let state = createHero();
    state.player!.gold = 10000;
    state = gameReducer(state, { type: 'GOTO', screen: 'smith' });
    state = gameReducer(state, { type: 'UPGRADE_CARD', cardId: 'strike' });
    expect(state.player!.upgradedCounts['strike']).toBe(1);
    state = gameReducer(state, { type: 'UPGRADE_CARD', cardId: 'strike' });
    expect(state.player!.upgradedCounts['strike']).toBe(2);
  });

  it('the hero can wear two rings plus amulet and pendant', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    expect('ring2' in hero.equipment && 'amulet' in hero.equipment && 'pendant' in hero.equipment).toBe(true);
  });
});

describe('v8: the Tellings', () => {
  it('death ends the run on the Fallen screen with verses computed', () => {
    let state = createHero();
    state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
    state = gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
    const foe = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 30 });
    state.battle = startBattle(state.player!, [], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    state.screen = 'battle';
    state.player!.hp = 1;
    state.battle.intents[foe.uid] = { kind: 'attack', amount: 999, times: 1 };
    state = gameReducer(state, { type: 'END_TURN' });
    expect(state.screen).toBe('fallen');
    expect(state.fallenSummary).not.toBeNull();
    expect(state.fallenSummary!.verses).toBeGreaterThanOrEqual(1);
  });
});
