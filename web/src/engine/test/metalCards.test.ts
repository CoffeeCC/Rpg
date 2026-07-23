import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import { startBattle, endTurn, playCard } from '../systems/cardBattle';
import { CARDS, REWARD_POOLS } from '../data/cards';
import { CARD_ART } from '../../art/cardArt';

const METAL_CARD_IDS = [
  'everythingWentBlack',
  'aViciousReformingOfFeatures',
  'cursingAkhenaten',
  'itsNotSafeToSwimToday',
  'whenLifeMeantMore',
  'aspiration',
] as const;

function setup() {
  const hero = new Character('T', 'Human', 'Warrior');
  const enemy = MonsterInstance.createWild({ families: ['Slime'], tierMin: 1, tierMax: 1, levelBonus: 0 });
  enemy.hp = enemy.maxHp = 500; // roomy HP so multi-turn Encroach/Fated tests don't kill it early
  const battle = startBattle(hero, [], [enemy], { isBossFight: false, gateId: null, expeditionExtras: [] });
  battle.energy = 99; // never run short mid-test
  return { hero, enemy, battle };
}

/** Injects the card straight into hand (these are reward-pool cards, never in a starter deck) and plays it. */
function playById(hero: Character, battle: ReturnType<typeof startBattle>, id: string, targetUid?: string) {
  battle.hand.push({ uid: `${id}-test`, cardId: id });
  return playCard(hero, [], battle, battle.hand.length - 1, targetUid);
}

describe('metal-song cards: art', () => {
  it('every card exists in CARDS with the expected rarity and is in its reward pool', () => {
    for (const id of METAL_CARD_IDS) {
      const card = CARDS[id];
      expect(card, `${id} exists`).toBeDefined();
      const pool = REWARD_POOLS[card.rarity as 'common' | 'uncommon' | 'rare'];
      expect(pool, `${id} rarity ${card.rarity} has a pool`).toBeDefined();
      expect(pool.includes(id), `${id} is listed in the ${card.rarity} reward pool`).toBe(true);
    }
  });

  it('every card has real CARD_ART (not just its emoji fallback)', () => {
    for (const id of METAL_CARD_IDS) {
      expect(CARD_ART[id], `${id} has a CARD_ART entry`).toBeDefined();
      expect(CARD_ART[id], `${id} art path`).toMatch(/^art\/cards\/.+\.jpg$/);
    }
  });
});

describe('metal-song cards: actually playable', () => {
  it('Everything Went Black deals Dark damage and afflicts Encroach', () => {
    const { hero, enemy, battle } = setup();
    const hp0 = enemy.hp;
    const r = playById(hero, battle, 'everythingWentBlack');
    expect(r.outcome).not.toBe('victory'); // shouldn't crash the resolver
    expect(enemy.hp).toBeLessThan(hp0);
    expect(enemy.hasStatus('Encroach')).toBe(true);
  });

  it('Encroach compounds each turn instead of decaying', () => {
    const { hero, enemy, battle } = setup();
    playById(hero, battle, 'everythingWentBlack');
    battle.intents[enemy.uid] = { kind: 'defend', amount: 1 };
    const afterCast = enemy.hp;
    endTurn(hero, [], battle);
    const tick1Damage = afterCast - enemy.hp;
    expect(tick1Damage).toBeGreaterThan(0);
    battle.intents[enemy.uid] = { kind: 'defend', amount: 1 };
    endTurn(hero, [], battle);
    const tick2Damage = afterCast - tick1Damage - enemy.hp;
    expect(tick2Damage).toBeGreaterThan(tick1Damage); // grows, doesn't stay flat
    expect(enemy.hasStatus('Encroach')).toBe(true); // still hasn't decayed off
  });

  it("A Vicious Reforming of Features costs HP and grants STR+DEF to the hero", () => {
    const { hero, battle } = setup();
    const hp0 = hero.hp;
    const strMods0 = hero.activeMods.filter((m) => m.stat === 'STR').length;
    playById(hero, battle, 'aViciousReformingOfFeatures');
    expect(hero.hp).toBeLessThan(hp0); // paid the selfDamage cost
    expect(hero.activeMods.some((m) => m.stat === 'STR' && m.amount === 4)).toBe(true);
    expect(hero.activeMods.some((m) => m.stat === 'DEF' && m.amount === 4)).toBe(true);
    expect(hero.activeMods.filter((m) => m.stat === 'STR').length).toBeGreaterThan(strMods0);
  });

  it('Cursing Akhenaten marks the enemy with Fated, which detonates on expiry', () => {
    const { hero, enemy, battle } = setup();
    playById(hero, battle, 'cursingAkhenaten');
    expect(enemy.hasStatus('Fated')).toBe(true);
    battle.intents[enemy.uid] = { kind: 'defend', amount: 1 };
    endTurn(hero, [], battle); // turns: 3 -> 2
    endTurn(hero, [], battle); // 2 -> 1
    const beforeDetonation = enemy.hp;
    battle.intents[enemy.uid] = { kind: 'defend', amount: 1 };
    endTurn(hero, [], battle); // 1 -> detonates
    expect(enemy.hp).toBeLessThan(beforeDetonation);
    expect(beforeDetonation - enemy.hp).toBeGreaterThan(20); // a real burst, not a chip tick
    expect(enemy.hasStatus('Fated')).toBe(false); // consumed on detonation
  });

  it("It's Not Safe to Swim Today hits the enemy hard and the hero pays a little back", () => {
    const { hero, enemy, battle } = setup();
    const heroHp0 = hero.hp;
    const enemyHp0 = enemy.hp;
    playById(hero, battle, 'itsNotSafeToSwimToday');
    expect(enemy.hp).toBeLessThan(enemyHp0);
    expect(hero.hp).toBeLessThan(heroHp0);
  });

  it('When Life Meant More deals more damage per card already exhausted this battle', () => {
    const { hero, enemy, battle } = setup();
    const enemyHp0 = enemy.hp;
    playById(hero, battle, 'whenLifeMeantMore');
    const baselineDamage = enemyHp0 - enemy.hp;

    const { hero: hero2, enemy: enemy2, battle: battle2 } = setup();
    battle2.exhaustPile.push({ uid: 'x1', cardId: 'strike' }, { uid: 'x2', cardId: 'strike' }, { uid: 'x3', cardId: 'strike' });
    const enemy2Hp0 = enemy2.hp;
    playById(hero2, battle2, 'whenLifeMeantMore');
    const boostedDamage = enemy2Hp0 - enemy2.hp;

    expect(boostedDamage).toBeGreaterThan(baselineDamage);
  });

  it('Aspiration grants a long-lasting STR and INT buff to the hero', () => {
    const { hero, battle } = setup();
    playById(hero, battle, 'aspiration');
    const strMod = hero.activeMods.find((m) => m.stat === 'STR');
    const intMod = hero.activeMods.find((m) => m.stat === 'INT');
    expect(strMod?.amount).toBe(3);
    expect(strMod?.turns).toBe(6);
    expect(intMod?.amount).toBe(3);
    expect(intMod?.turns).toBe(6);
  });
});
