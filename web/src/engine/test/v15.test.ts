import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import { startBattle, endTurn, collectSpoils } from '../systems/cardBattle';
import { newExpedition, revealLantern, isRevealed, litTiles, lanternRadius, openKey, type Direction } from '../systems/floors';
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
  it('a fresh expedition reveals only the lantern-light around the start', () => {
    const base = initialGameState();
    const exp = newExpedition('verdant', null, base.chronicle, false);
    // newExpedition starts dark; the Lantern does the revealing.
    expect(exp.revealed).toEqual([]);
    const hero = new Character('A', 'Human', 'Warrior');
    const lit = revealLantern(exp, hero);
    expect(lit.revealed.length).toBeGreaterThan(0);
    expect(isRevealed(lit, exp.x, exp.y)).toBe(true);
    // Well beyond the lantern's reach: still dark.
    const r = lanternRadius(hero);
    expect(isRevealed(lit, exp.x + r + 4, exp.y + r + 4)).toBe(false);
  });

  it('entering a gate through the reducer lights the start room', () => {
    const state = enterGate(createHero());
    const exp = state.expedition!;
    expect(exp.revealed.length).toBeGreaterThan(0);
    expect(isRevealed(exp, exp.x, exp.y)).toBe(true);
    // Everything currently lit must also be part of the revealed memory.
    const lit = litTiles(exp, lanternRadius(state.player!));
    expect(lit.has(`${exp.x},${exp.y}`)).toBe(true);
    for (const key of lit) {
      const [x, y] = key.split(',').map(Number);
      expect(isRevealed(exp, x, y)).toBe(true);
    }
  });

  it('walking reveals new ground through the reducer', () => {
    let state = enterGate(createHero());
    const before = state.expedition!.revealed.length;
    for (const dir of ['north', 'south', 'east', 'west'] as Direction[]) {
      const next = gameReducer(state, { type: 'MOVE', dir });
      if (next.expedition && (next.expedition.x !== state.expedition!.x || next.expedition.y !== state.expedition!.y)) {
        state = next;
        break;
      }
    }
    expect(state.expedition!.revealed.length).toBeGreaterThanOrEqual(before);
    expect(isRevealed(state.expedition!, state.expedition!.x, state.expedition!.y)).toBe(true);
  });

  it('revealLantern merges scoped keys and returns the same reference when nothing is new', () => {
    const state = enterGate(createHero());
    const exp = state.expedition!;
    // The reducer already revealed the lantern circle — nothing new to add.
    const again = revealLantern(exp, state.player!);
    expect(again).toBe(exp);
    // Every remembered key is floor-scoped exactly as openKey scopes it.
    for (const key of exp.revealed) {
      expect(key).toBe(openKey(exp, ...(key.split(':')[2].split(',').map(Number) as [number, number])));
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
