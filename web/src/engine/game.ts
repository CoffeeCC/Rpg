import type {
  ChronicleState,
  ClassName,
  EventDef,
  EventOutcome,
  FxEvent,
  GateId,
  GeneratedWorld,
  ItemV2,
  RaceName,
  Stat,
} from './types';
import { Character } from './entities/Character';
import { MonsterInstance } from './entities/MonsterInstance';
import {
  startBattle,
  playCard,
  endTurn,
  useBattleItem,
  attemptFlee,
  collectSpoils,
  type BattleState,
} from './systems/cardBattle';
import { breed, canBreed } from './systems/breeding';
import { generateItem } from './systems/lootGen';
import { generateWorld, forgeArtifactItem } from './systems/worldgen';
import { newExpedition, descend, step, openKey, isOpened, TILE, type Direction, type Expedition } from './systems/floors';
import { bestowName } from './systems/naming';
import { GATES } from './data/gates';
import { EVENTS } from './data/events';
import { QUESTS } from './data/quests';
import { CONSUMABLES } from './data/items';
import { CLASS_DECKS, RACE_CARDS, REWARD_POOLS, TAME_CARD_ID, getCard } from './data/cards';
import { BALANCE } from './data/balance';
import { NPCS } from './data/npcs';
import { randInt } from './random';

export type Screen =
  | 'create'
  | 'town'
  | 'gateSelect'
  | 'floor'
  | 'battle'
  | 'cardReward'
  | 'event'
  | 'shopItems'
  | 'shopGear'
  | 'stable'
  | 'breeding'
  | 'questBoard'
  | 'tavern'
  | 'chronicle'
  | 'deck'
  | 'smith'
  | 'characterSheet'
  | 'equipment'
  | 'saveLoad'
  | 'victory';

export const MAX_ACTIVE_MONSTERS = 2;
export const STABLE_CAP = 20;
const ENCOUNTER_CHANCE = BALANCE.encounterChance;
const EVENT_CHANCE = BALANCE.eventChance;
const ARTIFACT_CHEST_CHANCE = BALANCE.artifactChestChance;
const MAX_LOG_LINES = 80;
const GEAR_STOCK_SIZE = BALANCE.gearStockSize;

export interface QuestProgress {
  id: string;
  progress: number;
  complete: boolean;
  claimed: boolean;
}

export interface PendingEvent {
  eventId: string;
}

export interface TavernLine {
  npcId: string;
  text: string;
}

/** A generated-history moment big enough to stop the game and say so. */
export type PendingLegend = { kind: 'beast'; beastId: string } | { kind: 'artifact'; artifactId: string };

export interface GameState {
  screen: Screen;
  player: Character | null;
  party: MonsterInstance[];
  stable: MonsterInstance[];
  expedition: Expedition | null;
  battle: BattleState | null;
  /** Card ids earned as rewards during the current expedition only. */
  expeditionExtras: string[];
  /** Three card ids offered after a victory (screen 'cardReward'). */
  pendingReward: string[] | null;
  pendingEvent: PendingEvent | null;
  pendingStory: number | null;
  pendingLegend: PendingLegend | null;
  storyChapter: number;
  orbs: GateId[];
  defeatedBosses: GateId[];
  questLog: QuestProgress[];
  gearStock: ItemV2[];
  world: GeneratedWorld | null;
  chronicle: ChronicleState;
  lastTalk: TavernLine | null;
  /** Transient FX from the last battle action — consumed by the UI, never saved. */
  lastFx: FxEvent[];
  log: string[];
}

export type GameAction =
  | { type: 'CREATE_CHARACTER'; name: string; race: RaceName; className: ClassName }
  | { type: 'STORY_CONTINUE' }
  | { type: 'GOTO'; screen: Screen }
  | { type: 'ENTER_GATE'; gateId: GateId }
  | { type: 'MOVE'; dir: Direction }
  | { type: 'LEAVE_GATE' }
  | { type: 'REST' }
  | { type: 'PLAY_CARD'; handIndex: number; targetUid?: string }
  | { type: 'END_TURN' }
  | { type: 'BATTLE_ITEM'; name: string; targetUid?: string }
  | { type: 'FLEE_BATTLE' }
  | { type: 'CHOOSE_REWARD'; cardId: string | null }
  | { type: 'EVENT_CHOICE'; optionIndex: number }
  | { type: 'USE_ITEM_FIELD'; itemName: string; targetUid: string }
  | { type: 'SHOP_BUY_CONSUMABLE'; name: string }
  | { type: 'SHOP_BUY_GEAR'; index: number }
  | { type: 'SELL_GEAR'; uid: string }
  | { type: 'EQUIP'; uid: string }
  | { type: 'SPEND_ATTRIBUTE'; stat: Stat }
  | { type: 'PARTY_ADD'; uid: string }
  | { type: 'PARTY_REMOVE'; uid: string }
  | { type: 'RELEASE'; uid: string }
  | { type: 'BREED'; parentA: string; parentB: string; skillIds: string[] }
  | { type: 'ACCEPT_QUEST'; questId: string }
  | { type: 'CLAIM_QUEST'; questId: string }
  | { type: 'UPGRADE_CARD'; cardId: string }
  | { type: 'LEGEND_SEEN' }
  | { type: 'TALK'; npcId: string }
  | { type: 'LOAD_STATE'; state: GameState }
  | { type: 'RESTART' };

