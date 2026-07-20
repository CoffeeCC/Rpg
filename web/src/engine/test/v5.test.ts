import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import { startBattle, endTurn, energyFor, handSizeFor, effectAmount } from '../systems/cardBattle';
import { traitsFor, talentsFor, TALENTS } from '../data/traits';
import { bestowName } from '../systems/naming';
import { SPECIES } from '../data/species';
import { GATES } from '../data/gates';
import { gameReducer, initialGameState, type GameState } from '../game';

function createHero(
  race: 'Human' | 'Elf' | 'Dwarf' | 'Orc' = 'Human',
  cls: 'Warrior' | 'Mage' | 'Thief' | 'Bard' | 'Knight' = 'Warrior'
): GameState {
  let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Aria', race, className: cls });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  return state;
}

function tamedMonster(level = 6): MonsterInstance {
  const m = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level });
  m.isTamed = true;
  return m;
}

function engageUnit(state: GameState): GameState {
  const exp = state.expedition!;
  let target = exp.units.find((u) => u.kind === 'enemy') ?? exp.units.find((u) => u.kind !== 'merchant');
  if (!target) {
    // Map has no live units (or none spawned) — inject one so the test is map-independent.
    target = { id: 'test-enemy', kind: 'enemy', x: 0, y: 0, label: 'Test Prowler', speciesId: Object.keys(SPECIES)[0], level: 1, mov: 3 };
    exp.units.push(target);
  }
  const floor = GATES[exp.gateId].floors[exp.floorIndex];
  outer: for (let y = 1; y < floor.grid.length - 1; y++) {
    for (let x = 1; x < floor.grid[y].length - 2; x++) {
      const open =
        floor.grid[y][x] !== '#' &&
        floor.grid[y][x + 1] &&
        floor.grid[y][x + 1] !== '#' &&
        !exp.units.some((u) => u !== target && ((u.x === x && u.y === y) || (u.x === x + 1 && u.y === y)));
      if (open) {
        target.x = x + 1;
        target.y = y;
        exp.x = x;
        exp.y = y;
        break outer;
      }
    }
  }
  exp.movLeft = 99;
  return gameReducer(state, { type: 'MOVE', dir: 'east' });
}

