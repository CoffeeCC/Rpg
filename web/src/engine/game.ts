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
import {
  newExpedition,
  descend,
  ascend,
  openKey,
  isOpened,
  isBroken,
  tileAt,
  floorOf,
  delta,
  unitAt,
  playerWalkable,
  movFor,
  advanceHostiles,
  floorHasMiniboss,
  TILE,
  type Direction,
  type Expedition,
  type FloorUnit,
} from './systems/floors';
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

/** The traveling merchant's mat, unrolled on the floor you found them on. */
export interface PendingMerchant {
  unitId: string;
  consumables: string[];
  gear: ItemV2 | null;
  cardId: string | null;
  cardPrice: number;
}

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
  pendingMerchant: PendingMerchant | null;
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
  | { type: 'END_MAP_TURN' }
  | { type: 'MERCHANT_BUY'; what: 'consumable' | 'gear' | 'card'; index: number }
  | { type: 'MERCHANT_CLOSE' }
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
    pendingMerchant: null,
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
    expedition: state.expedition
      ? {
          ...state.expedition,
          opened: [...state.expedition.opened],
          broken: [...state.expedition.broken],
          units: state.expedition.units.map((u) => ({ ...u })),
        }
      : null,
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
    pendingMerchant: state.pendingMerchant ? { ...state.pendingMerchant, consumables: [...state.pendingMerchant.consumables] } : null,
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

/** PLAN4 quest pacing: 3 to start, +1 per claimed quest, +2 per story chapter, easy first. */
export function availableQuests(state: GameState) {
  const claimed = state.questLog.filter((q) => q.claimed).length;
  const count = 3 + claimed + Math.max(0, state.storyChapter) * 2;
  return [...QUESTS].sort((a, b) => a.reward.gold - b.reward.gold).slice(0, count);
}

/** Start a battle against a tactical floor unit. */
function beginUnitBattle(state: GameState, unit: FloorUnit, lines: string[]): void {
  if (!state.player || !state.expedition) return;
  const exp = state.expedition;
  const floor = floorOf(exp);
  let enemies: MonsterInstance[] = [];
  let famousBeastId: string | undefined;

  if (unit.kind === 'miniboss') {
    enemies = [
      new MonsterInstance({
        speciesId: unit.speciesId!,
        level: unit.level ?? 3,
        rarity: 'Rare',
        nickname: unit.label.split(',')[0],
      }),
    ];
    famousBeastId = unit.famousBeastId;
    if (unit.famousBeastId) state.pendingLegend = { kind: 'beast', beastId: unit.famousBeastId };
    lines.push(`${unit.label} turns to face you.`);
  } else if (unit.kind === 'tamer') {
    const count = 2 + (randInt(100) < 40 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      const m = MonsterInstance.createWild(floor.spawn);
      m.nickname = bestowName();
      enemies.push(m);
    }
    lines.push(`${unit.label} whistles, and their beasts answer. "Show me yours."`);
  } else {
    enemies = [new MonsterInstance({ speciesId: unit.speciesId!, level: unit.level ?? 1 })];
    if (randInt(100) < BALANCE.packOf2Pct) enemies.push(MonsterInstance.createWild(floor.spawn));
    lines.push(`${unit.label} is upon you.`);
  }

  state.battle = startBattle(state.player, state.party, enemies, {
    isBossFight: false,
    gateId: exp.gateId,
    expeditionExtras: state.expeditionExtras,
    famousBeastId,
  });
  state.battle.unitId = unit.id;
  if (unit.kind !== 'merchant') state.battle.unitKind = unit.kind;
  if (unit.kind === 'tamer') state.battle.tamerName = unit.label;
  state.screen = 'battle';
}

function openMerchant(state: GameState, unit: FloorUnit, lines: string[]): void {
  if (state.pendingMerchant && state.pendingMerchant.unitId === unit.id) return;
  const names = Object.keys(CONSUMABLES);
  const picks: string[] = [];
  while (picks.length < 3 && names.length) picks.push(names.splice(randInt(names.length), 1)[0]);
  const pool = [...REWARD_POOLS.uncommon, ...REWARD_POOLS.rare];
  state.pendingMerchant = {
    unitId: unit.id,
    consumables: picks,
    gear: generateItem(state.player!.level + 1, state.player!.effectiveStat('LUCK'), 2),
    cardId: pool[randInt(pool.length)],
    cardPrice: 80 + randInt(41),
  };
  lines.push('The traveling merchant unrolls a mat of oddities. "For you? A fair price."');
}