export function initialGameState(): GameState {
  return {
    screen: 'create',
    player: null,
    party: [],
    stable: [],
    expedition: null,
    battle: null,
    expeditionExtras: [],
    pendingReward: null,
    pendingEvent: null,
    pendingStory: null,
    pendingLegend: null,
    storyChapter: -1,
    orbs: [],
    defeatedBosses: [],
    questLog: [],
    gearStock: [],
    world: null,
    chronicle: { beastsSlain: [], artifactsFound: [], deeds: [] },
    lastTalk: null,
    lastFx: [],
    log: [],
  };
}

function pushLog(log: string[], ...lines: string[]): string[] {
  const combined = [...log, ...lines];
  return combined.length > MAX_LOG_LINES ? combined.slice(combined.length - MAX_LOG_LINES) : combined;
}

/**
 * Clone every mutable part before applying an action. Reducers must be pure —
 * React StrictMode double-invokes them, and our entities mutate in place.
 */
function cloneCore(state: GameState): GameState {
  return {
    ...state,
    player: state.player ? state.player.clone() : null,
    party: state.party.map((m) => m.clone()),
    stable: state.stable.map((m) => m.clone()),
    expedition: state.expedition ? { ...state.expedition, opened: [...state.expedition.opened] } : null,
    battle: state.battle
      ? {
          ...state.battle,
          enemies: state.battle.enemies.map((e) => e.clone()),
          intents: { ...state.battle.intents },
          enemyBlock: { ...state.battle.enemyBlock },
          drawPile: [...state.battle.drawPile],
          hand: [...state.battle.hand],
          discardPile: [...state.battle.discardPile],
          exhaustPile: [...state.battle.exhaustPile],
        }
      : null,
    expeditionExtras: [...state.expeditionExtras],
    pendingReward: state.pendingReward ? [...state.pendingReward] : null,
    orbs: [...state.orbs],
    defeatedBosses: [...state.defeatedBosses],
    questLog: state.questLog.map((q) => ({ ...q })),
    gearStock: [...state.gearStock],
    chronicle: {
      beastsSlain: [...state.chronicle.beastsSlain],
      artifactsFound: [...state.chronicle.artifactsFound],
      deeds: [...state.chronicle.deeds],
    },
    lastFx: [],
    log: state.log,
  };
}

type QuestEvent =
  | { type: 'kill'; family: string }
  | { type: 'tame' }
  | { type: 'breed' }
  | { type: 'reachFloor'; gate: GateId; floor: number }
  | { type: 'defeatBoss'; gate: GateId };

function applyQuestEvent(questLog: QuestProgress[], ev: QuestEvent, log: string[]) {
  for (const entry of questLog) {
    if (entry.complete) continue;
    const quest = QUESTS.find((q) => q.id === entry.id);
    if (!quest) continue;
    const obj = quest.objective;
    let advanced = false;
    if (obj.kind === 'kill' && ev.type === 'kill') advanced = true;
    else if (obj.kind === 'killFamily' && ev.type === 'kill' && ev.family === obj.family) advanced = true;
    else if (obj.kind === 'tame' && ev.type === 'tame') advanced = true;
    else if (obj.kind === 'breed' && ev.type === 'breed') advanced = true;
    else if (obj.kind === 'reachFloor' && ev.type === 'reachFloor' && ev.gate === obj.gate && ev.floor >= obj.floor) {
      entry.progress = 1;
      entry.complete = true;
      log.push(`Quest complete: ${quest.name}.`);
      continue;
    } else if (obj.kind === 'defeatBoss' && ev.type === 'defeatBoss' && ev.gate === obj.gate) {
      entry.progress = 1;
      entry.complete = true;
      log.push(`Quest complete: ${quest.name}.`);
      continue;
    }
    if (advanced) {
      entry.progress++;
      const needed = 'count' in obj ? obj.count : 1;
      if (entry.progress >= needed) {
        entry.complete = true;
        log.push(`Quest complete: ${quest.name}.`);
      }
    }
  }
}

function restockGear(player: Character): ItemV2[] {
  const stock: ItemV2[] = [];
  for (let i = 0; i < GEAR_STOCK_SIZE; i++) {
    stock.push(generateItem(Math.max(1, player.level + randInt(3) - 1), player.effectiveStat('LUCK'), 1));
  }
  return stock;
}

