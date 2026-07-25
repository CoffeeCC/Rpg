import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import {
  startBattle,
  endTurn,
  playCard,
  rollAllIntents,
  heroMitigation,
  monsterMitigation,
  effectAmount,
  elementMult,
  type BattleState,
} from '../systems/cardBattle';
import { cardEffectSchool, intentSchool, moveElement, skillSchool, MOVE_ELEMENTS } from '../data/damageTypes';
import { BOSS_KITS, ELITE_KIT, FAMILY_KITS, type EnemyKit } from '../data/enemyAi';
import { CARDS, getCard } from '../data/cards';
import { SKILLS, getSkill } from '../data/skills';
import { FAMILY_INFO } from '../data/species';
import { BALANCE } from '../data/balance';
import { attributeBreakdown, magicDefenseBreakdown, mitigationLines } from '../statBreakdown';
import type { Intent, Stat } from '../types';

// ---------------------------------------------------------------------------
// MAGDEF was an inert stat: every mitigation path in cardBattle subtracted
// getDefense() no matter what kind of damage was landing, while races, gear,
// uniques, artifacts, EV training and attribute points all fed a number
// nothing ever read.
//
// These tests hold the fix to two claims:
//   1. the stat is LIVE — two heroes differing only in MAGDEF take different
//      damage from the same magical blow, and identical damage from the same
//      physical one;
//   2. the stat is HONEST — the number telegraphed to the player is computed
//      with the same wall the resolver will actually subtract, and player-side
//      magic is not double-dipped against family resistance.
// ---------------------------------------------------------------------------

const BATTLE_OPTS = { isBossFight: false, gateId: null, expeditionExtras: [] as string[] };

/** MonsterInstance rolls a random personality, whose growth multipliers move
 *  DEF/MAGDEF. Pin it wherever two monsters must be identical. */
const FIXED_PERSONALITY = 'valiant';

function hero(bonus: Partial<Record<Stat, number>> = {}, level = 1): Character {
  const h = new Character('Subject', 'Human', 'Warrior');
  while (h.level < level) {
    h.gainExp(h.expToNext());
    h.attributePoints = 0; // spend nothing: keep every build identical but for `bonus`
  }
  for (const [stat, amount] of Object.entries(bonus)) h.stats[stat as Stat] += amount as number;
  h.recomputeDerived();
  h.hp = h.maxHp;
  return h;
}

/**
 * Pin an enemy to one specific kit move by putting every OTHER move of its kit
 * on a long cooldown, then rolling intents through the real public path. This
 * exercises `rollKitIntent` -> `intentFromMove` exactly as a live battle does,
 * with no randomness left in the outcome.
 */
function forceIntent(battle: BattleState, h: Character, enemy: MonsterInstance, kit: EnemyKit, moveId: string): Intent {
  const cds: Record<string, number> = {};
  for (const move of kit.moves) if (move.id !== moveId) cds[move.id] = 99;
  battle.moveCooldowns = { [enemy.uid]: cds };
  battle.movesUsed = {};
  rollAllIntents(battle, h);
  return battle.intents[enemy.uid];
}

function telegraph(h: Character, enemy: MonsterInstance, moveId: string, party: MonsterInstance[] = []): Intent {
  const battle = startBattle(h, party, [enemy], BATTLE_OPTS);
  return forceIntent(battle, h, enemy, FAMILY_KITS[enemy.family], moveId);
}

// A dragon: "Claws Out" is muscle, "Stoking the Flame" is fire.
const PHYSICAL_MOVE = 'dragon_claws';
const MAGICAL_MOVE = 'dragon_breath';

