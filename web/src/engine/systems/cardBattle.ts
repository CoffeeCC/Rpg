import type { CardDef, CardEffect, CardInstance, CardScaling, FxEvent, GateId, Intent, ItemV2, Stat, StatusName } from '../types';
import { Character } from '../entities/Character';
import { MonsterInstance, freshUid } from '../entities/MonsterInstance';
import { CLASS_DECKS, RACE_CARDS, SPECIES_CARDS, TAME_CARD_ID, getCard } from '../data/cards';
import { getSkill } from '../data/skills';
import { FAMILY_INFO } from '../data/species';
import { CONSUMABLES } from '../data/items';
import { BALANCE } from '../data/balance';
import { talentsFor } from '../data/traits';
import { generateItem } from './lootGen';
import { randInt } from '../random';
import { INSTINCT_MP_COST, bondPowerMult } from '../data/personalities';
import { FAMILY_KITS, BOSS_KITS, ELITE_KIT, type EnemyKit, type EnemyMove } from '../data/enemyAi';

export const HAND_SIZE = BALANCE.handSize;
export const MAX_HAND = BALANCE.maxHand;
export const BASE_ENERGY = BALANCE.baseEnergy;

export interface BattleState {
  enemies: MonsterInstance[];
  /** enemyUid -> telegraphed action for its next turn. */
  intents: Record<string, Intent>;
  /** enemyUid -> block gained from a 'defend' intent (absorbed before HP). */
  enemyBlock: Record<string, number>;
  drawPile: CardInstance[];
  hand: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  energy: number;
  maxEnergy: number;
  heroBlock: number;
  turn: number;
  isBossFight: boolean;
  gateId: GateId | null;
  /** Set when one of the enemies is a generated famous beast. */
  famousBeastId?: string;
  /** Warrior trait: first strike-type card this battle was free. */
  freeStrikeUsed?: boolean;
  /** First Light talent: first card this battle was free. */
  firstCardUsed?: boolean;
  /** v6: the floor unit this battle came from, if any. */
  unitId?: string;
  unitKind?: 'enemy' | 'miniboss' | 'tamer';
  /** Set for rival-tamer duels. */
  tamerName?: string;
  /** PLAN5 #55: a beaten monster is begging for its life. */
  mercy?: { uid: string };
  /** v11 kit AI: enemyUid -> moveId -> turns until reusable. */
  moveCooldowns?: Record<string, Record<string, number>>;
  /** v11 kit AI: enemyUid -> moveId -> fired (for once-per-battle moves). */
  movesUsed?: Record<string, Record<string, boolean>>;
}

export interface BattleStepResult {
  outcome: 'ongoing' | 'victory' | 'defeat' | 'fled' | 'tamed';
  log: string[];
  fx: FxEvent[];
  tamed?: MonsterInstance;
}

// ---------------------------------------------------------------------------
// Deck building
// ---------------------------------------------------------------------------

function instance(cardId: string, sourceMonsterUid?: string): CardInstance {
  return { uid: freshUid('card'), cardId, sourceMonsterUid };
}

/** Class base + race signature + tame card + living party monsters' cards + expedition extras. */
export function buildDeck(hero: Character, party: MonsterInstance[], expeditionExtras: string[]): CardInstance[] {
  const deck: CardInstance[] = [];
  const used: Record<string, number> = {};
  const upgraded = (id: string) => {
    used[id] = (used[id] ?? 0) + 1;
    return used[id] <= (hero.upgradedCounts[id] ?? 0) || undefined;
  };
  for (const id of CLASS_DECKS[hero.className]) deck.push({ ...instance(id), upgraded: upgraded(id) });
  for (const id of RACE_CARDS[hero.race]) deck.push({ ...instance(id), upgraded: upgraded(id) });
  deck.push({ ...instance(TAME_CARD_ID), upgraded: upgraded(TAME_CARD_ID) });
  for (const monster of party) {
    if (!monster.isAlive()) continue;
    for (const id of SPECIES_CARDS[monster.speciesId] ?? []) deck.push(instance(id, monster.uid));
  }
  for (const id of expeditionExtras) deck.push({ ...instance(id), upgraded: upgraded(id) });
  return deck.filter((c) => !!getCard(c.cardId));
}

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function draw(battle: BattleState, count: number, fx: FxEvent[]) {
  for (let i = 0; i < count; i++) {
    if (battle.hand.length >= MAX_HAND) return;
    if (battle.drawPile.length === 0) {
      if (battle.discardPile.length === 0) return;
      battle.drawPile = shuffle(battle.discardPile);
      battle.discardPile = [];
    }
    const card = battle.drawPile.pop();
    if (card) battle.hand.push(card);
  }
  void fx;
}

export function energyFor(hero: Character): number {
  return (
    BASE_ENERGY +
    Math.floor(hero.effectiveStat('MANA') / BALANCE.manaPerEnergy) +
    hero.traits.maxVigorBonus +
    talentsFor(hero.level).maxVigor
  );
}

export function handSizeFor(hero: Character): number {
  return Math.max(3, HAND_SIZE + hero.traits.handSizeDelta + talentsFor(hero.level).handSize);
}

// ---------------------------------------------------------------------------
// Numbers (shared by resolver and UI so displayed = dealt)
// ---------------------------------------------------------------------------

function scalingBonus(scaling: CardScaling | undefined, hero: Character, source?: MonsterInstance): number {
  const d = BALANCE.scalingDivisor;
  switch (scaling) {
    case 'STR':
      return Math.floor(hero.getAttack() / d);
    case 'INT':
      return Math.floor(hero.getMagicPower() / d);
    case 'DEF':
      return Math.floor(hero.getDefense() / d);
    case 'MSTR':
      return source ? Math.floor(source.getAttack() / d) : 0;
    case 'MINT':
      return source ? Math.floor(source.getMagicPower() / d) : 0;
    default:
      return 0;
  }
}