function healParty(player: Character, party: MonsterInstance[]) {
  player.hp = player.maxHp;
  player.mp = player.maxMp;
  player.statusEffects = [];
  player.activeMods = [];
  for (const m of party) {
    m.hp = m.maxHp;
    m.mp = m.maxMp;
    m.statusEffects = [];
    m.activeMods = [];
  }
}

function deedYear(world: GeneratedWorld): number {
  return (world.eras[world.eras.length - 1]?.endYear ?? 900) + 1;
}

/** PLAN3: monster death is forever. Reap the fallen, write them into legend. */
function reapFallen(state: GameState, lines: string[]) {
  const fallen = state.party.filter((m) => !m.isAlive());
  if (fallen.length === 0) return;
  const whereName = state.battle?.gateId ? GATES[state.battle.gateId].name : state.expedition ? GATES[state.expedition.gateId].name : 'the dark';
  for (const m of fallen) {
    lines.push(`${m.nickname} will not come home. Keep what it taught you.`);
    if (state.world) {
      state.chronicle.deeds.push({
        year: deedYear(state.world),
        text: `${m.nickname} the ${m.species.name}, companion to ${state.player?.name ?? 'a tamer'}, fell in the ${whereName}. Faithful to the end.`,
      });
    }
  }
  state.party = state.party.filter((m) => m.isAlive());
}

function beginBattle(state: GameState, log: string[], opts: { boss?: boolean; forceRarity?: 'Alpha' | 'Rare' } = {}): void {
  if (!state.player || !state.expedition) return;
  const gate = GATES[state.expedition.gateId];
  const floor = gate.floors[state.expedition.floorIndex];
  let famousBeastId: string | undefined;
  let enemies: MonsterInstance[];

  if (opts.boss) {
    enemies = [MonsterInstance.createBoss(gate.bossFamily, gate.bossTier, gate.bossName, gate.bossLevel)];
    log.push(`${gate.bossName} bars the way.`);
  } else {
    const count = 1 + (randInt(100) < BALANCE.packOf2Pct ? 1 : 0) + (randInt(100) < BALANCE.packOf3Pct ? 1 : 0);
    enemies = [];
    for (let i = 0; i < count; i++) {
      enemies.push(MonsterInstance.createWild(floor.spawn, i === 0 ? opts.forceRarity : undefined));
    }
    // Famous beast substitution: a Rare spawn in a haunted gate becomes the legend.
    if (state.world && enemies[0].rarity === 'Rare') {
      const beast = state.world.beasts.find((b) => b.gateId === state.expedition!.gateId && !state.chronicle.beastsSlain.includes(b.id));
      if (beast) {
        const legend = new MonsterInstance({
          speciesId: beast.speciesId,
          level: 3 + floor.spawn.levelBonus + beast.might,
          rarity: 'Rare',
          nickname: beast.name,
        });
        enemies[0] = legend;
        famousBeastId = beast.id;
        state.pendingLegend = { kind: 'beast', beastId: beast.id };
        log.push(`The air goes wrong. ${beast.name}, ${beast.epithet}, has found you.`);
      }
    }
    if (!famousBeastId) log.push(`Enemies from the dark: ${enemies.map((e) => e.displayName()).join(', ')}.`);
  }

  state.battle = startBattle(state.player, state.party, enemies, {
    isBossFight: !!opts.boss,
    gateId: state.expedition.gateId,
    expeditionExtras: state.expeditionExtras,
    famousBeastId,
  });
  state.screen = 'battle';
}

function offerReward(state: GameState): void {
  const roll = (): string => {
    const r = randInt(100);
    const pool = r < 60 ? REWARD_POOLS.common : r < 90 ? REWARD_POOLS.uncommon : REWARD_POOLS.rare;
    return pool[randInt(pool.length)];
  };
  const offered = new Set<string>();
  const choices = state.player?.traits.rewardChoices ?? 3;
  let guard = 0;
  while (offered.size < choices && guard++ < 60) {
    const id = roll();
    if (getCard(id)) offered.add(id);
  }
  state.pendingReward = [...offered];
  state.screen = 'cardReward';
}