describe('MAGDEF is a live stat', () => {
  it('two heroes differing only in MAGDEF take different damage from the same magical blow', () => {
    const enemy = new MonsterInstance({ speciesId: 'emberwhelp', level: 8 });
    const plain = hero();
    const warded = hero({ MAGDEF: 20 });

    expect(warded.getDefense()).toBe(plain.getDefense()); // the only difference is MAGDEF
    expect(warded.getMagicDefense()).toBe(plain.getMagicDefense() + 20);

    const plainHit = telegraph(plain, enemy, MAGICAL_MOVE).amount!;
    const wardedHit = telegraph(warded, enemy, MAGICAL_MOVE).amount!;

    expect(wardedHit).toBeLessThan(plainHit);
    // Exactly the sanctioned coefficient, not an accident of rounding.
    expect(plainHit - wardedHit).toBe(Math.round(20 * BALANCE.intentMagicDefMitigation));
  });

  it('...and identical damage from the same physical blow', () => {
    const enemy = new MonsterInstance({ speciesId: 'emberwhelp', level: 8 });
    const plain = hero();
    const warded = hero({ MAGDEF: 20 });
    expect(telegraph(warded, enemy, PHYSICAL_MOVE).amount).toBe(telegraph(plain, enemy, PHYSICAL_MOVE).amount);
  });

  it('DEF is the mirror image: it moves physical damage and leaves magic alone', () => {
    const enemy = new MonsterInstance({ speciesId: 'emberwhelp', level: 8 });
    const plain = hero();
    const armoured = hero({ DEF: 20 });

    const physPlain = telegraph(plain, enemy, PHYSICAL_MOVE).amount!;
    const physArmoured = telegraph(armoured, enemy, PHYSICAL_MOVE).amount!;
    expect(physPlain - physArmoured).toBe(Math.round(20 * BALANCE.intentDefMitigation));

    // Armour still counts at half weight inside getMagicDefense, but raising the
    // DEF *stat* adds nothing there — so magic is untouched.
    expect(telegraph(armoured, enemy, MAGICAL_MOVE).amount).toBe(telegraph(plain, enemy, MAGICAL_MOVE).amount);
  });

  it('a party monster reads its own MAGDEF when it soaks a magical blow', () => {
    const enemy = new MonsterInstance({ speciesId: 'emberwhelp', level: 8 });
    const run = (magdefBonus: number, moveId: string) => {
      const h = hero({}, 12);
      const pet = new MonsterInstance({ speciesId: 'goober', level: 20, personalityId: FIXED_PERSONALITY });
      if (magdefBonus) pet.addMod({ stat: 'MAGDEF', amount: magdefBonus, turns: 99 });
      const battle = startBattle(h, [pet], [enemy], BATTLE_OPTS);
      forceIntent(battle, h, enemy, FAMILY_KITS[enemy.family], moveId);
      const before = pet.hp;
      endTurn(h, [pet], battle);
      return before - pet.hp;
    };
    // The magical blow also applies Burned, which ticks in the same endTurn —
    // so compare like with like rather than against a raw intent number.
    expect(run(40, MAGICAL_MOVE)).toBeLessThan(run(0, MAGICAL_MOVE));
    expect(run(40, PHYSICAL_MOVE)).toBe(run(0, PHYSICAL_MOVE));
  });

  it('monsterMitigation applies the party-monster coefficients', () => {
    const pet = new MonsterInstance({ speciesId: 'goober', level: 10 });
    expect(monsterMitigation(pet, 'physical')).toBeCloseTo(pet.getDefense() * BALANCE.monsterDefFactor);
    expect(monsterMitigation(pet, 'magical')).toBeCloseTo(pet.getMagicDefense() * BALANCE.monsterMagicDefFactor);
  });
});

describe('the telegraph does not lie', () => {
  it('a magical intent deals exactly what it announced', () => {
    // "Cursed Bargain" is a Dark heavy that carries no status, so the hit is
    // the only thing that touches the hero this turn.
    const h = hero({ MAGDEF: 15 }, 14);
    const enemy = new MonsterInstance({ speciesId: 'impling', level: 4 });
    const battle = startBattle(h, [], [enemy], BATTLE_OPTS);
    const intent = forceIntent(battle, h, enemy, FAMILY_KITS.Devil, 'devil_bargain');
    expect(intentSchool(intent, getSkill)).toBe('magical');

    battle.heroBlock = 0;
    const before = h.hp;
    endTurn(h, [], battle);
    expect(before - h.hp).toBe(intent.amount);
  });

  it('a physical intent deals exactly what it announced', () => {
    const h = hero({ MAGDEF: 15 }, 14);
    const enemy = new MonsterInstance({ speciesId: 'impling', level: 4 });
    const battle = startBattle(h, [], [enemy], BATTLE_OPTS);
    const intent = forceIntent(battle, h, enemy, FAMILY_KITS.Devil, 'devil_claw');
    expect(intentSchool(intent, getSkill)).toBe('physical');

    battle.heroBlock = 0;
    const before = h.hp;
    endTurn(h, [], battle);
    expect(before - h.hp).toBe(intent.amount);
  });

  it('the school recovered from a telegraphed Intent matches the move it came from, for every family kit move', () => {
    const h = hero({}, 10);
    for (const [family, kit] of Object.entries(FAMILY_KITS)) {
      const enemy = new MonsterInstance({ speciesId: speciesOf(family), level: 8 });
      for (const move of kit.moves) {
        const battle = startBattle(h, [], [enemy], BATTLE_OPTS);
        const intent = forceIntent(battle, h, enemy, kit, move.id);
        expect(intent.moveId, `${family}/${move.id} did not telegraph`).toBe(move.id);
        const expected = moveElement(move) === 'None' ? 'physical' : 'magical';
        expect(intentSchool(intent, getSkill), `${family}/${move.id}`).toBe(expected);
      }
    }
  });
});