export function effectAmount(effect: CardEffect, hero: Character, source?: MonsterInstance, upgraded = false): number {
  if (effect.kind === 'damage' || effect.kind === 'block' || effect.kind === 'heal' || effect.kind === 'drain') {
    let base = effect.amount + scalingBonus(effect.scaling, hero, source);
    if (upgraded) base = base * BALANCE.upgradeMult;
    if (effect.kind === 'damage' || effect.kind === 'drain') base = base * hero.traits.damageMult;
    if (effect.kind === 'heal') base = base * hero.traits.healMult;
    return Math.floor(base);
  }
  return 0;
}

/** Human-readable computed numbers for the card face, e.g. "12×2". */
/** `previewTarget`, when given, folds elemental effectiveness into the shown
 * damage — this is what lets the hand card update its number live as you aim
 * at a specific enemy, rather than always showing the untargeted base value. */
export function cardNumbers(card: CardDef, hero: Character, source?: MonsterInstance, upgraded = false, previewTarget?: MonsterInstance): string[] {
  const parts: string[] = [];
  for (const effect of card.effects) {
    if (effect.kind === 'damage') {
      const base = effectAmount(effect, hero, source, upgraded);
      const n = previewTarget ? Math.max(1, Math.round(base * elementMult(effect, previewTarget))) : base;
      parts.push(effect.times && effect.times > 1 ? `⚔${n}×${effect.times}` : `⚔${n}`);
    } else if (effect.kind === 'block') {
      parts.push(`🛡${effectAmount(effect, hero, source, upgraded)}`);
    } else if (effect.kind === 'heal' || effect.kind === 'drain') {
      parts.push(`♥${effectAmount(effect, hero, source, upgraded)}`);
    } else if (effect.kind === 'draw') {
      parts.push(`🃏${effect.count}`);
    } else if (effect.kind === 'energy') {
      parts.push(`◈${effect.amount}`);
    } else if (effect.kind === 'selfDamage') {
      parts.push(`💀${effect.amount}`);
    } else if (effect.kind === 'resolveDamage') {
      parts.push(`⚔${effect.amount}+${effect.perExhausted}/ex`);
    }
  }
  return parts;
}

/** Whether `previewTarget` is weak/resistant to any damage effect on this
 * card — lets the UI flag the live-updated number instead of just changing
 * silently. Null when there's no preview target or no elemental effect. */
export function cardEffectiveness(card: CardDef, previewTarget?: MonsterInstance): 'boosted' | 'resisted' | null {
  if (!previewTarget) return null;
  for (const effect of card.effects) {
    if (effect.kind === 'damage') {
      const mult = elementMult(effect, previewTarget);
      if (mult > 1) return 'boosted';
      if (mult < 1) return 'resisted';
    }
  }
  return null;
}

const STAT_LABEL: Record<Stat, string> = {
  STR: 'Strength',
  DEF: 'Defense',
  DEX: 'Dexterity',
  MANA: 'Mana',
  MAGDEF: 'Magic Defense',
  INT: 'Intellect',
  LUCK: 'Luck',
};

/** Plain-language glossary for the card-inspect view — "Apply Encroach for
 * 12 turns" means nothing on its own, so spell out what the keyword does. */
const STATUS_DESC: Record<StatusName, string> = {
  Burned: 'deals fire damage at the start of each of its turns',
  Poisoned: 'deals dark damage at the start of each of its turns',
  Stunned: 'skips its next action entirely',
  Frozen: 'takes 25% more damage while it lasts',
  Fated: "does nothing until it expires, then detonates for a heavy burst of damage — it's a delayed strike, not a per-turn one",
  Encroach: "deals dark damage every turn that grows larger each time — it doesn't decay and can't be cleansed",
};

/** One full sentence per effect for the deck screen's card-inspect view (fuller than cardNumbers' glyphs). */
export function describeEffect(effect: CardEffect, hero: Character, source?: MonsterInstance, upgraded = false): string {
  const scalingNote = (scaling?: CardScaling) => (scaling ? ` (scales with ${scaling})` : '');
  switch (effect.kind) {
    case 'damage': {
      const n = effectAmount(effect, hero, source, upgraded);
      const times = effect.times && effect.times > 1 ? ` — ${effect.times}× hits` : '';
      const elem = effect.element && effect.element !== 'None' ? `${effect.element} ` : '';
      return `Deal ${n} ${elem}damage${times}${scalingNote(effect.scaling)}`;
    }
    case 'block':
      return `Gain ${effectAmount(effect, hero, source, upgraded)} Block${scalingNote(effect.scaling)}`;
    case 'heal':
      return `Heal ${effectAmount(effect, hero, source, upgraded)} HP${scalingNote(effect.scaling)}`;
    case 'drain':
      return `Deal ${effectAmount(effect, hero, source, upgraded)} damage, heal for half${scalingNote(effect.scaling)}`;
    case 'status': {
      const chance = effect.chance !== undefined && effect.chance < 1 ? ` (${Math.round(effect.chance * 100)}% chance)` : '';
      return `Apply ${effect.status} for ${effect.turns} turn${effect.turns === 1 ? '' : 's'}${chance} — ${STATUS_DESC[effect.status]}`;
    }
    case 'selfStatus':
      return `Gain ${effect.status} for ${effect.turns} turn${effect.turns === 1 ? '' : 's'} — ${STATUS_DESC[effect.status]}`;
    case 'mod':
      return `${effect.amount >= 0 ? '+' : ''}${effect.amount} ${STAT_LABEL[effect.stat]} for ${effect.turns} turns (${effect.onSelf ? 'self' : 'target'})`;
    case 'draw':
      return `Draw ${effect.count} card${effect.count === 1 ? '' : 's'}`;
    case 'energy':
      return `Gain ${effect.amount} Energy`;
    case 'tame':
      return 'Attempt to tame the target';
    case 'selfDamage':
      return `Take ${effect.amount} damage`;
    case 'resolveDamage':
      return `Deal ${effect.amount} damage, +${effect.perExhausted} for every exhausted card${scalingNote(effect.scaling)}`;
  }
}

export function elementMult(effect: CardEffect, target: MonsterInstance): number {
  if (effect.kind !== 'damage' || !effect.element) return 1;
  return FAMILY_INFO[target.family].resists[effect.element] ?? 1;
}

type DamageFx = 'slash' | 'pierce' | 'fire' | 'frost' | 'bolt' | 'dark' | 'holy' | 'hit';