function handleVictory(state: GameState, log: string[]): void {
  const player = state.player!;
  const battle = state.battle!;
  const spoils = collectSpoils(player, state.party, battle);
  log.push(...spoils.log);
  for (const enemy of battle.enemies) {
    applyQuestEvent(state.questLog, { type: 'kill', family: enemy.family }, log);
  }

  // Famous beast slain → recorded in the Chronicle, drops its held artifact.
  if (battle.famousBeastId && state.world) {
    const beast = state.world.beasts.find((b) => b.id === battle.famousBeastId);
    if (beast && !state.chronicle.beastsSlain.includes(beast.id)) {
      state.chronicle.beastsSlain.push(beast.id);
      state.chronicle.deeds.push({
        year: deedYear(state.world),
        text: `${player.name} slew ${beast.name} ${beast.epithet}, ending a legend that outlived its tellers.`,
      });
      log.push(`${beast.name} is no more. The Chronicle will remember.`);
      if (beast.holdsArtifactId) {
        const artifact = state.world.artifacts.find((a) => a.id === beast.holdsArtifactId);
        if (artifact && !state.chronicle.artifactsFound.includes(artifact.id)) {
          state.chronicle.artifactsFound.push(artifact.id);
          const item = forgeArtifactItem(artifact);
          player.addItem(item);
          state.chronicle.deeds.push({ year: deedYear(state.world), text: `${artifact.name} returned to living hands.` });
          log.push(`From its hoard: ${artifact.name}.`);
        }
      }
    }
  }

  const wasBoss = battle.isBossFight;
  const gateId = battle.gateId;
  state.battle = null;

  if (wasBoss && gateId && state.expedition) {
    state.defeatedBosses.push(gateId);
    const e = state.expedition;
    e.opened.push(openKey(e, e.x, e.y));
    applyQuestEvent(state.questLog, { type: 'defeatBoss', gate: gateId }, log);
    if (state.world) {
      state.chronicle.deeds.push({ year: deedYear(state.world), text: `${player.name} felled ${GATES[gateId].bossName} in the ${GATES[gateId].name}.` });
    }
    if (gateId === 'abyss') {
      state.pendingStory = 5;
      state.storyChapter = 5;
      state.screen = 'floor';
      log.push('The Hollow Sovereign falls. Light floods the abyss.');
      return;
    }
    if (!state.orbs.includes(gateId)) {
      state.orbs.push(gateId);
      const chapter = state.orbs.length;
      state.pendingStory = chapter;
      state.storyChapter = Math.max(state.storyChapter, chapter);
      log.push(`A Warden's Orb, warm as a kept promise. (${state.orbs.length}/4)`);
    }
    state.screen = 'floor';
    return;
  }

  offerReward(state);
}

function handleDefeat(state: GameState, log: string[]): void {
  const player = state.player!;
  const lost = Math.floor((player.gold * BALANCE.defeatGoldLossPct) / 100);
  player.gold -= lost;
  healParty(player, state.party);
  state.battle = null;
  state.expedition = null;
  state.expeditionExtras = [];
  state.pendingReward = null;
  state.screen = 'town';
  log.push(`You wake beneath the Great Tree. Someone carried you home — and took ${lost} gold for the trouble.`);
}

function applyEventOutcomes(state: GameState, outcomes: EventOutcome[], log: string[]) {
  const player = state.player;
  if (!player) return;
  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case 'gold':
        player.addGold(outcome.amount);
        log.push(`Found ${outcome.amount} gold.`);
        break;
      case 'goldLoss': {
        const lost = Math.min(player.gold, outcome.amount);
        player.gold -= lost;
        log.push(`Lost ${lost} gold.`);
        break;
      }
      case 'item': {
        const item = generateItem(player.level + outcome.ilvlBonus, player.effectiveStat('LUCK'), 1);
        player.addItem(item);
        log.push(`Received: ${item.name} [${item.rarity}]`);
        break;
      }
      case 'heal':
        healParty(player, state.party);
        log.push('The party is fully restored.');
        break;
      case 'damagePct': {
        const dmg = player.takeDamage(Math.floor(player.maxHp * (outcome.pct / 100)));
        log.push(`${player.name} takes ${dmg} damage.`);
        break;
      }
      case 'statBoost':
        player.stats[outcome.stat] += outcome.amount;
        player.recomputeDerived();
        log.push(`${player.name}'s ${outcome.stat} permanently +${outcome.amount}.`);
        break;
      case 'consumable':
        player.addConsumable(outcome.name, outcome.count);
        log.push(`Received ${outcome.count}× ${outcome.name}.`);
        break;
      case 'fight':
        beginBattle(state, log, { forceRarity: outcome.rarity === 'Common' ? undefined : outcome.rarity });
        break;
      case 'nothing':
        break;
    }
  }
}

