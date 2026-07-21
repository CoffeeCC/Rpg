import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import {
  buildDeck,
  startBattle,
  playCard,
  endTurn,
  purgeMonsterCards,
  energyFor,
  collectSpoils,
  type BattleState,
} from '../systems/cardBattle';
import { generateWorld, forgeArtifactItem } from '../systems/worldgen';
import { CARDS, CLASS_DECKS, RACE_CARDS, SPECIES_CARDS, TAME_CARD_ID, getCard } from '../data/cards';
import { SPECIES, speciesMatching } from '../data/species';
import { GATES } from '../data/gates';
import { serializeGameState, deserializeGameState } from '../systems/saveGame';
import { gameReducer, initialGameState, type GameState } from '../game';

function hero(className: 'Warrior' | 'Mage' = 'Warrior'): Character {
  return new Character('Aria', 'Human', className);
}

function wildEnemy(): MonsterInstance {
  return MonsterInstance.createWild({ families: ['Slime'], tierMin: 1, tierMax: 1, levelBonus: 0 });
}

function freshBattle(h: Character, party: MonsterInstance[] = [], enemies?: MonsterInstance[]): BattleState {
  return startBattle(h, party, enemies ?? [wildEnemy()], { isBossFight: false, gateId: 'verdant', expeditionExtras: [] });
}

describe('deck building', () => {
  it('composes class + race + tame card + living party species cards', () => {
    const h = hero();
    const tame = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 5 });
    tame.isTamed = true;
    const deck = buildDeck(h, [tame], []);
    const expectedMin =
      CLASS_DECKS.Warrior.length + RACE_CARDS.Human.length + 1 + (SPECIES_CARDS[tame.speciesId]?.length ?? 0);
    expect(deck.length).toBeGreaterThanOrEqual(expectedMin);
    expect(deck.some((c) => c.cardId === TAME_CARD_ID)).toBe(true);
    expect(deck.some((c) => c.sourceMonsterUid === tame.uid)).toBe(true);
  });

  it('KO monsters contribute no cards; purge removes them mid-battle', () => {
    const h = hero();
    const tame = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 5 });
    tame.isTamed = true;
    tame.takeDamage(tame.maxHp);
    expect(buildDeck(h, [tame], []).some((c) => c.sourceMonsterUid === tame.uid)).toBe(false);

    tame.hp = tame.maxHp;
    const battle = freshBattle(h, [tame]);
    const before = [...battle.drawPile, ...battle.hand].filter((c) => c.sourceMonsterUid === tame.uid).length;
    expect(before).toBeGreaterThan(0);
    purgeMonsterCards(battle, tame.uid);
    const after = [...battle.drawPile, ...battle.hand, ...battle.discardPile].filter((c) => c.sourceMonsterUid === tame.uid).length;
    expect(after).toBe(0);
  });
});