function elementFx(effect: CardEffect): DamageFx {
  if (effect.kind !== 'damage' || !effect.element || effect.element === 'None') return 'slash';
  const map: Record<Exclude<NonNullable<typeof effect.element>, 'None'>, DamageFx> = {
    Fire: 'fire',
    Ice: 'frost',
    Electric: 'bolt',
    Dark: 'dark',
    Holy: 'holy',
  };
  return map[effect.element];
}

// ---------------------------------------------------------------------------
// Intents
// ---------------------------------------------------------------------------

/** v11: which move kit an enemy fights from. Bosses are matched by their
 * given name (createBoss sets nickname = gate bossName); minibosses and
 * famous beasts share the elite kit; everyone else fights like their family. */
function kitFor(enemy: MonsterInstance, battle: BattleState): EnemyKit | null {
  if (battle.isBossFight && BOSS_KITS[enemy.nickname]) return BOSS_KITS[enemy.nickname];
  if (battle.famousBeastId || battle.unitKind === 'miniboss') return ELITE_KIT;
  return FAMILY_KITS[enemy.family] ?? null;
}

function intentFromMove(move: EnemyMove, enemy: MonsterInstance, hero: Character): Intent {
  const B = BALANCE;
  const base = { label: move.name, moveId: move.id, moveStatus: move.status };
  const atk = (mult: number) => Math.max(1, Math.round(enemy.getAttack() * B.intentBasicMult * mult - hero.getDefense() * B.intentDefMitigation));
  switch (move.kind) {
    case 'attack':
    case 'heavy':
      return { kind: 'attack', amount: atk(move.power), times: 1, ...base };
    case 'multi':
      return { kind: 'attack', amount: atk(move.power), times: move.hits ?? 2, ...base };
    case 'drain':
      return { kind: 'attack', amount: atk(move.power), times: 1, drain: true, ...base };
    case 'guard':
      return { kind: 'defend', amount: 5 + Math.floor(enemy.getDefense() / 2) + Math.round(move.power), ...base };
    case 'buff':
      return { kind: 'howl', ...base };
    case 'debuff':
      return { kind: 'debuff', ...base };
  }
}

/** v11: kit-driven intent roll. Weighted pick among usable moves (cooldowns,
 * once-flags, HP-gated enrages). Bookkeeping happens at roll time — the
 * telegraph binds the choice. Returns null when no kit/move applies. */
function rollKitIntent(enemy: MonsterInstance, hero: Character, battle: BattleState): Intent | null {
  const kit = kitFor(enemy, battle);
  if (!kit || kit.moves.length === 0) return null;
  const cds = ((battle.moveCooldowns ??= {})[enemy.uid] ??= {});
  const used = ((battle.movesUsed ??= {})[enemy.uid] ??= {});
  const hpPct = enemy.hp / enemy.maxHp;
  const usable = kit.moves.filter(
    (m) => (cds[m.id] ?? 0) <= 0 && !(m.once && used[m.id]) && (m.belowHpPct === undefined || hpPct <= m.belowHpPct),
  );
  if (usable.length === 0) return null;
  // Regular mobs stay dangerous: their guard/buff/debuff turns are half as
  // frequent as authored, so fights read normal-but-spiky. Bosses and elites
  // use their kits at full personality.
  const isFamilyMob = !(battle.isBossFight && BOSS_KITS[enemy.nickname]) && !battle.famousBeastId && battle.unitKind !== 'miniboss';
  const weightOf = (m: EnemyMove) =>
    isFamilyMob && (m.kind === 'guard' || m.kind === 'buff' || m.kind === 'debuff') ? Math.max(1, Math.floor(m.weight / 2)) : m.weight;
  const total = usable.reduce((s, m) => s + weightOf(m), 0);
  let r = randInt(total);
  let move = usable[usable.length - 1];
  for (const m of usable) {
    r -= weightOf(m);
    if (r < 0) {
      move = m;
      break;
    }
  }
  if (move.cooldown) cds[move.id] = move.cooldown + 1;
  if (move.once) used[move.id] = true;
  return intentFromMove(move, enemy, hero);
}

function rollIntent(enemy: MonsterInstance, hero: Character): Intent {
  const B = BALANCE;
  const skills = enemy.knownSkills.map((id) => getSkill(id)).filter((s) => !!s);
  const heal = skills.find((s) => s!.kind === 'heal');
  if (heal && enemy.hp < enemy.maxHp * 0.4 && randInt(100) < 45) {
    return { kind: 'heal', amount: Math.round(heal!.power * 2 + enemy.getMagicPower() * 0.6), skillId: heal!.id };
  }
  const roll = randInt(100);
  if (roll < B.defendIntentPct) {
    return { kind: 'defend', amount: 5 + Math.floor(enemy.getDefense() / 2) };
  }
  if (roll < B.defendIntentPct + B.debuffIntentPct) {
    const debuffs = skills.filter((s) => s!.kind === 'debuff');
    if (debuffs.length > 0) return { kind: 'debuff', skillId: debuffs[randInt(debuffs.length)]!.id };
    return { kind: 'howl' }; // buff self
  }
  const offense = skills.filter((s) => s!.kind === 'damage' || s!.kind === 'drain');
  if (offense.length > 0 && randInt(100) < B.skillIntentPct) {
    const skill = offense[randInt(offense.length)]!;
    const raw = skill.power * B.intentSkillPowerMult + (skill.scaling === 'STR' ? enemy.getAttack() : enemy.getMagicPower()) * B.intentSkillStatMult;
    const amount = Math.max(1, Math.round(raw - hero.getDefense() * B.intentDefMitigation));
    return { kind: 'attack', amount, times: 1, skillId: skill.id };
  }
  const swings = randInt(100) < B.doubleSwingPct ? 2 : 1;
  const raw = enemy.getAttack() * (swings === 2 ? B.intentDoubleMult : B.intentBasicMult);
  return { kind: 'attack', amount: Math.max(1, Math.round(raw - hero.getDefense() * B.intentDefMitigation)), times: swings };
}