/** One species per family, for kit-driven tests. */
function speciesOf(family: string): string {
  const byFamily: Record<string, string> = {
    Slime: 'goober',
    Dragon: 'drakeling',
    Beast: 'fangPup',
    Bird: 'peckerel',
    Plant: 'sproutling',
    Bug: 'skitterling',
    Devil: 'impling',
    Undead: 'shamblebones',
    Material: 'pebblit',
  };
  return byFamily[family] ?? 'goober';
}

describe('what counts as magical', () => {
  it('every id in MOVE_ELEMENTS still names a real move in a real kit', () => {
    const known = new Set<string>();
    for (const kit of [...Object.values(FAMILY_KITS), ...Object.values(BOSS_KITS), ELITE_KIT]) {
      for (const move of kit.moves) known.add(move.id);
    }
    for (const id of Object.keys(MOVE_ELEMENTS)) {
      expect(known.has(id), `MOVE_ELEMENTS lists "${id}", which no kit in data/enemyAi.ts defines any more`).toBe(true);
    }
  });

  it('kit moves default to physical; the flagged ones are magical', () => {
    expect(moveElement({ id: 'dragon_claws' })).toBe('None');
    expect(moveElement({ id: 'beast_jaws' })).toBe('None');
    expect(moveElement({ id: 'material_fist' })).toBe('None');
    expect(moveElement({ id: 'dragon_breath' })).toBe('Fire');
    expect(moveElement({ id: 'sovereign_decree' })).toBe('Dark');
  });

  it('an unflagged move that sets you alight or freezes you is elemental anyway', () => {
    expect(moveElement({ id: 'not_a_real_move', status: { id: 'Burned', target: 'hero', turns: 2 } })).toBe('Fire');
    expect(moveElement({ id: 'not_a_real_move', status: { id: 'Frozen', target: 'hero', turns: 1 } })).toBe('Ice');
    // Poison and stun are not elements — they stay physical.
    expect(moveElement({ id: 'not_a_real_move', status: { id: 'Poisoned', target: 'hero', turns: 2 } })).toBe('None');
    // A self-buff status says nothing about the blow.
    expect(moveElement({ id: 'not_a_real_move', status: { id: 'Burned', target: 'self', turns: 2 } })).toBe('None');
  });

  it('every skill that declares an element, or reads Intellect, is magical — and no other', () => {
    for (const skill of Object.values(SKILLS)) {
      const expected = skill.element !== 'None' || skill.scaling === 'INT' ? 'magical' : 'physical';
      expect(skillSchool(skill), skill.id).toBe(expected);
    }
    // The rule is not vacuous in either direction.
    expect(Object.values(SKILLS).some((s) => skillSchool(s) === 'magical')).toBe(true);
    expect(Object.values(SKILLS).some((s) => skillSchool(s) === 'physical')).toBe(true);
  });

  it('every spell card is magical, and every elementless Strength strike is not', () => {
    let spells = 0;
    let strikes = 0;
    for (const card of Object.values(CARDS)) {
      for (const effect of card.effects) {
        if (effect.kind !== 'damage' && effect.kind !== 'drain' && effect.kind !== 'resolveDamage') continue;
        if (card.type === 'spell') {
          expect(cardEffectSchool(effect, card), card.id).toBe('magical');
          spells++;
        }
        if (card.type === 'strike' && !('element' in effect && effect.element && effect.element !== 'None')) {
          expect(cardEffectSchool(effect, card), card.id).toBe('physical');
          strikes++;
        }
      }
    }
    expect(spells).toBeGreaterThan(10);
    expect(strikes).toBeGreaterThan(10);
  });

  it('a drain that reads Intellect but declares no element is still magic', () => {
    const card = getCard('ferrymansToll')!;
    expect(card.type).toBe('spell');
    const drain = card.effects.find((e) => e.kind === 'drain')!;
    expect('element' in drain).toBe(false);
    expect(cardEffectSchool(drain, card)).toBe('magical');
    // ...and it is magic on the strength of its scaling alone, with no card.
    expect(cardEffectSchool(drain)).toBe('magical');
  });

  it('a bare swing with no move and no skill behind it is physical', () => {
    expect(intentSchool({}, getSkill)).toBe('physical');
    expect(intentSchool({ skillId: 'no-such-skill' }, getSkill)).toBe('physical');
  });
});