describe('card battle', () => {
  it('starts with a hand, energy, and intents for every living enemy', () => {
    const h = hero();
    const battle = freshBattle(h);
    expect(battle.hand.length).toBeGreaterThan(0);
    expect(battle.energy).toBe(energyFor(h));
    for (const enemy of battle.enemies) {
      expect(battle.intents[enemy.uid]).toBeDefined();
    }
  });

  it('playing a damage card costs energy and hurts the target; battle can be won', () => {
    const h = hero();
    h.stats.STR += 60;
    h.recomputeDerived();
    const enemy = wildEnemy();
    const battle = freshBattle(h, [], [enemy]);
    let outcome = 'ongoing';
    let guard = 0;
    while (outcome === 'ongoing' && guard++ < 60) {
      const idx = battle.hand.findIndex((c) => getCard(c.cardId)?.effects.some((e) => e.kind === 'damage'));
      if (idx === -1 || battle.energy <= 0) {
        const r = endTurn(h, [], battle);
        outcome = r.outcome;
        if (outcome === 'defeat') break;
        continue;
      }
      const before = battle.energy;
      const r = playCard(h, [], battle, idx, enemy.uid);
      expect(battle.energy).toBeLessThanOrEqual(before);
      expect(r.fx.length + r.log.length).toBeGreaterThan(0);
      outcome = r.outcome;
    }
    expect(outcome).toBe('victory');
  });

  it('block absorbs enemy attack damage', () => {
    const h = hero();
    const enemy = wildEnemy();
    const battle = freshBattle(h, [], [enemy]);
    battle.intents[enemy.uid] = { kind: 'attack', amount: 5, times: 1 };
    battle.heroBlock = 100;
    const hpBefore = h.hp;
    // Force the hit onto the hero (no party monsters present).
    const r = endTurn(h, [], battle);
    expect(r.outcome).not.toBe('defeat');
    expect(h.hp).toBe(hpBefore);
  });

  it('tame card can end a battle with a tamed monster', () => {
    const h = hero();
    const enemy = wildEnemy();
    enemy.takeDamage(enemy.maxHp - 1);
    enemy.tameBonus = 500; // clamps to 90%
    const battle = freshBattle(h, [], [enemy]);
    let tamed = false;
    for (let attempt = 0; attempt < 60 && !tamed; attempt++) {
      const idx = battle.hand.findIndex((c) => c.cardId === TAME_CARD_ID);
      if (idx === -1) {
        battle.drawPile.push(...battle.hand.splice(0));
        battle.hand.push({ uid: `t${attempt}`, cardId: TAME_CARD_ID });
      }
      const useIdx = battle.hand.findIndex((c) => c.cardId === TAME_CARD_ID);
      battle.energy = 3;
      const r = playCard(h, [], battle, useIdx, enemy.uid);
      if (r.outcome === 'tamed') {
        tamed = true;
        expect(r.tamed?.isTamed).toBe(true);
      }
    }
    expect(tamed).toBe(true);
  });

  it('spoils grant exp, family training, and possible drops', () => {
    const h = hero();
    const enemy = wildEnemy();
    enemy.takeDamage(enemy.maxHp);
    const battle = freshBattle(h, [], [enemy]);
    const luckBefore = h.stats.LUCK; // Slime trains LUCK
    const spoils = collectSpoils(h, [], battle);
    expect(spoils.expGained).toBeGreaterThan(0);
    expect(h.stats.LUCK).toBe(luckBefore + 1);
  });
});

describe('worldgen (DF-style)', () => {
  it('is deterministic per seed and distinct across seeds', () => {
    const a = generateWorld(1234);
    const b = generateWorld(1234);
    const c = generateWorld(9999);
    expect(a.name).toBe(b.name);
    expect(a.events.map((e) => e.text)).toEqual(b.events.map((e) => e.text));
    expect(a.name === c.name && a.events.length === c.events.length && a.events[0]?.text === c.events[0]?.text).toBe(false);
  });

  it('produces a coherent history: eras, figures, beasts, artifacts, sorted events', () => {
    const world = generateWorld(42);
    expect(world.eras.length).toBeGreaterThanOrEqual(3);
    expect(world.figures.length).toBeGreaterThanOrEqual(14);
    expect(world.beasts.length).toBeGreaterThanOrEqual(4);
    expect(world.artifacts.length).toBeGreaterThanOrEqual(5);
    expect(world.events.length).toBeGreaterThanOrEqual(30);
    for (let i = 1; i < world.events.length; i++) {
      expect(world.events[i].year).toBeGreaterThanOrEqual(world.events[i - 1].year);
    }
    for (const event of world.events) {
      expect(event.text).not.toMatch(/\{\w+\}/); // all slots filled
    }
    for (const beast of world.beasts) {
      expect(SPECIES[beast.speciesId]).toBeDefined();
      expect(GATES[beast.gateId]).toBeDefined();
      expect(beast.legend.length).toBeGreaterThan(0);
    }
    for (const artifact of world.artifacts) {
      expect(artifact.floorIndex).toBeLessThan(GATES[artifact.gateId].floors.length);
      const item = forgeArtifactItem(artifact);
      expect(item.rarity).toBe('Legendary');
      expect(item.name).toBe(artifact.name);
    }
  });
});