export function rollAllIntents(battle: BattleState, hero: Character) {
  for (const enemy of battle.enemies) {
    if (!enemy.isAlive()) continue;
    // Tick this enemy's move cooldowns once per intent cycle.
    const cds = battle.moveCooldowns?.[enemy.uid];
    if (cds) for (const id of Object.keys(cds)) cds[id] = Math.max(0, cds[id] - 1);
    battle.intents[enemy.uid] = rollKitIntent(enemy, hero, battle) ?? rollIntent(enemy, hero);
  }
}

// ---------------------------------------------------------------------------
// Battle lifecycle
// ---------------------------------------------------------------------------

export function startBattle(
  hero: Character,
  party: MonsterInstance[],
  enemies: MonsterInstance[],
  opts: { isBossFight: boolean; gateId: GateId | null; expeditionExtras: string[]; famousBeastId?: string }
): BattleState {
  const battle: BattleState = {
    enemies,
    intents: {},
    enemyBlock: {},
    drawPile: shuffle(buildDeck(hero, party, opts.expeditionExtras)),
    hand: [],
    discardPile: [],
    exhaustPile: [],
    energy: energyFor(hero),
    maxEnergy: energyFor(hero),
    heroBlock: 0,
    turn: 1,
    isBossFight: opts.isBossFight,
    gateId: opts.gateId,
    famousBeastId: opts.famousBeastId,
  };
  draw(battle, handSizeFor(hero) + talentsFor(hero.level).firstTurnDraw, []);
  rollAllIntents(battle, hero);
  return battle;
}

function damageEnemy(enemy: MonsterInstance, amount: number, battle: BattleState): number {
  const block = battle.enemyBlock[enemy.uid] ?? 0;
  const absorbed = Math.min(block, amount);
  if (absorbed > 0) battle.enemyBlock[enemy.uid] = block - absorbed;
  return enemy.takeDamage(amount - absorbed);
}

function frozenMult(target: MonsterInstance | Character): number {
  return target.hasStatus('Frozen') ? BALANCE.frozenTakenMult : 1;
}

function critRoll(hero: Character): boolean {
  return randInt(100) < BALANCE.critBase + Math.floor(hero.effectiveStat('LUCK') / BALANCE.critLuckDiv) + talentsFor(hero.level).critBonus;
}

/** Removes a KO'd monster's cards from every pile. */
export function purgeMonsterCards(battle: BattleState, monsterUid: string) {
  const keep = (c: CardInstance) => c.sourceMonsterUid !== monsterUid;
  battle.drawPile = battle.drawPile.filter(keep);
  battle.hand = battle.hand.filter(keep);
  battle.discardPile = battle.discardPile.filter(keep);
  battle.exhaustPile = battle.exhaustPile.filter(keep);
}

