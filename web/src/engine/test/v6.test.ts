import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { movFor, advanceHostiles, spawnFloorUnits, floorHasMiniboss, type FloorUnit } from '../systems/floors';
import { serializeGameState, deserializeGameState, SAVE_VERSION } from '../systems/saveGame';
import { GATES } from '../data/gates';
import { SPECIES } from '../data/species';
import { QUESTS } from '../data/quests';
import { gameReducer, initialGameState, availableQuests, type GameState } from '../game';

function createHero(cls: 'Warrior' | 'Thief' = 'Warrior'): GameState {
  let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Aria', race: 'Human', className: cls });
  state = gameReducer(state, { type: 'STORY_CONTINUE' });
  return state;
}

function enterVerdant(state: GameState): GameState {
  state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
  return gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
}

/** Find an open (x, x+1) tile pair with no unit on either square. */
function openPair(state: GameState): { x: number; y: number } {
  const exp = state.expedition!;
  const floor = GATES[exp.gateId].floors[exp.floorIndex];
  for (let y = 1; y < floor.grid.length - 1; y++) {
    for (let x = 1; x < floor.grid[y].length - 2; x++) {
      if (
        floor.grid[y][x] === '.' &&
        floor.grid[y][x + 1] === '.' &&
        !exp.units.some((u) => (u.x === x || u.x === x + 1) && u.y === y)
      ) {
        return { x, y };
      }
    }
  }
  throw new Error('no open pair on floor');
}

function testUnit(kind: FloorUnit['kind'], x: number, y: number): FloorUnit {
  return { id: `t-${kind}`, kind, x, y, label: `Test ${kind}`, speciesId: Object.keys(SPECIES)[0], level: 1, mov: 3 };
}

describe('v6: tactical movement', () => {
  it('MOV budget grows with DEX, boots, and the Thief trait', () => {
    const base = new Character('A', 'Human', 'Warrior');
    const mov0 = movFor(base);
    expect(mov0).toBeGreaterThanOrEqual(4);
    const nimble = new Character('B', 'Human', 'Warrior');
    nimble.stats.DEX += 30;
    nimble.recomputeDerived();
    expect(movFor(nimble)).toBeGreaterThan(mov0);
    const thief = new Character('C', 'Human', 'Thief');
    const warriorTwin = new Character('D', 'Human', 'Warrior');
    // Same DEX so the only difference is Fleetfoot's +1.
    thief.stats.DEX = warriorTwin.stats.DEX;
    thief.recomputeDerived();
    expect(movFor(thief)).toBe(movFor(warriorTwin) + 1);
  });

  it('moving costs MOV; running out triggers the enemy phase (movLeft refills)', () => {
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    state.expedition!.units = [];
    state.expedition!.x = spot.x;
    state.expedition!.y = spot.y;
    state.expedition!.movLeft = 1;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    // Spent the last point: enemy phase ran and the budget refilled.
    expect(state.expedition!.movLeft).toBe(movFor(state.player!));
  });

  it('walking into a hostile unit starts a battle with that unit', () => {
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    exp.x = spot.x;
    exp.y = spot.y;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('battle');
    expect(state.battle!.unitId).toBe('t-enemy');
  });

  it('hostiles pursue the player during the enemy phase and contact starts a battle', () => {
    const state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.x = spot.x;
    exp.y = spot.y;
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    const contact = advanceHostiles(exp);
    expect(contact).not.toBeNull();
    expect(contact!.id).toBe('t-enemy');
  });

  it('END_MAP_TURN holds ground and lets the floor move', () => {
    let state = enterVerdant(createHero());
    state.expedition!.units = [];
    state.expedition!.movLeft = 2;
    state = gameReducer(state, { type: 'END_MAP_TURN' });
    expect(state.expedition!.movLeft).toBe(movFor(state.player!));
  });
});

describe('v6: minibosses & history', () => {
  it('spawnFloorUnits embodies the gate\'s unslain famous beast as the miniboss', () => {
    const state = createHero();
    const beast = state.world!.beasts.find((b) => b.gateId === 'verdant');
    const floorIdx = GATES.verdant.floors.findIndex((f) => floorHasMiniboss(f));
    if (floorIdx === -1 || !beast) return; // map or world rolled none; other tests cover the rest
    const units = spawnFloorUnits(GATES.verdant.floors[floorIdx], 'verdant', state.world, state.chronicle, false);
    const mini = units.find((u) => u.kind === 'miniboss');
    expect(mini).toBeDefined();
    expect(mini!.famousBeastId).toBe(beast.id);
    expect(mini!.label).toContain(beast.name);
  });

  it('a slain beast gives way to a Remnant of a fallen figure', () => {
    const state = createHero();
    const floorIdx = GATES.verdant.floors.findIndex((f) => floorHasMiniboss(f));
    if (floorIdx === -1) return;
    for (const b of state.world!.beasts) state.chronicle.beastsSlain.push(b.id);
    const units = spawnFloorUnits(GATES.verdant.floors[floorIdx], 'verdant', state.world, state.chronicle, false);
    const mini = units.find((u) => u.kind === 'miniboss');
    expect(mini).toBeDefined();
    expect(mini!.famousBeastId).toBeUndefined();
    expect(mini!.label).toMatch(/Remnant of |Nameless Warden/);
  });
});