/** Every hostile that can see you takes its move; contact starts a battle. */
function runEnemyPhase(state: GameState, lines: string[]): void {
  const exp = state.expedition!;
  const contact = advanceHostiles(exp);
  exp.movLeft = movFor(state.player!);
  if (contact) {
    lines.push(`${contact.label} closes the distance.`);
    beginUnitBattle(state, contact, lines);
  }
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
  const unitId = battle.unitId;
  const unitKind = battle.unitKind;
  const tamerName = battle.tamerName;
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
    // Gate bosses are one of the few deliberate sources of cards (PLAN4).
    offerReward(state);
    return;
  }

  // v6: tactical units die on the map when they die in battle.
  if (unitId && state.expedition) {
    const exp = state.expedition;
    const idx = exp.units.findIndex((u) => u.id === unitId);
    const unit = idx >= 0 ? exp.units[idx] : null;
    if (idx >= 0) exp.units.splice(idx, 1);

    if (unitKind === 'miniboss') {
      exp.minibossDown = true;
      log.push('Something releases its grip on the stairs. The way down is open.');
      if (unit && unit.figureName && state.world) {
        state.chronicle.deeds.push({
          year: deedYear(state.world),
          text: `${player.name} laid the Remnant of ${unit.figureName} to rest.`,
        });
      }
      offerReward(state);
      return;
    }
    if (unitKind === 'tamer') {
      const purse = 30 + randInt(31);
      player.addGold(purse);
      log.push(`${tamerName ?? 'The tamer'} yields the wager (${purse}g) and studies your beasts with new respect.`);
      offerReward(state);
      return;
    }
    // Ordinary units grant no card Boon — cards are earned, not gifted (PLAN4).
    state.screen = 'floor';
    return;
  }

  // Event-spawned and other unitless fights: no Boon either.
  state.screen = 'floor';
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
  state.pendingMerchant = null;
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
      next.expedition = newExpedition(action.gateId, next.world, next.chronicle);
      next.expedition.movLeft = movFor(next.player!);
      next.expeditionExtras = [];
      next.screen = 'floor';
      next.log = pushLog(state.log, `You step through the ${gate.name}.`);
      applyQuestEvent(next.questLog, { type: 'reachFloor', gate: action.gateId, floor: 1 }, next.log);
      return next;
    }

    case 'MOVE': {
      if (!state.player || !state.expedition || state.screen !== 'floor' || state.pendingMerchant) return state;
      const next = cloneCore(state);
      const exp = next.expedition!;
      const { dx, dy } = delta(action.dir);
      const tx = exp.x + dx;
      const ty = exp.y + dy;
      if (!playerWalkable(exp, tx, ty)) return state;
      const lines: string[] = [];

      // Units first: bumping into one is the interaction.
      const unit = unitAt(exp, tx, ty);
      if (unit) {
        if (unit.kind === 'merchant') openMerchant(next, unit, lines);
        else beginUnitBattle(next, unit, lines);
        next.log = pushLog(state.log, ...lines);
        return next;
      }

      const floor = floorOf(exp);
      const tile = tileAt(floor, tx, ty);

      if (tile === TILE.BREAKABLE && !isBroken(exp, tx, ty)) {
        exp.broken.push(openKey(exp, tx, ty));
        const roll = randInt(100);
        if (roll < 40) {
          const gold = 5 + randInt(16);
          next.player!.addGold(gold);
          lines.push(`Smash. Inside: ${gold} gold.`);
        } else if (roll < 62) {
          const names = Object.keys(CONSUMABLES);
          const name = names[randInt(names.length)];
          next.player!.addConsumable(name);
          lines.push(`Smash. Someone left ${name} behind.`);
        } else if (roll < 70) {
          lines.push('Smash. Under the splinters: a cache of cards.');
        } else {
          lines.push('Smash. Dust and splinters.');
        }
        exp.x = tx;
        exp.y = ty;
        exp.movLeft = Math.max(0, exp.movLeft - 1);
        if (roll >= 62 && roll < 70) {
          next.log = pushLog(state.log, ...lines);
          offerReward(next);
          return next;
        }
        if (exp.movLeft <= 0 && next.screen === 'floor') runEnemyPhase(next, lines);
        next.log = pushLog(state.log, ...lines);
        return next;
      }

      exp.x = tx;
      exp.y = ty;
      exp.movLeft = Math.max(0, exp.movLeft - 1);

      switch (tile) {
        case TILE.STAIRS: {
          if (floorHasMiniboss(floor) && !exp.minibossDown) {
            const guard = exp.units.find((u) => u.kind === 'miniboss');
            lines.push(
              guard
                ? `The stairs are sealed. ${guard.label} still draws breath.`
                : 'The stairs are sealed by something that no longer breathes.'
            );
            break;
          }
          next.expedition = descend(exp, next.world, next.chronicle);
          next.expedition.movLeft = movFor(next.player!);
          const floorNumber = next.expedition.floorIndex + 1;
          lines.push(`Deeper. Floor ${floorNumber}.`);
          applyQuestEvent(next.questLog, { type: 'reachFloor', gate: exp.gateId, floor: floorNumber }, lines);
          next.log = pushLog(state.log, ...lines);
          return next;
        }
        case TILE.START: {
          if (exp.floorIndex > 0) {
            next.expedition = ascend(exp, next.world, next.chronicle);
            next.expedition.movLeft = movFor(next.player!);
            lines.push(`You climb back up. Floor ${next.expedition.floorIndex + 1}.`);
          } else {
            next.expedition = null;
            next.expeditionExtras = [];
            next.pendingMerchant = null;
            next.screen = 'town';
            lines.push('You step back through the gate into Everdusk. The expedition cards fade like a dream on waking.');
          }
          next.log = pushLog(state.log, ...lines);
          return next;
        }
        case TILE.CHEST: {
          if (!isOpened(exp, tx, ty)) {
            exp.opened.push(openKey(exp, tx, ty));
            const gate = GATES[exp.gateId];
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
        case TILE.SECRET: {
          if (!isOpened(exp, tx, ty)) {
            exp.opened.push(openKey(exp, tx, ty));
            const item = generateItem(next.player!.level + floor.spawn.levelBonus + 2, next.player!.effectiveStat('LUCK'), 2);
            next.player!.addItem(item);
            lines.push(`A hollow no map records. Inside: ${item.name} [${item.rarity}] — and a cache of cards.`);
            next.log = pushLog(state.log, ...lines);
            offerReward(next);
            return next;
          }
          break;
        }
        case TILE.SHRINE: {
          if (!isOpened(exp, tx, ty)) {
            exp.opened.push(openKey(exp, tx, ty));
            healParty(next.player!, next.party);
            lines.push('A cold flame that warms. The party is restored.');
          }
          break;
        }
        case TILE.EVENT: {
          if (!isOpened(exp, tx, ty)) {
            exp.opened.push(openKey(exp, tx, ty));
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
        default:
          break; // v6: no random encounters — every fight walks the map.
      }

      if (next.screen === 'floor' && exp.movLeft <= 0) runEnemyPhase(next, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'END_MAP_TURN': {
      if (!state.player || !state.expedition || state.screen !== 'floor' || state.pendingMerchant) return state;
      const next = cloneCore(state);
      const lines: string[] = ['You hold your ground.'];
      runEnemyPhase(next, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'MERCHANT_BUY': {
      if (!state.player || !state.pendingMerchant || state.screen !== 'floor') return state;
      const next = cloneCore(state);
      const mat = next.pendingMerchant!;
      const discount = next.player!.traits.shopDiscount;
      const lines: string[] = [];
      if (action.what === 'consumable') {
        const name = mat.consumables[action.index];
        const def = name ? CONSUMABLES[name] : undefined;
        if (!def) return state;
        const price = Math.max(1, Math.ceil(def.price * 1.25 * discount));
        if (!next.player!.spendGold(price)) {
          next.log = pushLog(state.log, 'The merchant clicks their tongue. Not enough.');
          return next;
        }
        next.player!.addConsumable(def.name);
        mat.consumables.splice(action.index, 1);
        lines.push(`Bought ${def.emoji} ${def.name} for ${price}g.`);
      } else if (action.what === 'gear') {
        if (!mat.gear) return state;
        const price = Math.max(1, Math.ceil(mat.gear.value * 1.25 * discount));
        if (!next.player!.spendGold(price)) {
          next.log = pushLog(state.log, 'The merchant clicks their tongue. Not enough.');
          return next;
        }
        next.player!.addItem(mat.gear);
        lines.push(`Bought ${mat.gear.name} for ${price}g.`);
        mat.gear = null;
      } else {
        if (!mat.cardId || !getCard(mat.cardId)) return state;
        const price = Math.max(1, Math.ceil(mat.cardPrice * discount));
        if (!next.player!.spendGold(price)) {
          next.log = pushLog(state.log, 'The merchant clicks their tongue. Not enough.');
          return next;
        }
        next.expeditionExtras.push(mat.cardId);
        lines.push(`${getCard(mat.cardId)!.name} is yours for ${price}g — for as long as this expedition lasts.`);
        mat.cardId = null;
      }
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'MERCHANT_CLOSE': {
      if (!state.pendingMerchant) return state;
      return { ...state, pendingMerchant: null };
    }

    case 'LEAVE_GATE': {
      if (state.screen !== 'floor') return state;
      return {
        ...state,
        expedition: null,
        expeditionExtras: [],
        pendingMerchant: null,
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
        if (result.tamed.nickname === species) {
          result.tamed.nickname = bestowName();
          lines.push(`You give the ${species} a name: ${result.tamed.nickname}.`);
        } else {
          // Legends keep the name the world gave them.
          lines.push(`${result.tamed.nickname} keeps its name. Some things are not yours to rename.`);
        }
        // Playtest finding: fresh tames died in 1-3 fights. Bring them within
        // reach of the hero's danger band so adoption isn't a death sentence.
        const levelFloor = next.player!.level - 2;
        if (result.tamed.level < levelFloor) {
          while (result.tamed.level < levelFloor) result.tamed.gainExp(result.tamed.expToNext() - result.tamed.exp);
          result.tamed.hp = result.tamed.maxHp;
          lines.push(`${result.tamed.nickname} learns quickly at your side (now Lv${result.tamed.level}).`);
        }
        if (next.party.length < next.player!.traits.partyCap) {
          next.party.push(result.tamed);
          lines.push(`${result.tamed.nickname} walks beside you now. Its cards join your deck.`);
        } else if (next.stable.length < STABLE_CAP) {
          next.stable.push(result.tamed);
          lines.push(`${result.tamed.nickname} is sent to the stable.`);
        } else {
          lines.push(`The stable is full — ${result.tamed.nickname} watches you leave.`);
        }
        const b = next.battle!;
        if (b.enemies.some((e) => e.isAlive())) {
          // Packmates remain - the fight goes on without the newcomer.
          lines.push('The rest close ranks. This is not over.');
        } else {
          if (b.unitId && next.expedition) {
            const idx = next.expedition.units.findIndex((u) => u.id === b.unitId);
            if (idx >= 0) next.expedition.units.splice(idx, 1);
            if (b.unitKind === 'miniboss') {
              next.expedition.minibossDown = true;
              lines.push('The stairs release their keeper. The way down is open.');
            }
          }
          if (b.famousBeastId && next.world && !next.chronicle.beastsSlain.includes(b.famousBeastId)) {
            const beast = next.world.beasts.find((bb) => bb.id === b.famousBeastId);
            if (beast) {
              next.chronicle.beastsSlain.push(beast.id);
              next.chronicle.deeds.push({
                year: deedYear(next.world),
                text: `${next.player!.name} did not slay ${beast.name} ${beast.epithet} - they walked out of the dark together. The Chronicle has no word for this.`,
              });
            }
          }
          next.battle = null;
          next.screen = 'floor';
        }
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
      if (!availableQuests(state).some((q) => q.id === action.questId)) return state;
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