export function playCard(
  hero: Character,
  party: MonsterInstance[],
  battle: BattleState,
  handIndex: number,
  targetUid?: string
): BattleStepResult {
  const log: string[] = [];
  const fx: FxEvent[] = [];
  const cardInst = battle.hand[handIndex];
  const card = cardInst ? getCard(cardInst.cardId) : undefined;
  if (!cardInst || !card) return { outcome: 'ongoing', log, fx };
  let cost = card.cost;
  const talents = talentsFor(hero.level);
  const freeByTalent = talents.firstCardFree && !battle.firstCardUsed;
  const freeByOath = hero.traits.firstStrikeFree && !battle.freeStrikeUsed && card.type === 'strike';
  if (freeByTalent || freeByOath) cost = 0;
  if (battle.energy < cost) {
    log.push('Not enough Vigor.');
    return { outcome: 'ongoing', log, fx };
  }

  const source = cardInst.sourceMonsterUid ? party.find((m) => m.uid === cardInst.sourceMonsterUid) : undefined;
  const living = battle.enemies.filter((e) => e.isAlive());
  const explicitTarget = targetUid ? battle.enemies.find((e) => e.uid === targetUid && e.isAlive()) : undefined;

  const resolveTargets = (): MonsterInstance[] => {
    switch (card.target) {
      case 'enemy':
        return explicitTarget ? [explicitTarget] : living.slice(0, 1);
      case 'allEnemies':
        return living;
      case 'randomEnemy':
        return living.length ? [living[randInt(living.length)]] : [];
      default:
        return [];
    }
  };

  battle.energy -= cost;
  if (freeByOath && !freeByTalent) battle.freeStrikeUsed = true;
  battle.firstCardUsed = true;
  battle.hand.splice(handIndex, 1);
  const upgraded = !!cardInst.upgraded;
  // A failed tame does NOT exhaust — Reach Out returns via the discard so a
  // taming run isn't over after one bad roll. (Pile decided after resolution.)
  let tameFailed = false;
  log.push(`${card.name}${upgraded ? '+' : ''}.`);

  for (const effect of card.effects) {
    switch (effect.kind) {
      case 'damage': {
        const times = effect.times ?? 1;
        for (let hit = 0; hit < times; hit++) {
          const targets = resolveTargets();
          for (const target of targets) {
            if (!target.isAlive()) continue;
            const crit = critRoll(hero);
            const amount = Math.max(
              1,
              Math.round(effectAmount(effect, hero, source, upgraded) * elementMult(effect, target) * frozenMult(target) * (crit ? 1.5 : 1))
            );
            const dealt = damageEnemy(target, amount, battle);
            fx.push({ fx: elementFx(effect), targetUid: target.uid, amount: dealt, crit });
            const mult = elementMult(effect, target);
            log.push(`${target.displayName()} suffers ${dealt}.${mult > 1 ? ' It burns bright.' : mult < 1 ? ' It resists.' : ''}`);
            if (!target.isAlive()) {
              fx.push({ fx: 'ko', targetUid: target.uid });
              log.push(`${target.displayName()} is felled.`);
            }
          }
        }
        break;
      }
      case 'block': {
        const amount = effectAmount(effect, hero, source, upgraded);
        battle.heroBlock += amount;
        fx.push({ fx: 'block', targetUid: 'hero', amount });
        break;
      }
      case 'status': {
        for (const target of resolveTargets()) {
          if ((effect.chance ?? 1) >= 1 || Math.random() < (effect.chance ?? 1)) {
            target.applyStatus(effect.status, effect.turns + (upgraded ? 1 : 0));
            fx.push({ fx: 'status', targetUid: target.uid, label: effect.status });
            log.push(`${target.displayName()} is ${effect.status}.`);
          } else {
            // Failed procs get visible feedback (PLAN4: status clarity).
            fx.push({ fx: 'status', targetUid: target.uid, label: 'resisted' });
          }
        }
        break;
      }
      case 'selfStatus': {
        hero.applyStatus(effect.status, effect.turns);
        fx.push({ fx: 'status', targetUid: 'hero', label: effect.status });
        break;
      }
      case 'mod': {
        if (effect.onSelf) {
          hero.addMod({ stat: effect.stat, amount: effect.amount, turns: effect.turns });
          fx.push({ fx: 'status', targetUid: 'hero', label: `${effect.stat}${effect.amount > 0 ? '↑' : '↓'}` });
        } else {
          for (const target of resolveTargets()) {
            target.addMod({ stat: effect.stat, amount: effect.amount, turns: effect.turns });
            fx.push({ fx: 'status', targetUid: target.uid, label: `${effect.stat}${effect.amount > 0 ? '↑' : '↓'}` });
          }
        }
        break;
      }
      case 'draw':
        draw(battle, effect.count, fx);
        break;
      case 'energy':
        battle.energy += effect.amount;
        break;
      case 'heal': {
        // v11: heal cards may be aimed at a party monster (targetUid); default is the hero.
        const allyTarget = targetUid && targetUid !== 'hero' ? party.find((m) => m.uid === targetUid && m.isAlive()) : undefined;
        if (allyTarget) {
          const healed = allyTarget.heal(effectAmount(effect, hero, source, upgraded));
          fx.push({ fx: 'heal', targetUid: allyTarget.uid, amount: healed });
          log.push(`${allyTarget.displayName()} recovers ${healed}.`);
          break;
        }
        const healed = hero.heal(effectAmount(effect, hero, source, upgraded));
        fx.push({ fx: 'heal', targetUid: 'hero', amount: healed });
        log.push(`${hero.name} recovers ${healed}.`);
        break;
      }
      case 'drain': {
        const targets = resolveTargets();
        for (const target of targets) {
          const amount = Math.max(1, Math.round(effectAmount(effect, hero, source, upgraded) * frozenMult(target)));
          const dealt = damageEnemy(target, amount, battle);
          fx.push({ fx: 'dark', targetUid: target.uid, amount: dealt });
          const healed = hero.heal(Math.floor((dealt / 2) * hero.traits.healMult));
          if (healed > 0) fx.push({ fx: 'heal', targetUid: 'hero', amount: healed });
          log.push(`${target.displayName()} is drained for ${dealt}.`);
          if (!target.isAlive()) fx.push({ fx: 'ko', targetUid: target.uid });
        }
        break;
      }
      case 'selfDamage': {
        const dealt = hero.takeDamage(effect.amount);
        fx.push({ fx: 'hit', targetUid: 'hero', amount: dealt });
        log.push(`${hero.name} pays ${dealt} for it.`);
        break;
      }
      case 'resolveDamage': {
        const bonus = effect.perExhausted * battle.exhaustPile.length;
        for (const target of resolveTargets()) {
          if (!target.isAlive()) continue;
          const amount = Math.max(
            1,
            Math.round((effect.amount + scalingBonus(effect.scaling, hero, source) + bonus) * frozenMult(target))
          );
          const dealt = damageEnemy(target, amount, battle);
          fx.push({ fx: 'hit', targetUid: target.uid, amount: dealt });
          log.push(`${target.displayName()} suffers ${dealt}.`);
          if (!target.isAlive()) fx.push({ fx: 'ko', targetUid: target.uid });
        }
        break;
      }
      case 'tame': {
        const target = explicitTarget ?? living[0];
        if (!target) break;
        if (target.isBoss) {
          log.push(`${target.displayName()} is far beyond taming.`);
          fx.push({ fx: 'tameTry', targetUid: target.uid, success: false });
          break;
        }
        const chance = target.tameChancePercent();
        const success = randInt(100) < chance;
        fx.push({ fx: 'tameTry', targetUid: target.uid, success });
        if (success) {
          log.push(`${target.displayName()} yields. Something old and lonely lets go.`);
          target.isTamed = true;
          target.tameBonus = 0;
          target.statusEffects = [];
          target.activeMods = [];
          // Only the tamed creature leaves the field - its packmates fight on.
          battle.enemies = battle.enemies.filter((e) => e.uid !== target.uid);
          delete battle.intents[target.uid];
          delete battle.enemyBlock[target.uid];
          (card.exhaust ? battle.exhaustPile : battle.discardPile).push(cardInst);
          return { outcome: 'tamed', log, fx, tamed: target };
        }
        log.push(`${target.displayName()} refuses. (${chance}%)`);
        tameFailed = true;
        break;
      }
    }
  }

  (card.exhaust && !tameFailed ? battle.exhaustPile : battle.discardPile).push(cardInst);

  if (battle.enemies.every((e) => !e.isAlive())) {
    // PLAN5 #55: rarely, the last blow does not land — the creature submits.
    if (!battle.isBossFight && !battle.tamerName && !battle.mercy && randInt(100) < 7) {
      const supplicant = battle.enemies.find((e) => !e.isBoss);
      if (supplicant) {
        supplicant.hp = 1;
        supplicant.statusEffects = [];
        supplicant.activeMods = [];
        battle.mercy = { uid: supplicant.uid };
        fx.push({ fx: 'status', targetUid: supplicant.uid, label: 'MERCY' });
        log.push(`${supplicant.displayName()} stops fighting. It lowers its head, bares its neck, and waits for what you decide.`);
        return { outcome: 'ongoing', log, fx };
      }
    }
    return { outcome: 'victory', log, fx };
  }
  return { outcome: 'ongoing', log, fx };
}