describe('v6: quest pacing', () => {
  it('the board starts with 3 quests, easiest first, and grows with claims and chapters', () => {
    const state = createHero();
    const posted = availableQuests(state);
    expect(posted).toHaveLength(3);
    for (let i = 1; i < posted.length; i++) {
      expect(posted[i].reward.gold).toBeGreaterThanOrEqual(posted[i - 1].reward.gold);
    }
    state.questLog.push({ id: posted[0].id, progress: 1, complete: true, claimed: true });
    expect(availableQuests(state)).toHaveLength(4);
    state.storyChapter = 2;
    expect(availableQuests(state)).toHaveLength(4 + 4);
  });

  it('quests beyond the posted set cannot be accepted', () => {
    let state = createHero();
    const posted = availableQuests(state);
    const hidden = QUESTS.find((q) => !posted.some((p) => p.id === q.id));
    if (!hidden) return;
    state = gameReducer(state, { type: 'GOTO', screen: 'questBoard' });
    state = gameReducer(state, { type: 'ACCEPT_QUEST', questId: hidden.id });
    expect(state.questLog).toHaveLength(0);
    state = gameReducer(state, { type: 'ACCEPT_QUEST', questId: posted[0].id });
    expect(state.questLog).toHaveLength(1);
  });
});

describe('v6: merchant & town return', () => {
  it('bumping the merchant opens the mat; buying a card adds an expedition extra', () => {
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [{ ...testUnit('merchant', spot.x + 1, spot.y), mov: 0 }];
    exp.x = spot.x;
    exp.y = spot.y;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('floor');
    expect(state.pendingMerchant).not.toBeNull();
    // The merchant doesn't block you into place.
    expect(state.expedition!.x).toBe(spot.x);
    state.player!.gold = 500;
    const cardId = state.pendingMerchant!.cardId!;
    state = gameReducer(state, { type: 'MERCHANT_BUY', what: 'card', index: 0 });
    expect(state.expeditionExtras).toContain(cardId);
    expect(state.pendingMerchant!.cardId).toBeNull();
    state = gameReducer(state, { type: 'MERCHANT_CLOSE' });
    expect(state.pendingMerchant).toBeNull();
  });

  it('stepping back onto the entrance of floor 1 returns to Everdusk', () => {
    let state = enterVerdant(createHero());
    const exp = state.expedition!;
    const floor = GATES.verdant.floors[0];
    let sx = -1;
    let sy = -1;
    for (let y = 0; y < floor.grid.length; y++) {
      const x = floor.grid[y].indexOf('S');
      if (x !== -1) {
        sx = x;
        sy = y;
        break;
      }
    }
    expect(sx).toBeGreaterThanOrEqual(0);
    // Stand east of the entrance and step back onto it.
    exp.units = [];
    exp.x = sx + 1;
    exp.y = sy;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'west' });
    expect(state.screen).toBe('town');
    expect(state.expedition).toBeNull();
    expect(state.expeditionExtras).toHaveLength(0);
  });
});

describe('v6: save format', () => {
  it('round-trips tactical expedition state and rejects v3 saves', () => {
    expect(SAVE_VERSION).toBe(5);
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    state.expedition!.units = [testUnit('enemy', spot.x, spot.y)];
    state.expedition!.broken.push('verdant:0:1,1');
    const data = serializeGameState(state);
    expect(data).not.toBeNull();
    const restored = deserializeGameState(data!);
    expect(restored.expedition!.units).toHaveLength(1);
    expect(restored.expedition!.units[0].kind).toBe('enemy');
    expect(restored.expedition!.broken).toContain('verdant:0:1,1');
    expect(() => deserializeGameState({ version: 3, savedAt: '', state: {} })).toThrow(/older age/);
  });
});