describe('v5: traits & talents', () => {
  it('every race and every class has a distinct mechanical identity', () => {
    const sets = [
      traitsFor('Human', 'Warrior'),
      traitsFor('Elf', 'Warrior'),
      traitsFor('Dwarf', 'Warrior'),
      traitsFor('Orc', 'Warrior'),
      traitsFor('Human', 'Mage'),
      traitsFor('Human', 'Thief'),
      traitsFor('Human', 'Bard'),
      traitsFor('Human', 'Knight'),
    ];
    const keys = sets.map((s) => JSON.stringify(s));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('trait hooks reach the battle engine: Vigor, hand size, damage, party cap', () => {
    const elf = new Character('E', 'Elf', 'Warrior');
    const human = new Character('H', 'Human', 'Warrior');
    expect(energyFor(elf)).toBe(energyFor(human) + 1);
    expect(elf.maxHp).toBeLessThan(human.maxHp);

    const mage = new Character('M', 'Human', 'Mage');
    expect(handSizeFor(mage)).toBe(handSizeFor(human) + 1);

    const orc = new Character('O', 'Orc', 'Warrior');
    const dmgOrc = effectAmount({ kind: 'damage', amount: 10 }, orc);
    const dmgHuman = effectAmount({ kind: 'damage', amount: 10 }, human);
    expect(dmgOrc).toBeGreaterThan(dmgHuman);
    const healOrc = effectAmount({ kind: 'heal', amount: 10 }, orc);
    expect(healOrc).toBeLessThan(10);

    expect(traitsFor('Human', 'Bard').partyCap).toBe(3);
    expect(traitsFor('Human', 'Knight').protectorHero).toBe(true);
  });

  it('Dwarf Ward persists between turns', () => {
    const dwarf = new Character('D', 'Dwarf', 'Warrior');
    const enemy = MonsterInstance.createWild({ families: ['Slime'], tierMin: 1, tierMax: 1, levelBonus: 0 });
    const battle = startBattle(dwarf, [], [enemy], { isBossFight: false, gateId: null, expeditionExtras: [] });
    battle.intents[enemy.uid] = { kind: 'defend', amount: 5 };
    battle.heroBlock = 12;
    endTurn(dwarf, [], battle);
    expect(battle.heroBlock).toBe(12);
  });

  it('talents unlock at their levels and feed the engine', () => {
    expect(talentsFor(2).firstTurnDraw).toBe(0);
    expect(talentsFor(3).firstTurnDraw).toBe(1);
    expect(talentsFor(9).firstCardFree).toBe(true);
    expect(TALENTS.length).toBeGreaterThanOrEqual(5);
  });
});

describe('v5: fixed danger bands (no player scaling)', () => {
  it('spawn level depends only on the floor, never the player', () => {
    const spawn = { families: ['Slime' as const], tierMin: 1, tierMax: 2, levelBonus: 10 };
    for (let i = 0; i < 20; i++) {
      const m = MonsterInstance.createWild(spawn);
      expect(m.level).toBeGreaterThanOrEqual(11);
      expect(m.level).toBeLessThanOrEqual(15);
    }
  });

  it('leveling is much slower than v4', () => {
    const h = new Character('A', 'Human', 'Warrior');
    expect(h.expToNext()).toBeGreaterThanOrEqual(30);
    h.gainExp(29);
    expect(h.level).toBe(1);
    h.gainExp(1);
    expect(h.level).toBe(2);
    expect(h.attributePoints).toBe(3);
  });
});

describe('v5: permadeath & naming', () => {
  it('a party monster that falls in battle is gone forever, with a Chronicle deed', () => {
    let state = createHero();
    const companion = tamedMonster(3);
    companion.nickname = 'Brenna';
    state.party.push(companion);
    state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
    state = gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
    state = engageUnit(state);
    if (state.pendingLegend) state = gameReducer(state, { type: 'LEGEND_SEEN' });
    expect(state.screen).toBe('battle');
    // Doom the companion: 1 HP, big guaranteed enemy hits (monsters soak first).
    const inParty = state.party.find((m) => m.uid === companion.uid)!;
    inParty.hp = 1;
    for (const e of state.battle!.enemies) {
      state.battle!.intents[e.uid] = { kind: 'attack', amount: 50, times: 1 };
    }
    state = gameReducer(state, { type: 'END_TURN' });
    expect(state.party.some((m) => m.uid === companion.uid)).toBe(false);
    expect(state.chronicle.deeds.some((d) => d.text.includes('Brenna'))).toBe(true);
  });

  it('breeding consumes BOTH parents and the child bears a fresh personal name', () => {
    let state = createHero('Human', 'Bard'); // partyCap 3 gives room
    const a = tamedMonster(6);
    const b = tamedMonster(6);
    a.nickname = 'ParentA';
    b.nickname = 'ParentB';
    state.party.push(a, b);
    const beforeTotal = state.party.length + state.stable.length;
    state = gameReducer(state, { type: 'GOTO', screen: 'breeding' });
    state = gameReducer(state, { type: 'BREED', parentA: a.uid, parentB: b.uid, skillIds: [] });
    const all = [...state.party, ...state.stable];
    expect(all.some((m) => m.uid === a.uid)).toBe(false);
    expect(all.some((m) => m.uid === b.uid)).toBe(false);
    expect(state.party.length + state.stable.length).toBe(beforeTotal - 1);
    const child = all.find((m) => m.nickname !== 'ParentA' && m.nickname !== 'ParentB' && m.isTamed);
    expect(child).toBeDefined();
    expect(child!.nickname).not.toBe(child!.species.name);
  });

  it('bestowName produces varied, printable names', () => {
    const names = new Set<string>();
    for (let i = 0; i < 60; i++) names.add(bestowName());
    expect(names.size).toBeGreaterThan(20);
    for (const n of names) {
      expect(n.length).toBeGreaterThanOrEqual(3);
      expect(n[0]).toMatch(/[A-Z]/);
    }
  });

  it('tamed monsters receive a personal name through the reducer', () => {
    let state = createHero();
    state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
    state = gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
    state = engageUnit(state);
    if (state.pendingLegend) state = gameReducer(state, { type: 'LEGEND_SEEN' });
    expect(state.screen).toBe('battle');
    const target = state.battle!.enemies[0];
    target.hp = 1;
    target.tameBonus = 500;
    const speciesName = target.species.name;
    let guard = 0;
    while (state.screen === 'battle' && guard++ < 80) {
      const idx = state.battle!.hand.findIndex((c) => c.cardId === 'reachOut');
      if (idx >= 0 && state.battle!.energy > 0) {
        state = gameReducer(state, { type: 'PLAY_CARD', handIndex: idx, targetUid: target.uid });
      } else {
        state = gameReducer(state, { type: 'END_TURN' });
      }
      if (state.player && state.screen === 'battle') state.player.hp = state.player.maxHp;
    }
    const tamed = [...state.party, ...state.stable].find((m) => m.uid === target.uid);
    if (tamed) {
      expect(tamed.nickname).not.toBe(speciesName);
    }
  });
});