/** Enemy turn + upkeep. Called by END_TURN. */
export function endTurn(hero: Character, party: MonsterInstance[], battle: BattleState): BattleStepResult {
  const log: string[] = [];
  const fx: FxEvent[] = [];
  // Playtest finding: when the last monster fell mid-turn, the same turn's
  // remaining hits landed full-force on the exposed hero. Brace instead.
  let monsterFellThisTurn = false;

  // Discard hand.
  battle.discardPile.push(...battle.hand);
  battle.hand = [];

  // PLAN5 #48: tamed companions act on their own instincts (fueled by MP).
  for (const ally of party) {
    if (!ally.isAlive() || !ally.isTamed) continue;
    const p = ally.personality;
    if (!p || ally.mp < INSTINCT_MP_COST) continue;
    const living = battle.enemies.filter((e) => e.isAlive());
    if (living.length === 0) break;
    ally.mp -= INSTINCT_MP_COST;
    const power = bondPowerMult(ally.bond);
    const strongest = [...living].sort((a, b) => b.getAttack() - a.getAttack())[0];
    switch (p.instinct) {
      case 'strike':
      case 'maul': {
        const target = p.instinct === 'maul' ? living[randInt(living.length)] : strongest;
        let amount = Math.max(1, Math.round(ally.getAttack() * (p.instinct === 'maul' ? 0.55 : 0.45) * power));
        const blocked = Math.min(battle.enemyBlock[target.uid] ?? 0, amount);
        if (blocked > 0) {
          battle.enemyBlock[target.uid] = (battle.enemyBlock[target.uid] ?? 0) - blocked;
          amount -= blocked;
        }
        target.takeDamage(amount);
        fx.push({ fx: 'hit', targetUid: target.uid, amount });
        log.push(`${ally.nickname} acts on instinct — ${target.displayName()} takes ${amount}.`);
        if (!target.isAlive()) {
          fx.push({ fx: 'ko', targetUid: target.uid });
          log.push(`${target.displayName()} falls to ${ally.nickname}.`);
        }
        break;
      }
      case 'mend': {
        const allies = [hero as { hp: number; maxHp: number }, ...party.filter((m) => m.isAlive())];
        const wounded = allies.sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0];
        const healed = Math.max(1, Math.round(ally.effectiveStat('INT') * 0.5 * power));
        const isHero = wounded === (hero as unknown);
        const before = wounded.hp;
        wounded.hp = Math.min(wounded.maxHp, wounded.hp + healed);
        const gained = wounded.hp - before;
        if (gained > 0) {
          fx.push({ fx: 'heal', targetUid: isHero ? 'hero' : (wounded as MonsterInstance).uid, amount: gained });
          log.push(`${ally.nickname} fusses over ${isHero ? hero.name : (wounded as MonsterInstance).nickname} (+${gained}).`);
        }
        break;
      }
      case 'wardHero':
      case 'cower': {
        const amount = Math.max(1, Math.round(ally.getDefense() * (p.instinct === 'wardHero' ? 0.4 : 0.25) * power));
        battle.heroBlock += amount;
        fx.push({ fx: 'block', targetUid: 'hero', amount });
        log.push(`${ally.nickname} ${p.instinct === 'wardHero' ? 'stands over you' : 'shows you where to hide'} (+${amount} Ward).`);
        break;
      }
      case 'hex': {
        strongest.addMod({ stat: 'STR', amount: -Math.max(1, Math.round(ally.effectiveStat('INT') * 0.2 * power)), turns: 2 });
        fx.push({ fx: 'status', targetUid: strongest.uid, label: 'STR↓' });
        log.push(`${ally.nickname} unpicks ${strongest.displayName()}'s strength.`);
        break;
      }
      case 'rally': {
        hero.addMod({ stat: 'STR', amount: Math.max(1, Math.round(ally.effectiveStat('LUCK') * 0.2 * power)), turns: 2 });
        fx.push({ fx: 'status', targetUid: 'hero', label: 'STR↑' });
        log.push(`${ally.nickname} believes in you, loudly.`);
        break;
      }
      case 'venom': {
        const target = living[randInt(living.length)];
        if (randInt(100) < 60) {
          target.applyStatus('Poisoned', 2);
          fx.push({ fx: 'status', targetUid: target.uid, label: 'Poisoned' });
          log.push(`${ally.nickname}'s bitterness seeps into ${target.displayName()}.`);
        } else {
          fx.push({ fx: 'status', targetUid: target.uid, label: 'resisted' });
        }
        break;
      }
    }
  }
  if (battle.enemies.every((e) => !e.isAlive())) {
    return { outcome: 'victory', log, fx };
  }

  // Enemies act on their telegraphed intents.
  for (const enemy of battle.enemies) {
    if (!enemy.isAlive()) continue;
    const intent = battle.intents[enemy.uid];
    if (!intent) continue;
    if (enemy.hasStatus('Stunned') || enemy.hasStatus('Frozen')) {
      log.push(`${enemy.displayName()} is staggered and does nothing.`);
      continue;
    }
    if (intent.label) log.push(`${enemy.displayName()} — ${intent.label}!`);
    let intentDealt = 0; // v11: total damage this intent, for drain moves
    switch (intent.kind) {
      case 'attack': {
        const times = intent.times ?? 1;
        for (let hit = 0; hit < times; hit++) {
          const livingMonsters = party.filter((m) => m.isAlive());
          // PLAN3: monsters shield the hero and take hits first - unless the
          // hero is an Oathshield Knight, who stands in front of them.
          const protector = hero.traits.protectorHero && hero.isAlive();
          const hitsMonster = !protector && livingMonsters.length > 0;
          if (hitsMonster) {
            const target = livingMonsters[randInt(livingMonsters.length)];
            const amount = Math.max(1, Math.round((intent.amount ?? 1) * frozenMult(target) - target.getDefense() * BALANCE.monsterDefFactor));
            target.takeDamage(amount);
            intentDealt += amount;
            if (intent.moveStatus && intent.moveStatus.target === 'party') {
              target.applyStatus(intent.moveStatus.id as 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen', intent.moveStatus.turns);
              fx.push({ fx: 'status', targetUid: target.uid, label: intent.moveStatus.id });
            }
            fx.push({ fx: 'hit', targetUid: target.uid, amount });
            log.push(`${enemy.displayName()} strikes ${target.displayName()} for ${amount}.`);
            if (!target.isAlive()) {
              monsterFellThisTurn = true;
              fx.push({ fx: 'ko', targetUid: target.uid });
              log.push(`${target.displayName()} falls - and will not rise again. Its cards burn to ash.`);
              purgeMonsterCards(battle, target.uid);
            }
          } else {
            let amount = Math.round((intent.amount ?? 1) * frozenMult(hero));
            const braced = monsterFellThisTurn;
            if (braced) amount = Math.ceil(amount * 0.5);
            const absorbed = Math.min(battle.heroBlock, amount);
            if (absorbed > 0) {
              battle.heroBlock -= absorbed;
              amount -= absorbed;
              fx.push({ fx: 'block', targetUid: 'hero', amount: absorbed });
            }
            if (amount > 0) {
              hero.takeDamage(amount);
              intentDealt += amount;
              fx.push({ fx: 'hit', targetUid: 'hero', amount });
              if (amount >= Math.floor(hero.maxHp * 0.2)) fx.push({ fx: 'shake' });
            }
            if (intent.moveStatus && intent.moveStatus.target === 'hero' && hero.isAlive()) {
              hero.applyStatus(intent.moveStatus.id as 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen', intent.moveStatus.turns);
              fx.push({ fx: 'status', targetUid: 'hero', label: intent.moveStatus.id });
              log.push(`${hero.name} is ${intent.moveStatus.id}.`);
            }
            log.push(
              `${enemy.displayName()} strikes for ${amount + absorbed}${absorbed > 0 ? ` (${absorbed} warded)` : ''}${braced ? ' - you brace behind the loss, halving it' : ''}.`
            );
          }
        }
        // v11 drain moves: the enemy feeds on half the damage it dealt.
        if (intent.drain && intentDealt > 0 && enemy.isAlive()) {
          const healed = enemy.heal(Math.floor(intentDealt / 2));
          if (healed > 0) {
            fx.push({ fx: 'heal', targetUid: enemy.uid, amount: healed });
            log.push(`${enemy.displayName()} feeds on the wound (+${healed}).`);
          }
        }
        break;
      }
      case 'defend': {
        battle.enemyBlock[enemy.uid] = (battle.enemyBlock[enemy.uid] ?? 0) + (intent.amount ?? 5);
        log.push(`${enemy.displayName()} hardens.`);
        break;
      }
      case 'heal': {
        const wounded = battle.enemies.filter((e) => e.isAlive()).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] ?? enemy;
        const healed = wounded.heal(intent.amount ?? 5);
        fx.push({ fx: 'heal', targetUid: wounded.uid, amount: healed });
        log.push(`${wounded.displayName()} recovers ${healed}.`);
        break;
      }
      case 'howl': {
        enemy.addMod({ stat: 'STR', amount: Math.max(1, Math.floor(enemy.stats.STR * 0.25)), turns: 3 });
        fx.push({ fx: 'status', targetUid: enemy.uid, label: 'STR↑' });
        if (intent.moveStatus && intent.moveStatus.target === 'self') {
          // kit buffs can also armor the enemy in a status (e.g. Frozen shell is not a thing — engine statuses are hostile, so self-statuses are rare)
          enemy.applyStatus(intent.moveStatus.id as 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen', intent.moveStatus.turns);
        }
        log.push(intent.label ? `${enemy.displayName()} draws something up from the dark.` : `${enemy.displayName()} howls. The dark answers.`);
        break;
      }
      case 'debuff': {
        // v11 kit debuffs carry their own status payload; legacy skill debuffs still resolve via skillId.
        if (intent.moveStatus && intent.moveStatus.target !== 'self') {
          const livingMonsters = party.filter((m) => m.isAlive());
          if (intent.moveStatus.target === 'party' && livingMonsters.length > 0) {
            const target = livingMonsters[randInt(livingMonsters.length)];
            target.applyStatus(intent.moveStatus.id as 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen', intent.moveStatus.turns);
            fx.push({ fx: 'status', targetUid: target.uid, label: intent.moveStatus.id });
            log.push(`${target.displayName()} is ${intent.moveStatus.id}.`);
          } else {
            hero.applyStatus(intent.moveStatus.id as 'Burned' | 'Poisoned' | 'Stunned' | 'Frozen', intent.moveStatus.turns);
            fx.push({ fx: 'status', targetUid: 'hero', label: intent.moveStatus.id });
            log.push(`${hero.name} is ${intent.moveStatus.id}.`);
          }
          break;
        }
        const skill = intent.skillId ? getSkill(intent.skillId) : undefined;
        if (skill?.modStat && skill.modAmount) {
          hero.addMod({ stat: skill.modStat, amount: -Math.abs(skill.modAmount), turns: skill.modTurns ?? 2 });
          fx.push({ fx: 'status', targetUid: 'hero', label: `${skill.modStat}↓` });
          log.push(`${enemy.displayName()} utters something that lessens you.`);
        } else if (skill?.status) {
          hero.applyStatus(skill.status, skill.statusTurns ?? 2);
          fx.push({ fx: 'status', targetUid: 'hero', label: skill.status });
          log.push(`${hero.name} is ${skill.status}.`);
        }
        break;
      }
    }
    if (!hero.isAlive()) break;
  }

  // Status ticks (dots on everyone, durations down).
  const everyone: (Character | MonsterInstance)[] = [hero, ...party, ...battle.enemies];
  for (const c of everyone) {
    if (!c.isAlive()) continue;
    for (const effect of c.statusEffects) {
      if ((effect.name === 'Burned' || effect.name === 'Poisoned') && c.isAlive()) {
        const pct = effect.name === 'Burned' ? BALANCE.burnPct : BALANCE.poisonPct;
        const dmg = c.takeDamage(Math.max(2, Math.floor(c.maxHp * pct)));
        fx.push({ fx: effect.name === 'Burned' ? 'fire' : 'dark', targetUid: c instanceof Character ? 'hero' : c.uid, amount: dmg });
        log.push(`${c.displayName()} withers for ${dmg} (${effect.name}).`);
      }
      if (effect.name === 'Encroach' && c.isAlive()) {
        const stacks = effect.stacks ?? 1;
        const dmg = c.takeDamage(Math.max(2, Math.floor(c.maxHp * BALANCE.encroachPct * stacks)));
        fx.push({ fx: 'dark', targetUid: c instanceof Character ? 'hero' : c.uid, amount: dmg });
        log.push(`${c.displayName()} is swallowed a little more for ${dmg}.`);
        effect.stacks = stacks + 1;
      }
      if (effect.name === 'Fated' && effect.turns === 1 && c.isAlive()) {
        const dmg = c.takeDamage(Math.max(2, Math.floor(c.maxHp * BALANCE.fatedPct)));
        fx.push({ fx: 'dark', targetUid: c instanceof Character ? 'hero' : c.uid, amount: dmg });
        log.push(`${c.displayName()} is finally judged for ${dmg}.`);
      }
      effect.turns--;
    }
    c.statusEffects = c.statusEffects.filter((s) => s.turns > 0);
    for (const mod of c.activeMods) mod.turns--;
    c.activeMods = c.activeMods.filter((m) => m.turns > 0);
    if (c instanceof MonsterInstance && !c.isAlive() && party.includes(c)) {
      purgeMonsterCards(battle, c.uid);
      fx.push({ fx: 'ko', targetUid: c.uid });
    }
  }

  if (battle.enemies.every((e) => !e.isAlive())) {
    return { outcome: 'victory', log, fx };
  }
  if (!hero.isAlive()) {
    log.push('The light leaves you.');
    return { outcome: 'defeat', log, fx };
  }

  // New player turn.
  battle.turn++;
  log.push(`⸻ turn ${battle.turn} ⸻`);
  if (!hero.traits.wardPersists) battle.heroBlock = 0;
  battle.energy = battle.maxEnergy;
  draw(battle, handSizeFor(hero), fx);
  rollAllIntents(battle, hero);
  return { outcome: 'ongoing', log, fx };
}

/** Consumable use in battle: free action. */
export function useBattleItem(hero: Character, battle: BattleState, itemName: string, targetUid?: string): BattleStepResult {
  const log: string[] = [];
  const fx: FxEvent[] = [];
  const def = CONSUMABLES[itemName];
  if (!def || !hero.removeConsumable(itemName)) return { outcome: 'ongoing', log, fx };
  if (def.effect.type === 'heal') {
    const healed = hero.heal(def.effect.amount);
    fx.push({ fx: 'heal', targetUid: 'hero', amount: healed });
    log.push(`${def.name}. ${hero.name} recovers ${healed}.`);
  } else if (def.effect.type === 'mana') {
    const gained = Math.max(1, Math.floor(def.effect.amount / 15));
    battle.energy += gained;
    log.push(`${def.name}. Vigor +${gained}.`);
  } else if (def.effect.type === 'bait') {
    const target = battle.enemies.find((e) => e.uid === targetUid && e.isAlive()) ?? battle.enemies.find((e) => e.isAlive());
    if (target && !target.isBoss) {
      target.tameBonus += def.effect.tameBonus;
      log.push(`${def.name} offered. ${target.displayName()} watches you differently now (${target.tameChancePercent()}%).`);
    } else {
      log.push('The offering goes untouched.');
    }
  }
  return { outcome: 'ongoing', log, fx };
}

export function attemptFlee(hero: Character, battle: BattleState): boolean {
  if (hero.traits.fleeAlways) return true;
  const avgDex = battle.enemies.reduce((s, e) => s + e.effectiveStat('DEX'), 0) / Math.max(1, battle.enemies.length);
  const chance = Math.max(15, Math.min(92, 55 + (hero.effectiveStat('DEX') - avgDex) * 2));
  return randInt(100) < chance;
}

// ---------------------------------------------------------------------------
// Victory spoils (exp/training/loot) — same economy as before the pivot.
// ---------------------------------------------------------------------------

export interface Spoils {
  log: string[];
  drops: ItemV2[];
  expGained: number;
  trained: Partial<Record<Stat, number>>;
}

export function collectSpoils(hero: Character, party: MonsterInstance[], battle: BattleState): Spoils {
  for (const m of party) if (m.isAlive() && m.isTamed) m.bond++;
  let exp = 0;
  const trained: Partial<Record<Stat, number>> = {};
  const drops: ItemV2[] = [];
  const log: string[] = [];

  const RARITY_ORDER = { Normal: 0, Magic: 1, Rare: 2, Legendary: 3 } as const;
  for (const enemy of battle.enemies) {
    exp += enemy.expValue();
    const stat = FAMILY_INFO[enemy.family].trainsStat;
    trained[stat] = (trained[stat] ?? 0) + 1;
    const dropChance = enemy.isBoss || enemy.rarity === 'Rare' ? 100 : enemy.rarity === 'Alpha' ? BALANCE.dropChanceAlpha : BALANCE.dropChanceCommon;
    if (randInt(100) < dropChance) {
      const ilvl = enemy.level + (enemy.rarity === 'Rare' ? 4 : enemy.rarity === 'Alpha' ? 2 : 0);
      const bias = enemy.isBoss ? 3 : enemy.rarity === 'Rare' ? 2 : enemy.rarity === 'Alpha' ? 1 : 0;
      drops.push(generateItem(ilvl, hero.effectiveStat('LUCK'), bias));
    }
  }
  // PLAN3: gear is scarce - keep only the single best drop per battle.
  if (drops.length > BALANCE.maxDropsPerBattle) {
    drops.sort((a, b) => RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || b.value - a.value);
    drops.length = BALANCE.maxDropsPerBattle;
  }

  log.push(`The field falls silent. ${exp} souls' worth of experience.`);
  for (const [stat, amount] of Object.entries(trained)) {
    hero.stats[stat as Stat] += amount;
  }
  hero.recomputeDerived();
  log.push(...hero.gainExp(exp));
  for (const monster of party) {
    if (monster.isAlive()) log.push(...monster.gainExp(exp));
  }
  for (const item of drops) {
    hero.addItem(item);
    log.push(`Claimed: ${item.name} [${item.rarity}]`);
  }

  hero.statusEffects = [];
  hero.activeMods = [];
  for (const m of party) {
    m.statusEffects = [];
    m.activeMods = [];
  }
  return { log, drops, expGained: exp, trained };
}