describe('v6.1: danger zones', () => {
  it('threat covers exactly the tiles an aware hostile can reach', async () => {
    const { threatTiles } = await import('../systems/floors');
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    exp.x = spot.x;
    exp.y = spot.y;
    const threat = threatTiles(exp);
    expect(threat.has(`${spot.x + 1},${spot.y}`)).toBe(true); // its own tile
    expect(threat.has(`${spot.x},${spot.y}`)).toBe(true); // can step onto the player
    // A dormant hostile far outside sight projects nothing.
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    exp.x = 1;
    exp.y = 1;
    const grid = GATES.verdant.floors[0].grid;
    let far = false;
    if (Math.abs(spot.x - 1) + Math.abs(spot.y - 1) > 12 && grid[1][1] === '.') far = true;
    if (far) expect(threatTiles(exp).size).toBe(0);
  });
});

describe('v6.2: taming fixes', () => {
  async function tameFirstEnemy(state: GameState): Promise<GameState> {
    const target = state.battle!.enemies[0];
    target.hp = 1;
    target.tameBonus = 500;
    let guard = 0;
    while (state.screen === 'battle' && guard++ < 80) {
      const idx = state.battle!.hand.findIndex((c) => c.cardId === 'reachOut');
      if (idx >= 0 && state.battle!.energy > 0) {
        state = gameReducer(state, { type: 'PLAY_CARD', handIndex: idx, targetUid: target.uid });
        if (target.isTamed) break;
      } else {
        state = gameReducer(state, { type: 'END_TURN' });
      }
      if (state.player && state.screen === 'battle') state.player.hp = state.player.maxHp;
    }
    return state;
  }

  it('taming the last enemy removes its unit from the map and ends the battle', async () => {
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    exp.x = spot.x;
    exp.y = spot.y;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('battle');
    state.battle!.enemies = [state.battle!.enemies[0]];
    state = await tameFirstEnemy(state);
    expect([...state.party, ...state.stable].some((m) => m.isTamed)).toBe(true);
    expect(state.battle).toBeNull();
    expect(state.screen).toBe('floor');
    expect(state.expedition!.units).toHaveLength(0); // Paul's bug: unit lingered
  });

  it('taming one of a pack keeps the battle going with the rest', async () => {
    const { MonsterInstance } = await import('../entities/MonsterInstance');
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    exp.x = spot.x;
    exp.y = spot.y;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('battle');
    const packmate = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 3 });
    state.battle!.enemies = [state.battle!.enemies[0], packmate];
    state = await tameFirstEnemy(state);
    // Paul's bug: battle declared over with a full-health enemy standing.
    expect(state.screen).toBe('battle');
    expect(state.battle).not.toBeNull();
    expect(state.battle!.enemies.some((e) => e.isAlive())).toBe(true);
  });

  it('a tamed legend keeps its given name', async () => {
    const { MonsterInstance } = await import('../entities/MonsterInstance');
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [testUnit('enemy', spot.x + 1, spot.y)];
    exp.x = spot.x;
    exp.y = spot.y;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    const legend = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 3, rarity: 'Rare', nickname: 'Vhalgrim' });
    state.battle!.enemies = [legend];
    state = await tameFirstEnemy(state);
    const kept = [...state.party, ...state.stable].find((m) => m.uid === legend.uid);
    expect(kept).toBeDefined();
    expect(kept!.nickname).toBe('Vhalgrim');
    expect(kept!.rarity).toBe('Rare');
  });
});

describe('v7: tamer gating & loyalty', () => {
  it('no rival tamers spawn until the player has tamed something', () => {
    const state = createHero();
    const tFloor = GATES.verdant.floors.findIndex((f) => f.grid.some((r) => r.includes('t')));
    if (tFloor === -1) return;
    for (let i = 0; i < 30; i++) {
      const units = spawnFloorUnits(GATES.verdant.floors[tFloor], 'verdant', state.world, state.chronicle, false);
      expect(units.some((u) => u.kind === 'tamer')).toBe(false);
    }
    let seen = false;
    for (let i = 0; i < 40 && !seen; i++) {
      seen = spawnFloorUnits(GATES.verdant.floors[tFloor], 'verdant', state.world, state.chronicle, true).some((u) => u.kind === 'tamer');
    }
    expect(seen).toBe(true);
  });

  it("a tamer's bonded beasts carry a loyalty penalty to taming", () => {
    let state = enterVerdant(createHero());
    const spot = openPair(state);
    const exp = state.expedition!;
    exp.units = [testUnit('tamer', spot.x + 1, spot.y)];
    exp.x = spot.x;
    exp.y = spot.y;
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('battle');
    for (const e of state.battle!.enemies) {
      expect(e.tameBonus).toBe(-30); // Warrior has no charm affinity
    }
  });
});