function fillRumor(template: string, world: GeneratedWorld): string {
  const beast = world.beasts[randInt(world.beasts.length)];
  const artifact = world.artifacts[randInt(world.artifacts.length)];
  const figure = world.figures[randInt(world.figures.length)];
  const era = world.eras[randInt(world.eras.length)];
  return template
    .replace(/\{beast\}/g, beast ? `${beast.name} ${beast.epithet}` : 'something old')
    .replace(/\{beastGate\}/g, beast ? GATES[beast.gateId].name : 'a gate')
    .replace(/\{artifact\}/g, artifact ? artifact.name : 'a lost thing')
    .replace(/\{artifactGate\}/g, artifact ? GATES[artifact.gateId].name : 'a gate')
    .replace(/\{figure\}/g, figure ? `${figure.name} ${figure.title}` : 'someone')
    .replace(/\{era\}/g, era ? era.name : 'an age ago')
    .replace(/\{realm\}/g, world.name);
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'CREATE_CHARACTER': {
      const player = new Character(action.name, action.race, action.className);
      const next = initialGameState();
      const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
      next.world = generateWorld(seed);
      next.player = player;
      next.screen = 'town';
      next.pendingStory = 0;
      next.storyChapter = 0;
      next.gearStock = restockGear(player);
      next.log = [`The realm of ${next.world.name} takes its shape around Everdusk. Welcome, ${player.name}.`];
      return next;
    }

    case 'STORY_CONTINUE': {
      if (state.pendingStory === null) return state;
      const finished = state.pendingStory;
      return { ...state, pendingStory: null, screen: finished === 5 ? 'victory' : state.screen };
    }

    case 'GOTO': {
      if (!state.player) return state;
      if (state.screen === 'battle' || state.screen === 'event' || state.screen === 'cardReward') return state;
      return { ...state, screen: action.screen, lastTalk: null };
    }

    case 'ENTER_GATE': {
      if (!state.player || state.screen !== 'gateSelect') return state;
      const gate = GATES[action.gateId];
      if (state.orbs.length < gate.requiredOrbs) return state;
      const next = cloneCore(state);
      next.expedition = newExpedition(action.gateId);
      next.expeditionExtras = [];
      next.screen = 'floor';
      next.log = pushLog(state.log, `You step through the ${gate.name}.`);
      applyQuestEvent(next.questLog, { type: 'reachFloor', gate: action.gateId, floor: 1 }, next.log);
      return next;
    }

    case 'MOVE': {
      if (!state.player || !state.expedition || state.screen !== 'floor') return state;
      const next = cloneCore(state);
      const exp = next.expedition!;
      const result = step(exp, action.dir);
      if (!result.moved) return state;
      exp.x = result.x;
      exp.y = result.y;
      const lines: string[] = [];

      switch (result.tile) {
        case TILE.STAIRS: {
          next.expedition = descend(exp);
          const floorNumber = next.expedition.floorIndex + 1;
          lines.push(`Deeper. Floor ${floorNumber}.`);
          applyQuestEvent(next.questLog, { type: 'reachFloor', gate: exp.gateId, floor: floorNumber }, lines);
          break;
        }
        case TILE.CHEST: {
          if (!isOpened(exp, result.x, result.y)) {
            exp.opened.push(openKey(exp, result.x, result.y));
            const gate = GATES[exp.gateId];
            const floor = gate.floors[exp.floorIndex];
            // Lost artifact check first (DF-style: real history, real loot).
            const artifact = next.world?.artifacts.find(
              (a) =>
                a.gateId === exp.gateId &&
                a.floorIndex === exp.floorIndex &&
                !next.chronicle.artifactsFound.includes(a.id) &&
                !next.world!.beasts.some((b) => b.holdsArtifactId === a.id)
            );
            if (artifact && randInt(100) < ARTIFACT_CHEST_CHANCE) {
              next.chronicle.artifactsFound.push(artifact.id);
              const item = forgeArtifactItem(artifact);
              next.player!.addItem(item);
              next.pendingLegend = { kind: 'artifact', artifactId: artifact.id };
              next.chronicle.deeds.push({ year: deedYear(next.world!), text: `${next.player!.name} recovered ${artifact.name} from the ${gate.name}.` });
              lines.push(`Beneath the dust: ${artifact.name}.`);
            } else {
              const item = generateItem(next.player!.level + floor.spawn.levelBonus + 1, next.player!.effectiveStat('LUCK'), 1);
              next.player!.addItem(item);
              lines.push(`The chest yields ${item.name} [${item.rarity}].`);
            }
          }
          break;
        }
        case TILE.SHRINE: {
          if (!isOpened(exp, result.x, result.y)) {
            exp.opened.push(openKey(exp, result.x, result.y));
            healParty(next.player!, next.party);
            lines.push('A cold flame that warms. The party is restored.');
          }
          break;
        }
        case TILE.EVENT: {
          if (!isOpened(exp, result.x, result.y)) {
            exp.opened.push(openKey(exp, result.x, result.y));
            const event = EVENTS[randInt(EVENTS.length)];
            next.pendingEvent = { eventId: event.id };
            next.screen = 'event';
            lines.push(`${event.emoji} ${event.name}`);
          }
          break;
        }
        case TILE.BOSS: {
          if (!next.defeatedBosses.includes(exp.gateId)) {
            beginBattle(next, lines, { boss: true });
          }
          break;
        }
        default: {
          const roll = randInt(100);
          if (roll < ENCOUNTER_CHANCE) {
            beginBattle(next, lines);
          } else if (roll < ENCOUNTER_CHANCE + EVENT_CHANCE) {
            const event = EVENTS[randInt(EVENTS.length)];
            next.pendingEvent = { eventId: event.id };
            next.screen = 'event';
            lines.push(`${event.emoji} ${event.name}`);
          }
        }
      }

      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'LEAVE_GATE': {
      if (state.screen !== 'floor') return state;
      return {
        ...state,
        expedition: null,
        expeditionExtras: [],
        screen: 'town',
        log: pushLog(state.log, 'You return to Everdusk. The reward cards fade like a dream on waking.'),
      };
    }

    case 'REST': {
      if (!state.player || state.screen !== 'town') return state;
      const next = cloneCore(state);
      healParty(next.player!, next.party);
      for (const m of next.stable) {
        m.hp = m.maxHp;
        m.mp = m.maxMp;
      }
      next.gearStock = restockGear(next.player!);
      next.log = pushLog(state.log, 'Rest, of a kind. The gear shop has new stock.');
      return next;
    }

    case 'PLAY_CARD': {
      if (!state.player || !state.battle || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      const result = playCard(next.player!, next.party, next.battle!, action.handIndex, action.targetUid);
      next.lastFx = result.fx;
      const lines = [...result.log];

      reapFallen(next, lines);
      if (result.outcome === 'tamed' && result.tamed) {
        applyQuestEvent(next.questLog, { type: 'tame' }, lines);
        const species = result.tamed.species.name;
        result.tamed.nickname = bestowName();
        lines.push(`You give the ${species} a name: ${result.tamed.nickname}.`);
        if (next.party.length < next.player!.traits.partyCap) {
          next.party.push(result.tamed);
          lines.push(`${result.tamed.nickname} walks beside you now. Its cards join your deck.`);
        } else if (next.stable.length < STABLE_CAP) {
          next.stable.push(result.tamed);
          lines.push(`${result.tamed.nickname} is sent to the stable.`);
        } else {
          lines.push(`The stable is full — ${result.tamed.nickname} watches you leave.`);
        }
        next.battle = null;
        next.screen = 'floor';
      } else if (result.outcome === 'victory') {
        handleVictory(next, lines);
      }
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'END_TURN': {
      if (!state.player || !state.battle || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      const result = endTurn(next.player!, next.party, next.battle!);
      next.lastFx = result.fx;
      const lines = [...result.log];
      reapFallen(next, lines);
      if (result.outcome === 'victory') handleVictory(next, lines);
      else if (result.outcome === 'defeat') handleDefeat(next, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'BATTLE_ITEM': {
      if (!state.player || !state.battle || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      const result = useBattleItem(next.player!, next.battle!, action.name, action.targetUid);
      next.lastFx = result.fx;
      next.log = pushLog(state.log, ...result.log);
      return next;
    }

    case 'FLEE_BATTLE': {
      if (!state.player || !state.battle || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      if (attemptFlee(next.player!, next.battle!)) {
        next.battle = null;
        next.screen = 'floor';
        next.player!.statusEffects = [];
        next.player!.activeMods = [];
        next.log = pushLog(state.log, 'You slip back into the dark. It lets you.');
        return next;
      }
      const lines = ['No way out — they close in.'];
      const result = endTurn(next.player!, next.party, next.battle!);
      next.lastFx = result.fx;
      lines.push(...result.log);
      reapFallen(next, lines);
      if (result.outcome === 'victory') handleVictory(next, lines);
      else if (result.outcome === 'defeat') handleDefeat(next, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'CHOOSE_REWARD': {
      if (!state.player || state.screen !== 'cardReward' || !state.pendingReward) return state;
      const next = cloneCore(state);
      const lines: string[] = [];
      if (action.cardId && next.pendingReward!.includes(action.cardId) && getCard(action.cardId)) {
        next.expeditionExtras.push(action.cardId);
        lines.push(`${getCard(action.cardId)!.name} joins your deck — for as long as this expedition lasts.`);
      } else {
        lines.push('You leave the cards where they lie.');
      }
      next.pendingReward = null;
      next.screen = 'floor';
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'EVENT_CHOICE': {
      if (!state.player || !state.pendingEvent || state.screen !== 'event') return state;
      const event: EventDef | undefined = EVENTS.find((e) => e.id === state.pendingEvent!.eventId);
      const option = event?.options[action.optionIndex];
      if (!event || !option) return state;
      const next = cloneCore(state);
      const lines: string[] = [option.resultText];
      next.pendingEvent = null;
      next.screen = 'floor';
      applyEventOutcomes(next, option.outcomes, lines); // may flip to battle
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'USE_ITEM_FIELD': {
      if (!state.player || (state.screen !== 'floor' && state.screen !== 'town')) return state;
      const def = CONSUMABLES[action.itemName];
      if (!def || def.effect.type === 'bait') return state;
      const next = cloneCore(state);
      if (!next.player!.removeConsumable(action.itemName)) return state;
      const target = action.targetUid === 'hero' ? next.player! : next.party.find((m) => m.uid === action.targetUid);
      if (!target) return state;
      const lines: string[] = [];
      if (def.effect.type === 'heal') {
        lines.push(`${def.emoji} ${target.displayName()} recovers ${target.heal(def.effect.amount)} HP.`);
      } else if (def.effect.type === 'mana') {
        lines.push(`${def.emoji} ${target.displayName()} recovers ${target.restoreMp(def.effect.amount)} MP.`);
      }
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'SHOP_BUY_CONSUMABLE': {
      if (!state.player || state.screen !== 'shopItems') return state;
      const def = CONSUMABLES[action.name];
      if (!def) return state;
      const next = cloneCore(state);
      const price = Math.ceil(def.price * next.player!.traits.shopDiscount);
      if (!next.player!.spendGold(price)) {
        next.log = pushLog(state.log, 'Your purse disagrees.');
        return next;
      }
      next.player!.addConsumable(def.name);
      next.log = pushLog(state.log, `Bought ${def.emoji} ${def.name} for ${price}g.`);
      return next;
    }

    case 'SHOP_BUY_GEAR': {
      if (!state.player || state.screen !== 'shopGear') return state;
      const item = state.gearStock[action.index];
      if (!item) return state;
      const next = cloneCore(state);
      const price = Math.ceil(item.value * next.player!.traits.shopDiscount);
      if (!next.player!.spendGold(price)) {
        next.log = pushLog(state.log, 'Your purse disagrees.');
        return next;
      }
      next.gearStock.splice(action.index, 1);
      next.player!.addItem(item);
      next.log = pushLog(state.log, `Bought ${item.name} for ${price}g.`);
      return next;
    }

    case 'SELL_GEAR': {
      if (!state.player || (state.screen !== 'shopGear' && state.screen !== 'equipment')) return state;
      const next = cloneCore(state);
      const idx = next.player!.items.findIndex((i) => i.uid === action.uid);
      if (idx === -1) return state;
      const [item] = next.player!.items.splice(idx, 1);
      const price = Math.max(1, Math.floor(item.value / 2));
      next.player!.addGold(price);
      next.log = pushLog(state.log, `Sold ${item.name} for ${price}g.`);
      return next;
    }

    case 'EQUIP': {
      if (!state.player || state.screen !== 'equipment') return state;
      const next = cloneCore(state);
      const item = next.player!.items.find((i) => i.uid === action.uid);
      if (!item) return state;
      const previous = next.player!.equip(item);
      next.log = pushLog(state.log, `Equipped ${item.name}.${previous ? ` ${previous.name} returned to the bag.` : ''}`);
      return next;
    }

    case 'SPEND_ATTRIBUTE': {
      if (!state.player || state.screen !== 'characterSheet') return state;
      const next = cloneCore(state);
      if (!next.player!.spendAttributePoint(action.stat)) return state;
      next.log = pushLog(state.log, `${action.stat} +1.`);
      return next;
    }

    case 'PARTY_ADD': {
      if (!state.player || state.screen !== 'stable') return state;
      if (state.party.length >= state.player.traits.partyCap) return state;
      const next = cloneCore(state);
      const idx = next.stable.findIndex((m) => m.uid === action.uid);
      if (idx === -1) return state;
      const [monster] = next.stable.splice(idx, 1);
      next.party.push(monster);
      next.log = pushLog(state.log, `${monster.displayName()} joins the active party. Its cards are yours.`);
      return next;
    }

    case 'PARTY_REMOVE': {
      if (!state.player || state.screen !== 'stable') return state;
      const next = cloneCore(state);
      const idx = next.party.findIndex((m) => m.uid === action.uid);
      if (idx === -1) return state;
      if (next.stable.length >= STABLE_CAP) return state;
      const [monster] = next.party.splice(idx, 1);
      next.stable.push(monster);
      next.log = pushLog(state.log, `${monster.displayName()} heads to the stable.`);
      return next;
    }

    case 'RELEASE': {
      if (!state.player || state.screen !== 'stable') return state;
      const next = cloneCore(state);
      const idx = next.stable.findIndex((m) => m.uid === action.uid);
      if (idx === -1) return state;
      const [monster] = next.stable.splice(idx, 1);
      next.log = pushLog(state.log, `${monster.displayName()} returns to the dark. Travel well.`);
      return next;
    }

    case 'BREED': {
      if (!state.player || state.screen !== 'breeding') return state;
      const next = cloneCore(state);
      const all = [...next.party, ...next.stable];
      const parentA = all.find((m) => m.uid === action.parentA);
      const parentB = all.find((m) => m.uid === action.parentB);
      if (!parentA || !parentB) return state;
      const check = canBreed(parentA, parentB);
      if (!check.ok) {
        next.log = pushLog(state.log, check.reason ?? 'They refuse.');
        return next;
      }
      const child = breed(parentA, parentB, action.skillIds);
      child.nickname = bestowName();
      next.party = next.party.filter((m) => m.uid !== parentA.uid && m.uid !== parentB.uid);
      next.stable = next.stable.filter((m) => m.uid !== parentA.uid && m.uid !== parentB.uid);
      if (next.party.length < next.player!.traits.partyCap) next.party.push(child);
      else next.stable.push(child);
      const lines: string[] = [
        `${parentA.nickname} and ${parentB.nickname} give what they are to the egg. Both are gone.`,
        `It hatches: ${child.nickname}, a ${child.species.name} (+${child.plus}).`,
      ];
      applyQuestEvent(next.questLog, { type: 'breed' }, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'ACCEPT_QUEST': {
      if (!state.player || state.screen !== 'questBoard') return state;
      if (state.questLog.some((q) => q.id === action.questId)) return state;
      const quest = QUESTS.find((q) => q.id === action.questId);
      if (!quest) return state;
      const next = cloneCore(state);
      next.questLog.push({ id: quest.id, progress: 0, complete: false, claimed: false });
      next.log = pushLog(state.log, `Quest accepted: ${quest.name}.`);
      return next;
    }

    case 'CLAIM_QUEST': {
      if (!state.player || state.screen !== 'questBoard') return state;
      const next = cloneCore(state);
      const entry = next.questLog.find((q) => q.id === action.questId);
      const quest = QUESTS.find((q) => q.id === action.questId);
      if (!entry || !quest || !entry.complete || entry.claimed) return state;
      entry.claimed = true;
      const lines: string[] = [`Reward claimed: "${quest.name}".`, `+${quest.reward.gold}g`];
      next.player!.addGold(quest.reward.gold);
      if (quest.reward.exp > 0) lines.push(...next.player!.gainExp(quest.reward.exp));
      if (quest.reward.item) {
        const item = generateItem(next.player!.level + quest.reward.item.ilvlBonus, next.player!.effectiveStat('LUCK'), 2);
        next.player!.addItem(item);
        lines.push(`Reward: ${item.name} [${item.rarity}]`);
      }
      for (const c of quest.reward.consumables ?? []) {
        next.player!.addConsumable(c.name, c.count);
        lines.push(`Reward: ${c.count}× ${c.name}`);
      }
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'UPGRADE_CARD': {
      if (!state.player || state.screen !== 'smith') return state;
      const player = state.player;
      // Only the persistent deck (class + race + tame card) can be smithed;
      // monster cards grow with their monster instead.
      const persistent = new Set([...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID]);
      const card = getCard(action.cardId);
      if (!card || !persistent.has(action.cardId)) return state;
      if (player.upgradedCards.includes(action.cardId)) return state;
      const cost = BALANCE.upgradeCosts[card.rarity] ?? 100;
      const next = cloneCore(state);
      if (!next.player!.spendGold(cost)) {
        next.log = pushLog(state.log, 'The smith names a price your purse cannot argue with.');
        return next;
      }
      next.player!.upgradedCards.push(action.cardId);
      next.log = pushLog(state.log, `${card.name} is reforged. Every copy in your deck now bears the +.`);
      return next;
    }

    case 'TALK': {
      if (!state.player || state.screen !== 'tavern' || !state.world) return state;
      const npc = NPCS.find((n) => n.id === action.npcId);
      if (!npc) return state;
      const useRumor = npc.rumors.length > 0 && randInt(100) < 45;
      let text: string;
      if (useRumor) {
        text = fillRumor(npc.rumors[randInt(npc.rumors.length)], state.world);
      } else {
        const stageIdx = Math.min(npc.greetings.length - 1, Math.max(0, state.storyChapter));
        // greetings is staged pools: pick the highest pool index <= storyChapter
        let pool = npc.greetings[0];
        for (let i = 0; i < npc.greetings.length; i++) {
          if (i <= stageIdx && npc.greetings[i]?.length) pool = npc.greetings[i];
        }
        text = pool[randInt(pool.length)];
      }
      return { ...state, lastTalk: { npcId: npc.id, text }, log: pushLog(state.log, `${npc.name}: "${text}"`) };
    }

    case 'LEGEND_SEEN':
      return { ...state, pendingLegend: null };

    case 'LOAD_STATE':
      return action.state;

    case 'RESTART':
      return initialGameState();

    default:
      return state;
  }
}
