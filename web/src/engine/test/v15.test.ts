import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import { startBattle, endTurn, collectSpoils } from '../systems/cardBattle';
import { newExpedition, revealAround, isSeen, openKey, FOG_RADIUS, type Direction } from '../systems/floors';
import { SPECIES } from '../data/species';
import { gameReducer, initialGameState, type GameState } from '../game';

function createHero(): GameState {
  let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Aria', race: 'Human', className: 'Warrior' });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  return state;
}

function enterGate(state: GameState): GameState {
  state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
  return gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
}

const speciesId = Object.keys(SPECIES)[0];

describe('v15: fog of war', () => {
  it('a fresh expedition sees only the lantern-light around the start', () => {
    const base = initialGameState();
    const exp = newExpedition('verdant', null, base.chronicle, false);
    expect(exp.seen).toBeDefined();
    expect(isSeen(exp, exp.x, exp.y)).toBe(true);
    expect(isSeen(exp, exp.x + FOG_RADIUS, exp.y)).toBe(true);
    // Well beyond the lantern: dark (pick a far corner that exists on the grid).
    expect(isSeen(exp, exp.x + FOG_RADIUS + 4, exp.y + FOG_RADIUS + 4)).toBe(false);
  });

  it('walking reveals new ground through the reducer', () => {
    let state = enterGate(createHero());
    const before = state.expedition!.seen!.length;
    for (const dir of ['north', 'south', 'east', 'west'] as Direction[]) {
      const next = gameReducer(state, { type: 'MOVE', dir });
      if (next.expedition && (next.expedition.x !== state.expedition!.x || next.expedition.y !== state.expedition!.y)) {
        state = next;
        break;
      }
    }
    expect(state.expedition!.seen!.length).toBeGreaterThanOrEqual(before);
    expect(isSeen(state.expedition!, state.expedition!.x, state.expedition!.y)).toBe(true);
  });

  it('revealAround is idempotent and bounded to the grid', () => {
    const base = initialGameState();
    const exp = newExpedition('verdant', null, base.chronicle, false);
    const once = exp.seen!.length;
    revealAround(exp);
    expect(exp.seen!.length).toBe(once);
    for (const key of exp.seen!) expect(key).toBe(openKey(exp, ...(key.split(':')[2].split(',').map(Number) as [number, number])));
  });

  it('pre-fog expeditions (no seen array) are treated as fully lit', () => {
    const base = initialGameState();
    const exp = newExpedition('verdant', null, base.chronicle, false);
    delete exp.seen;
    expect(isSeen(exp, exp.x, exp.y)).toBe(false); // engine says unseen…
    // …but the reducer must not start fogging a legacy save on MOVE.
    let state = enterGate(createHero());
    delete state.expedition!.seen;
    for (const dir of ['north', 'south', 'east', 'west'] as Direction[]) {
      const next = gameReducer(state, { type: 'MOVE', dir });
      if (next !== state) {
        expect(next.expedition?.seen).toBeUndefined();
        break;
      }
    }
  });
});

describe('v15: battle readability & companion stamina', () => {
  it('a winded companion says so instead of silently skipping', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    const ally = new MonsterInstance({ speciesId, level: 6, personalityId: 'savage' });
    ally.isTamed = true;
    const foe = new MonsterInstance({ speciesId, level: 1 });
    const battle = startBattle(hero, [ally], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    ally.mp = 0;
    const result = endTurn(hero, [ally], battle);
    expect(result.log.some((l) => l.includes('winded'))).toBe(true);
    expect(result.fx.some((f) => f.fx === 'status' && f.label === 'winded')).toBe(true);
  });

  it('companions regain breath each round, so instincts return', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    hero.maxHp = 500;
    hero.hp = 500;
    const ally = new MonsterInstance({ speciesId, level: 6, personalityId: 'savage' });
    ally.isTamed = true;
    const foe = new MonsterInstance({ speciesId, level: 1 });
    const battle = startBattle(hero, [ally], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    ally.mp = 0;
    let acted = false;
    for (let round = 0; round < 5 && !acted; round++) {
      foe.hp = foe.maxHp; // keep the fight alive for the loop
      const result = endTurn(hero, [ally], battle);
      if (result.outcome !== 'ongoing') break;
      acted = result.fx.some((f) => f.fx === 'actor' && f.uid === ally.uid);
    }
    expect(acted).toBe(true); // 3 rounds of +1 MP buys one instinct
  });

  it('every acting combatant announces itself with an actor event', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    hero.maxHp = 500;
    hero.hp = 500;
    const ally = new MonsterInstance({ speciesId, level: 6, personalityId: 'savage' });
    ally.isTamed = true;
    const foe = new MonsterInstance({ speciesId, level: 2 });
    const battle = startBattle(hero, [ally], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    foe.hp = foe.maxHp = 999; // survive the ally's instinct so it still acts
    const result = endTurn(hero, [ally], battle);
    const actors = result.fx.filter((f) => f.fx === 'actor');
    expect(actors.some((f) => f.fx === 'actor' && f.uid === ally.uid && f.side === 'ally')).toBe(true);
    expect(actors.some((f) => f.fx === 'actor' && f.uid === foe.uid && f.side === 'enemy')).toBe(true);
  });

  it('victory rests the party: companions leave with full MP', () => {
    const hero = new Character('A', 'Human', 'Warrior');
    const ally = new MonsterInstance({ speciesId, level: 6, personalityId: 'savage' });
    ally.isTamed = true;
    const foe = new MonsterInstance({ speciesId, level: 1 });
    const battle = startBattle(hero, [ally], [foe], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
    ally.mp = 0;
    foe.hp = 0;
    collectSpoils(hero, [ally], battle);
    expect(ally.mp).toBe(ally.maxMp);
  });
});