describe('reducer v4', () => {
  function createHero(): GameState {
    let state = gameReducer(initialGameState(), { type: 'CREATE_CHARACTER', name: 'Aria', race: 'Human', className: 'Warrior' });
    state = gameReducer(state, { type: 'STORY_CONTINUE' });
    return state;
  }

  function enterGate(state: GameState): GameState {
    state = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
    return gameReducer(state, { type: 'ENTER_GATE', gateId: 'verdant' });
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

  it('creates a world with the character and lands in town', () => {
    const state = createHero();
    expect(state.world).not.toBeNull();
    expect(state.world!.beasts.length).toBeGreaterThan(0);
    expect(state.screen).toBe('town');
  });

  it('a full battle loop through the reducer reaches victory/reward or defeat', () => {
    let state = enterGate(createHero());
    state.player!.stats.STR += 80;
    state.player!.recomputeDerived();
    state = engageUnit(state);
    if (state.pendingLegend) state = gameReducer(state, { type: 'LEGEND_SEEN' });
    expect(state.screen).toBe('battle');

    let guard = 0;
    while (state.screen === 'battle' && guard++ < 200) {
      const battle = state.battle!;
      const target = battle.enemies.find((e) => e.isAlive());
      const idx = battle.hand.findIndex((c) => {
        const card = getCard(c.cardId);
        return card && card.cost <= battle.energy && card.effects.some((e) => e.kind === 'damage');
      });
      if (idx >= 0 && target) {
        state = gameReducer(state, { type: 'PLAY_CARD', handIndex: idx, targetUid: target.uid });
      } else {
        state = gameReducer(state, { type: 'END_TURN' });
      }
      if (state.player && state.screen === 'battle') state.player.hp = state.player.maxHp;
    }
    // v6: ordinary victories return you to the floor with NO card Boon.
    expect(['floor', 'town', 'cardReward']).toContain(state.screen);
    if (state.battle === null && state.screen === 'floor') {
      expect(state.pendingReward).toBeNull();
    }
  });

  it('v6: minibosses grant a card Boon; ordinary units never do', () => {
    let state = enterGate(createHero());
    state.player!.stats.STR += 300;
    state.player!.recomputeDerived();
    const exp = state.expedition!;
    // Inject a synthetic miniboss so the test is map-independent.
    exp.units = [
      {
        id: 'test-mini',
        kind: 'miniboss',
        x: exp.x,
        y: exp.y,
        label: 'The Nameless Warden',
        speciesId: Object.keys(SPECIES)[0],
        level: 2,
        mov: 2,
      },
    ];
    const floor = GATES.verdant.floors[0];
    outer: for (let y = 1; y < floor.grid.length - 1; y++) {
      for (let x = 1; x < floor.grid[y].length - 1; x++) {
        if (floor.grid[y][x] !== '#' && floor.grid[y][x + 1] && floor.grid[y][x + 1] !== '#') {
          exp.units[0].x = x + 1;
          exp.units[0].y = y;
          exp.x = x;
          exp.y = y;
          break outer;
        }
      }
    }
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('battle');
    expect(state.battle!.unitKind).toBe('miniboss');
    let guard = 0;
    while (state.screen === 'battle' && guard++ < 200) {
      const battle = state.battle!;
      const target = battle.enemies.find((e) => e.isAlive());
      const idx = battle.hand.findIndex((c) => {
        const card = getCard(c.cardId);
        return card && card.cost <= battle.energy && card.effects.some((e) => e.kind === 'damage');
      });
      if (idx >= 0 && target) state = gameReducer(state, { type: 'PLAY_CARD', handIndex: idx, targetUid: target.uid });
      else state = gameReducer(state, { type: 'END_TURN' });
      if (state.player && state.screen === 'battle') state.player.hp = state.player.maxHp;
    }
    expect(state.screen).toBe('cardReward');
    expect(state.pendingReward).toHaveLength(state.player!.traits.rewardChoices);
    expect(state.expedition!.minibossDown).toBe(true);
    expect(state.expedition!.units).toHaveLength(0);
    const pick = state.pendingReward![0];
    state = gameReducer(state, { type: 'CHOOSE_REWARD', cardId: pick });
    expect(state.expeditionExtras).toContain(pick);
  });

  it('leaving a gate burns a Waybrand and clears expedition reward cards', () => {
    let state = enterGate(createHero());
    state.expeditionExtras.push('strike');
    // v11: no free teleports — without a Waybrand you stay put.
    state = gameReducer(state, { type: 'LEAVE_GATE' });
    expect(state.screen).toBe('floor');
    state.player!.addConsumable('Waybrand');
    state = gameReducer(state, { type: 'LEAVE_GATE' });
    expect(state.screen).toBe('town');
    expect(state.expeditionExtras).toHaveLength(0);
    expect(state.player!.inventory.includes('Waybrand')).toBe(false);
  });

  it('tavern talk produces dialogue, with rumor slots filled from the world', () => {
    let state = createHero();
    state = gameReducer(state, { type: 'GOTO', screen: 'tavern' });
    for (let i = 0; i < 20; i++) {
      state = gameReducer(state, { type: 'TALK', npcId: 'dovey' });
      expect(state.lastTalk).not.toBeNull();
      expect(state.lastTalk!.text).not.toMatch(/\{\w+\}/);
    }
  });

  it('is pure under double invocation (StrictMode)', () => {
    const state = createHero();
    const goldBefore = state.player!.gold;
    const a = gameReducer(state, { type: 'REST' });
    const b = gameReducer(state, { type: 'REST' });
    expect(state.player!.gold).toBe(goldBefore);
    expect(a.player!.hp).toBe(a.player!.maxHp);
    expect(b.player!.hp).toBe(b.player!.maxHp);
  });

  it('save v3 round-trips world, chronicle, and party; rejects old versions', () => {
    let state = createHero();
    const tame = new MonsterInstance({ speciesId: Object.keys(SPECIES)[0], level: 6 });
    tame.isTamed = true;
    state.party.push(tame);
    state.chronicle.artifactsFound.push('artifact-0');
    const data = serializeGameState(state);
    expect(data).not.toBeNull();
    const restored = deserializeGameState(data!);
    expect(restored.world?.name).toBe(state.world?.name);
    expect(restored.chronicle.artifactsFound).toContain('artifact-0');
    expect(restored.party[0].isAlive()).toBe(true);
    expect(() => deserializeGameState({ version: 2, savedAt: '', state: {} })).toThrow(/older age/);
  });

  it('v6: a famous beast walks the map as a miniboss; slaying it writes the Chronicle', () => {
    let state = enterGate(createHero());
    const beast = state.world!.beasts.find((b) => b.gateId === 'verdant');
    if (!beast) return; // world rolled no verdant beast; acceptable
    state.player!.stats.STR += 300;
    state.player!.recomputeDerived();
    const exp = state.expedition!;
    exp.units = [
      {
        id: 'test-beast',
        kind: 'miniboss',
        x: 0,
        y: 0,
        label: `${beast.name}, ${beast.epithet}`,
        speciesId: beast.speciesId,
        level: 3,
        famousBeastId: beast.id,
        mov: 2,
      },
    ];
    const floor = GATES.verdant.floors[0];
    outer: for (let y = 1; y < floor.grid.length - 1; y++) {
      for (let x = 1; x < floor.grid[y].length - 1; x++) {
        if (floor.grid[y][x] !== '#' && floor.grid[y][x + 1] && floor.grid[y][x + 1] !== '#') {
          exp.units[0].x = x + 1;
          exp.units[0].y = y;
          exp.x = x;
          exp.y = y;
          break outer;
        }
      }
    }
    exp.movLeft = 99;
    state = gameReducer(state, { type: 'MOVE', dir: 'east' });
    expect(state.screen).toBe('battle');
    expect(state.battle!.famousBeastId).toBe(beast.id);
    expect(state.pendingLegend).toEqual({ kind: 'beast', beastId: beast.id });
    state = gameReducer(state, { type: 'LEGEND_SEEN' });
    let guard = 0;
    while (state.screen === 'battle' && guard++ < 200) {
      const battle = state.battle!;
      const target = battle.enemies.find((e) => e.isAlive());
      const idx = battle.hand.findIndex((c) => {
        const card = getCard(c.cardId);
        return card && card.cost <= battle.energy && card.effects.some((e) => e.kind === 'damage');
      });
      if (idx >= 0 && target) state = gameReducer(state, { type: 'PLAY_CARD', handIndex: idx, targetUid: target.uid });
      else state = gameReducer(state, { type: 'END_TURN' });
      if (state.player && state.screen === 'battle') state.player.hp = state.player.maxHp;
    }
    expect(state.chronicle.beastsSlain).toContain(beast.id);
    expect(state.chronicle.deeds.some((d) => d.text.includes(beast.name))).toBe(true);
  });
});

describe('cards data (stub or final)', () => {
  it('every class deck, race pool, and species pool reference real cards', () => {
    for (const ids of Object.values(CLASS_DECKS)) for (const id of ids) expect(CARDS[id], id).toBeDefined();
    for (const ids of Object.values(RACE_CARDS)) for (const id of ids) expect(CARDS[id], id).toBeDefined();
    for (const speciesId of Object.keys(SPECIES)) {
      const ids = SPECIES_CARDS[speciesId];
      expect(ids, speciesId).toBeDefined();
      for (const id of ids) expect(CARDS[id], id).toBeDefined();
    }
    expect(CARDS[TAME_CARD_ID].effects.some((e) => e.kind === 'tame')).toBe(true);
  });

  it('speciesMatching still backs beast generation for all gates', () => {
    for (const gate of Object.values(GATES)) {
      const top = gate.floors[gate.floors.length - 1];
      expect(speciesMatching(top.spawn.families, Math.max(2, top.spawn.tierMin), 5).length).toBeGreaterThan(0);
    }
  });
});