describe('element resistance is not double-dipped', () => {
  // A player's spell meets the target's family resistance and NOTHING else.
  // Enemy DEF has never reduced a hero card's damage, so taxing hero spells
  // with enemy MAGDEF would nerf INT builds with no physical counterpart —
  // and stacking MAGDEF on top of a 0.5x resist is exactly the path to
  // "every fire spell into a fire-resistant enemy deals 1".
  const CASTER = hero({ INT: 10 }, 8);

  function fireSpellDamage(target: MonsterInstance, trials: number): Set<number> {
    const seen = new Set<number>();
    for (let t = 0; t < trials; t++) {
      target.hp = target.maxHp;
      const battle = startBattle(CASTER, [], [target], BATTLE_OPTS);
      battle.hand = [{ uid: `probe-${t}`, cardId: 'flameLash' }];
      battle.energy = 9;
      const before = target.hp;
      playCard(CASTER, [], battle, 0, target.uid);
      seen.add(before - target.hp);
    }
    return seen;
  }

  it("a Fire spell into a fire-resistant, heavily-warded target is unchanged by that target's MAGDEF", () => {
    expect(FAMILY_INFO.Dragon.resists.Fire).toBe(0.5); // fire-resistant by family

    const bare = new MonsterInstance({ speciesId: 'frostWyrm', level: 30, personalityId: FIXED_PERSONALITY });
    const warded = new MonsterInstance({ speciesId: 'frostWyrm', level: 30, personalityId: FIXED_PERSONALITY });
    warded.addMod({ stat: 'MAGDEF', amount: 500, turns: 99 });
    expect(warded.getMagicDefense()).toBeGreaterThan(bare.getMagicDefense() + 400);

    // The resolver's only target-side factor is the family resist. Derive the
    // exact expected numbers rather than trusting a sample: the critical roll
    // (the one remaining source of variance) is 1.5x on top, nothing else is.
    const spell = getCard('flameLash')!;
    const effect = spell.effects.find((e) => e.kind === 'damage')!;
    const base = effectAmount(effect, CASTER);
    const expected = Math.max(1, Math.round(base * elementMult(effect, bare)));
    const expectedCrit = Math.max(1, Math.round(base * elementMult(effect, bare) * 1.5));
    expect(expected).toBeGreaterThan(1); // resisted, but emphatically not floored to 1

    for (const [label, target] of [
      ['bare', bare],
      ['warded', warded],
    ] as [string, MonsterInstance][]) {
      const seen = fireSpellDamage(target, 60);
      expect(seen.has(expected), `${label}: never dealt the plain resisted number ${expected}`).toBe(true);
      for (const dealt of seen) {
        expect([expected, expectedCrit], `${label} dealt ${dealt}`).toContain(dealt);
      }
    }
  });
});

describe('the character sheet tells the truth about it', () => {
  it('the mitigation readout is the resolver’s own arithmetic, not a copy of it', () => {
    for (const build of [{}, { MAGDEF: 18 }, { DEF: 18 }] as Partial<Record<Stat, number>>[]) {
      const h = hero(build, 9);
      const lines = mitigationLines(h);
      const physical = lines.find((l) => l.school === 'physical')!;
      const magical = lines.find((l) => l.school === 'magical')!;
      expect(physical.value).toBe(h.getDefense());
      expect(magical.value).toBe(h.getMagicDefense());
      expect(physical.turnsAside).toBe(heroMitigation(h, 'physical'));
      expect(magical.turnsAside).toBe(heroMitigation(h, 'magical'));
    }
  });

  it('the Magic Defense ledger still folds to the engine getter', () => {
    const h = hero({ MAGDEF: 7 }, 6);
    expect(magicDefenseBreakdown(h).total).toBe(h.getMagicDefense());
  });

  it('no longer describes MAGDEF as unspent or unread', () => {
    const h = hero();
    const prose = [
      attributeBreakdown(h, 'MAGDEF').meaning,
      magicDefenseBreakdown(h).meaning,
      magicDefenseBreakdown(h).note ?? '',
    ].join(' ');
    expect(prose).not.toMatch(/unspent|spent nowhere|no system|unread|later reckoning/i);
    expect(prose).toMatch(/magic/i);
  });
});
