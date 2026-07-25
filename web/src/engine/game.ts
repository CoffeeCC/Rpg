import type {
  CardInstance,
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
import { generateItem, forgeCharm, forgeTrinket, forgeUnique } from './systems/lootGen';
import { generateWorld, forgeArtifactItem } from './systems/worldgen';
import {
  newExpedition,
  newWildExpedition,
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
  revealLantern,
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
import { bankFall, bankTriumph, loadTellings, recordLedger, vaultKeepOnTriumph } from '../platform/tellings';
import { hasDrilled } from '../platform/drillRecord';
import { UNIQUES } from './data/uniques';
import { setCardIds, setStandings } from './data/sets';
import { TAME_LINES, BREEDING_COVENANT_LINES } from './data/covenantLore';
import { bindingById, depthByLevel, runModifiers, type RunModifiers } from './data/bindings';
import {
  DRILL_BEATS,
  DRILL_HALT_LINES,
  DRILL_HELD_LINE,
  DRILL_LEAVE_LINE,
  DRILL_NUDGE,
  DRILL_OPPONENT,
  DRILL_PASS_LINES,
  DRILL_REWARD,
  DRILL_TAME_LINE,
} from './data/drill';

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
  | 'cardCodex'
  | 'smith'
  | 'characterSheet'
  | 'monsterSheet'
  | 'equipment'
  | 'saveLoad'
  | 'victory'
  | 'fallen'
  /** v19: the duelling hall — Duel (vs AI) now, Versus (online) later. */
  | 'multiplayer';

export const MAX_ACTIVE_MONSTERS = 2;
export const STABLE_CAP = 20;
const ARTIFACT_CHEST_CHANCE = BALANCE.artifactChestChance;
const MAX_LOG_LINES = 80;
/** Flat verse award for carrying a telling all the way to the end of the book. */
const BALANCE_TRIUMPH_BASE = 25;
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

/** Bram's recruit drill, while it is running. See data/drill.ts for the lesson. */
export interface DrillState {
  /**
   * The live lesson, as a MONOTONIC CURSOR rather than something recomputed
   * from a bag of facts.
   *
   * It WAS the bag of facts, and simulating the drill across all four classes
   * is what showed that to be wrong: a lesson counted as taught the instant its
   * condition happened to be true, so a recruit who played a guard card in
   * turn one out of curiosity was never shown the block lesson at all. The runs
   * came out as beats [0,1,2,3,6] — the two most important readings in the
   * fight, block and the intent telegraph, silently skipped.
   *
   * A cursor fixes that by construction: a beat advances only on an action
   * taken WHILE IT IS SHOWING, so every lesson is put in front of the player at
   * least once before anything can satisfy it.
   */
  beat: number;
  /** `turnsTaken` when the current beat began — drives the patience clauses. */
  beatTurn: number;
  cardsPlayed: number;
  turnsTaken: number;
  /** An enemy-targeted card has resolved at some point. */
  aimed: boolean;
  /** Vigor has been run to nothing at least once. */
  spentOut: boolean;
  /** Block has been raised at least once. */
  guarded: boolean;
  /** A status has landed on the recruit — unlocks the (optional) aside. */
  sawStatus: boolean;
  /** Bram called a halt on what would have been a fall. */
  halted: boolean;
  outcome: 'running' | 'passed' | 'halted' | 'left';
}

function freshDrill(): DrillState {
  return {
    beat: 0,
    beatTurn: 0,
    cardsPlayed: 0,
    turnsTaken: 0,
    aimed: false,
    spentOut: false,
    guarded: false,
    sawStatus: false,
    halted: false,
    outcome: 'running',
  };
}

/** The live lesson. A plain read — the cursor is moved by `advanceBeat`. */
export function drillBeat(d: DrillState): number {
  return Math.max(0, Math.min(DRILL_BEATS.length - 1, d.beat));
}

/**
 * Move the cursor on, if the action that just happened satisfies the lesson
 * currently on screen. One beat per action, and only ever the beat being shown.
 *
 * The `waited` clauses are the anti-deadlock guarantee and they are not
 * decoration — playing this in a browser turned up a recruit who ended their
 * turn with vigor still on the table and sat on "spend the rest" forever,
 * never being taught end-turn, intents, block or the loss condition at all. A
 * tutorial beat that requires an optional action is a trap; one that requires a
 * card the shuffle may not have dealt is a worse one. So every lesson also
 * comes off after a turn or two regardless: Bram says the thing, the recruit
 * acts on it or does not, and the drill keeps moving.
 */
function advanceBeat(d: DrillState, ev: { aimedAtFoe?: boolean; endedTurn?: boolean; blockRaised?: boolean }): void {
  const waited = d.turnsTaken - d.beatTurn;
  const step = () => {
    d.beat += 1;
    d.beatTurn = d.turnsTaken;
  };
  switch (DRILL_BEATS[d.beat]?.id) {
    case 'strike':
      // No escape clause, deliberately. There is no drill without a first
      // card, and the ask says exactly what to do.
      if (ev.aimedAtFoe) step();
      break;
    case 'spend':
      // Spending out satisfies it — but so does simply ending the turn,
      // because holding vigor back is a legitimate choice, not a mistake, and
      // it must never strand anyone.
      if (d.spentOut || ev.endedTurn) step();
      break;
    case 'endTurn':
      if (ev.endedTurn) step();
      break;
    case 'intent':
      // Advances on the NEXT end-turn, so the telegraph has been on screen for
      // a full turn of the recruit's own before we stop explaining it.
      if (ev.endedTurn) step();
      break;
    case 'guard':
      if (ev.blockRaised || waited >= 2) step();
      break;
    case 'weakness':
      if (ev.aimedAtFoe || waited >= 2) step();
      break;
    case 'loss':
      break; // the last page; finishing the article is what ends the drill
  }
}

/** True while a drill battle is the fight on screen. */
export function inDrill(state: GameState): boolean {
  return !!state.drill && state.drill.outcome === 'running' && !!state.battle;
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
  /** v11: last story chapter Casque's free blessing was used in (-99 = never). */
  blessingChapter: number;
  orbs: GateId[];
  defeatedBosses: GateId[];
  questLog: QuestProgress[];
  gearStock: ItemV2[];
  world: GeneratedWorld | null;
  chronicle: ChronicleState;
  lastTalk: TavernLine | null;
  /** Badge bookkeeping: what the player has already seen in town (PLAN5 #52). */
  seen: { questCount: number; tavernChapter: number };
  /** Unique per run — used to bank Tellings verses exactly once on death. */
  runId: string;
  /** Which party/stable monster the monster sheet is showing. */
  selectedMonsterUid: string | null;
  /** Set when the run ends (PLAN5 #49): the Fallen screen's summary. */
  fallenSummary: { verses: number; level: number; orbs: number; beasts: number } | null;
  /** Transient FX from the last battle action — consumed by the UI, never saved. */
  lastFx: FxEvent[];
  /**
   * v19: duelling record. Optional so saves written before duels existed load
   * untouched. The MATCH itself never lives here — a duel is owned by its
   * DuelTransport (and, later, by the server), not by the single-player state.
   */
  duelRecord?: { wins: number; losses: number; draws: number };
  /**
   * The Next Draft (see src/engine/data/bindings.ts). The premise and the
   * Depth are read ONCE from the Tellings book at CREATE_CHARACTER and copied
   * here, so a run's shape can never shift under it because the player went
   * back to the desk mid-telling. Optional: saves written before the Next
   * Draft existed load as an unbound surface telling, which is exactly what
   * they were.
   */
  binding?: string | null;
  depth?: number;
  /** Species ids faced during THIS telling; folded into the Ledger at the desk and at run end. */
  discovered?: string[];
  /**
   * Bram's recruit drill. All three optional and safely defaulted, so a save
   * or a book written before the drill existed loads as "a tamer who has not
   * drilled this telling" — which is true, and costs them nothing but a note
   * on a board they were already reading.
   */
  drill?: DrillState | null;
  /** The drill has been passed in THIS telling. Gates the (one-time) payment. */
  drillDone?: boolean;
  /** The gentle nudge has already been made this telling. Never made twice. */
  drillNudged?: boolean;
  /**
   * This HUMAN has drilled before, in some earlier telling. Read once from the
   * watch-house sheet at CREATE_CHARACTER and copied here — the same idiom as
   * `binding` and `depth`, and for the same reason: the reducer must not go
   * reading localStorage on every action, and the answer must not change
   * under a telling that is already in progress.
   *
   * It suppresses the nudge and demotes the board notice. It never removes
   * the drill: a veteran who wants it again can always take it.
   */
  drillKnown?: boolean;
  log: string[];
}

export type GameAction =
  | { type: 'CREATE_CHARACTER'; name: string; race: RaceName; className: ClassName }
  | { type: 'STORY_CONTINUE' }
  | { type: 'GOTO'; screen: Screen }
  | { type: 'ENTER_GATE'; gateId: GateId }
  | { type: 'ENTER_WILDS'; gateId: GateId }
  | { type: 'MOVE'; dir: Direction }
  | { type: 'END_MAP_TURN' }
  | { type: 'MERCHANT_BUY'; what: 'consumable' | 'gear' | 'card'; index: number }
  | { type: 'MERCHANT_CLOSE' }
  | { type: 'FORGE_CHARM' }
  | { type: 'FORGE_TRINKET' }
  /**
   * Grude's back wall. The localStorage side of both of these has ALREADY
   * happened, in the Forge screen's click handler — see the note on
   * `withdrawFromVault`. These two cases only move the item between the hero's
   * bag and nowhere, and both are written to be no-ops on a second application
   * so StrictMode's double-invoke cannot duplicate or lose a piece.
   */
  | { type: 'VAULT_DEPOSIT'; uid: string }
  | { type: 'VAULT_WITHDRAW'; item: ItemV2 }
  /** Grude names the piece you are missing, for gold and a Legendary you are not using. */
  | { type: 'RECAST_SET_PIECE'; uid: string }
  | { type: 'OPEN_MONSTER'; uid: string }
  | { type: 'MONSTER_EQUIP'; monsterUid: string; itemUid: string }
  | { type: 'MONSTER_UNEQUIP'; monsterUid: string; slot: 'charm' | 'trinket' }
  | { type: 'MERCY_SPARE' }
  | { type: 'MERCY_FINISH' }
  | { type: 'LEAVE_GATE' }
  | { type: 'REST' }
  | { type: 'BLESSING' }
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
  /** Bram's mock fight. Startable from the Watch Ledger, any number of times. */
  | { type: 'START_DRILL' }
  /** Walk out of the drill mid-lesson. Always available, never penalised. */
  | { type: 'DRILL_LEAVE' }
  | { type: 'UPGRADE_CARD'; cardId: string }
  | { type: 'LEGEND_SEEN' }
  | { type: 'DUEL_RESULT'; result: 'win' | 'loss' | 'draw'; opponent: string }
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
    blessingChapter: -99,
    orbs: [],
    defeatedBosses: [],
    questLog: [],
    gearStock: [],
    world: null,
    chronicle: { beastsSlain: [], artifactsFound: [], deeds: [] },
    lastTalk: null,
    seen: { questCount: 0, tavernChapter: 0 },
    runId: 'run0',
    selectedMonsterUid: null,
    fallenSummary: null,
    lastFx: [],
    binding: null,
    depth: 0,
    discovered: [],
    drill: null,
    drillDone: false,
    drillNudged: false,
    log: [],
  };
}

/**
 * The premise this telling is being played under. Cheap enough to recompute
 * per call, and recomputing keeps it impossible for a stale merged copy to
 * drift away from the state it came from.
 */
export function modsOf(state: GameState): RunModifiers {
  return runModifiers(state.binding, state.depth);
}

/**
 * The cards a hero's matched gear is putting in the deck right now.
 *
 * Recomputed at the top of every battle rather than cached anywhere, because
 * the Gear screen is reachable mid-expedition: a player who swaps the fourth
 * piece of a set on between two fights must walk into the next one holding what
 * they just earned. Reading the worn equipment directly is what makes that
 * free — there is no stored copy that can go stale, and nothing to persist.
 */
function setCardsFor(player: Character): string[] {
  return setCardIds(Object.values(player.equipment));
}

/**
 * The set pieces this hero is missing from sets they have already begun.
 *
 * Handed to `generateItem` so a Legendary roll leans toward completing what is
 * already started. Counts pieces in the bag as well as worn ones: a player who
 * has just pulled a piece off Grude's wall and not equipped it yet is still
 * mid-set, and the dark should know that.
 */
function setAffinityFor(player: Character): string[] {
  const out: string[] = [];
  for (const standing of setStandings(Object.values(player.equipment), player.items)) {
    const have = new Set([...standing.wornIds, ...standing.bagIds]);
    for (const id of standing.set.members) {
      if (!have.has(id)) out.push(id);
    }
  }
  return out;
}

/**
 * What Grude could name for you right now: the pieces missing from sets you
 * have already begun, and only those she could plausibly have seen at your
 * depth (the same `minIlvl + 2` window a drop uses, so the recast can never
 * hand a level-3 hero a piece the gates would not have shown them).
 *
 * Exported because the Forge screen must be able to say whether the service is
 * available BEFORE the player pays for it.
 */
export function recastCandidates(player: Character): string[] {
  return setAffinityFor(player).filter((id) => {
    const def = UNIQUES.find((u) => u.id === id);
    return !!def && def.minIlvl <= player.level + 2;
  });
}

/**
 * The recast price. Steep on purpose: it is the deterministic path to finishing
 * a set, and it already consumes a Legendary on top of the gold. Late-game gold
 * has few sinks left once the deck is reforged, which is exactly the hole this
 * fills.
 */
export function recastCost(player: Character): number {
  return 250 + player.level * 20;
}

/** Note a species as faced. Mutates the (already cloned) state; set-union, so safe to repeat. */
function discover(state: GameState, speciesIds: (string | undefined)[]): void {
  if (!state.discovered) state.discovered = [];
  for (const id of speciesIds) {
    if (id && !state.discovered.includes(id)) state.discovered.push(id);
  }
}

/** v11: a bed at the Held Breath. Scales with level so rest stays a decision. */
export function restCost(player: Character): number {
  return 10 + player.level * 4;
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
          revealed: [...state.expedition.revealed],
          units: state.expedition.units.map((u) => ({ ...u })),
          wild: state.expedition.wild ? { seed: state.expedition.wild.seed, floors: [...state.expedition.wild.floors] } : undefined,
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
    seen: { ...state.seen },
    lastFx: [],
    discovered: [...(state.discovered ?? [])],
    drill: state.drill ? { ...state.drill } : null,
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

  const mods = modsOf(state);
  // A Depth reads the same page with older things living on it.
  const spawn = mods.enemyLevelBonus
    ? { ...floor.spawn, levelBonus: floor.spawn.levelBonus + mods.enemyLevelBonus }
    : floor.spawn;

  if (opts.boss) {
    enemies = [MonsterInstance.createBoss(gate.bossFamily, gate.bossTier, gate.bossName, gate.bossLevel + mods.enemyLevelBonus)];
    log.push(`${gate.bossName} bars the way.`);
  } else {
    const count =
      1 +
      (randInt(100) < BALANCE.packOf2Pct ? 1 : 0) +
      (randInt(100) < BALANCE.packOf3Pct ? 1 : 0) +
      mods.packBonus;
    enemies = [];
    for (let i = 0; i < count; i++) {
      // Elites forced by a Binding are Alphas, never Rares: a Rare lead is the
      // famous-beast substitution hook below, and legends should stay rationed.
      const lead = opts.forceRarity ?? (randInt(100) < mods.eliteChance ? ('Alpha' as const) : undefined);
      enemies.push(MonsterInstance.createWild(spawn, i === 0 ? lead : undefined));
    }
    // Famous beast substitution: a Rare spawn in a haunted gate becomes the legend.
    if (state.world && enemies[0].rarity === 'Rare') {
      const beast = state.world.beasts.find((b) => b.gateId === state.expedition!.gateId && !state.chronicle.beastsSlain.includes(b.id));
      if (beast) {
        const legend = new MonsterInstance({
          speciesId: beast.speciesId,
          level: 3 + spawn.levelBonus + beast.might,
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
    // The Covenant Kept: the dark is minded to be kept this telling. Applied at
    // spawn, and a failed offer never clears it, so it holds all encounter.
    if (mods.wildTameBonus) for (const e of enemies) e.tameBonus += mods.wildTameBonus;
  }

  discover(state, enemies.map((e) => e.speciesId));

  state.battle = startBattle(state.player, state.party, enemies, {
    isBossFight: !!opts.boss,
    gateId: state.expedition.gateId,
    // Matched gear rides in alongside the Boon cards, and is rebuilt from the
    // worn pieces every time rather than kept on the state.
    expeditionExtras: [...state.expeditionExtras, ...setCardsFor(state.player)],
    famousBeastId,
  });
  state.screen = 'battle';
}

/**
 * Decide what the deck carries INTO an expedition.
 *
 * The base rule is that Boon cards last exactly one expedition. The Long
 * Memory suspends that rule for a whole telling — which is the single largest
 * shape change any premise makes, because it turns each gate into a step in
 * one growing deck instead of five separate ten-card runs. The Borrowed Page
 * instead hands you three cards you did not choose, every time.
 */
function openExpeditionDeck(state: GameState, lines: string[]): void {
  const mods = modsOf(state);
  const kept = mods.keepCards ? [...state.expeditionExtras] : [];
  const seeded: string[] = [];
  let guard = 0;
  while (seeded.length < mods.seedCards && guard++ < 60) {
    const pool = randInt(100) < 65 ? REWARD_POOLS.uncommon : REWARD_POOLS.rare;
    const id = pool[randInt(pool.length)];
    if (getCard(id)) seeded.push(id);
  }
  state.expeditionExtras = [...kept, ...seeded];
  if (kept.length) lines.push(`The telling has not forgotten: ${kept.length} card${kept.length === 1 ? '' : 's'} carried through from before.`);
  if (seeded.length) {
    lines.push(`Someone else's cards are already in your hand: ${seeded.map((id) => getCard(id)!.name).join(', ')}.`);
  }
}

/**
 * Leaving a gate alive. Normally the Boon cards fade on the way out; under
 * The Long Memory they come home with you. Both exits from a gate (walking
 * back out of the entrance, and burning a Witchwick) route through here so the
 * premise cannot be dodged by picking the other door.
 */
function closeExpeditionDeck(state: GameState, lines: string[], fadeLine: string): void {
  if (modsOf(state).keepCards && state.expeditionExtras.length) {
    lines.push(`The cards do not fade. This telling keeps what it was given (${state.expeditionExtras.length} held).`);
    return;
  }
  state.expeditionExtras = [];
  lines.push(fadeLine);
}

/**
 * How many cards a Boon lays out. Never below one: a premise may make the
 * choice harder, but it may never take the choice away entirely.
 */
export function rewardChoiceCount(state: GameState): number {
  return Math.max(1, (state.player?.traits.rewardChoices ?? 3) + modsOf(state).rewardDelta);
}

function offerReward(state: GameState): void {
  const mods = modsOf(state);
  const roll = (): string => {
    const r = randInt(100);
    // The Thin Ledger buys nothing in town, so the dark deals in better cards.
    const pool = mods.richPools
      ? r < 25
        ? REWARD_POOLS.common
        : r < 70
          ? REWARD_POOLS.uncommon
          : REWARD_POOLS.rare
      : r < 60
        ? REWARD_POOLS.common
        : r < 90
          ? REWARD_POOLS.uncommon
          : REWARD_POOLS.rare;
    return pool[randInt(pool.length)];
  };
  const offered = new Set<string>();
  const choices = rewardChoiceCount(state);
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

  const mods = modsOf(state);
  const spawn = mods.enemyLevelBonus
    ? { ...floor.spawn, levelBonus: floor.spawn.levelBonus + mods.enemyLevelBonus }
    : floor.spawn;

  if (unit.kind === 'miniboss') {
    enemies = [
      new MonsterInstance({
        speciesId: unit.speciesId!,
        level: (unit.level ?? 3) + mods.enemyLevelBonus,
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
      const m = MonsterInstance.createWild(spawn);
      m.nickname = bestowName();
      // Loyalty: a bonded beast does not yield to a stranger easily.
      m.tameBonus = (state.player.traits.charmedTongue ? -15 : -30) + mods.wildTameBonus;
      enemies.push(m);
    }
    lines.push(`${unit.label} whistles, and their beasts answer. "Show me yours."`);
  } else {
    enemies = [new MonsterInstance({ speciesId: unit.speciesId!, level: (unit.level ?? 1) + mods.enemyLevelBonus })];
    if (randInt(100) < BALANCE.packOf2Pct || mods.packBonus > 0) enemies.push(MonsterInstance.createWild(spawn));
    if (mods.wildTameBonus) for (const e of enemies) e.tameBonus += mods.wildTameBonus;
    lines.push(`${unit.label} is upon you.`);
  }

  discover(state, enemies.map((e) => e.speciesId));

  state.battle = startBattle(state.player, state.party, enemies, {
    isBossFight: false,
    gateId: exp.gateId,
    expeditionExtras: [...state.expeditionExtras, ...setCardsFor(state.player)],
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


/** Shared adoption path for taming and spared mercy monsters (PLAN5 #55). */
function adoptMonster(state: GameState, tamed: MonsterInstance, lines: string[]): void {
  applyQuestEvent(state.questLog, { type: 'tame' }, lines);
  const species = tamed.species.name;
  if (tamed.nickname === species) {
    tamed.nickname = bestowName();
    lines.push(`You give the ${species} a name: ${tamed.nickname}.`);
  } else {
    lines.push(`${tamed.nickname} keeps its name. Some things are not yours to rename.`);
  }
  // v11: the Covenant of Names — every taming is a promise the dusk counts.
  const covenantLine = TAME_LINES[(state.party.length + state.stable.length) % TAME_LINES.length];
  lines.push(covenantLine.replaceAll('{monster}', species).replaceAll('{name}', state.player!.name));
  // The Covenant Kept: a beast that agrees to be kept does not start behind you.
  const levelFloor = state.player!.level - (modsOf(state).tamedAtLevel ? 0 : 2);
  if (tamed.level < levelFloor) {
    while (tamed.level < levelFloor) tamed.gainExp(tamed.expToNext() - tamed.exp);
    tamed.hp = tamed.maxHp;
    lines.push(`${tamed.nickname} learns quickly at your side (now Lv${tamed.level}).`);
  }
  if (state.party.length < state.player!.traits.partyCap) {
    state.party.push(tamed);
    lines.push(`${tamed.nickname} walks beside you now. Its cards join your deck.`);
  } else if (state.stable.length < STABLE_CAP) {
    state.stable.push(tamed);
    lines.push(`${tamed.nickname} is sent to the stable.`);
  } else {
    lines.push(`The stable is full — ${tamed.nickname} watches you leave.`);
  }
}

/** End a battle that concluded without a kill (tame or mercy): units die on the map anyway. */
function endBattlePeacefully(state: GameState, lines: string[]): void {
  const b = state.battle!;
  if (b.unitId && state.expedition) {
    const idx = state.expedition.units.findIndex((u) => u.id === b.unitId);
    if (idx >= 0) state.expedition.units.splice(idx, 1);
    if (b.unitKind === 'miniboss') {
      state.expedition.minibossDown = true;
      lines.push('The stairs release their keeper. The way down is open.');
    }
  }
  if (b.famousBeastId && state.world && !state.chronicle.beastsSlain.includes(b.famousBeastId)) {
    const beast = state.world.beasts.find((bb) => bb.id === b.famousBeastId);
    if (beast) {
      state.chronicle.beastsSlain.push(beast.id);
      state.chronicle.deeds.push({
        year: deedYear(state.world),
        text: `${state.player!.name} did not slay ${beast.name} ${beast.epithet} - they walked out of the dark together. The Chronicle has no word for this.`,
      });
    }
  }
  state.battle = null;
  state.screen = 'floor';
}

function handleDefeat(state: GameState, log: string[]): void {
  // PLAN5 #49: death is real now. The run ends; the Chronicler banks Verses.
  const player = state.player!;
  const mods = modsOf(state);
  const verses = Math.round(
    (player.level +
      state.orbs.length * 2 +
      state.chronicle.beastsSlain.length +
      state.questLog.filter((q) => q.claimed).length) *
      mods.verseMult,
  );
  const place = state.battle?.gateId ? GATES[state.battle.gateId].name : state.expedition ? GATES[state.expedition.gateId].name : 'the road';
  bankFall(state.runId, verses, { name: player.name, place, level: player.level });
  // Everything this draft showed the Chronicler is kept, even though it failed.
  // Set-union, so calling it here as well as at the desk costs nothing.
  recordLedger({ species: state.discovered ?? [], wardens: state.defeatedBosses });
  state.fallenSummary = {
    verses,
    level: player.level,
    orbs: state.orbs.length,
    beasts: state.chronicle.beastsSlain.length,
  };
  state.battle = null;
  state.expedition = null;
  state.expeditionExtras = [];
  state.pendingReward = null;
  state.pendingMerchant = null;
  state.screen = 'fallen';
  log.push('The dark takes what it is owed. Somewhere in Everdusk, the Chronicler dips a quill.');
}

// ---------------------------------------------------------------------------
// The recruit drill. Lines and lesson live in data/drill.ts.
// ---------------------------------------------------------------------------

/**
 * Build the article the watch keeps penned, and start a REAL fight with it.
 *
 * The whole point of the drill is that it is not a slideshow: this goes
 * through `startBattle` like every other encounter, so the player learns the
 * actual battlefield with the actual cards from their actual deck, and the
 * one renderer in BattleScreen needs no idea any of this is happening.
 *
 * Two dials make it safe, and they are the only two:
 *   * HP up. A level-1 goober dies to one good opening turn, which would end
 *     the lesson three beats in. 60 is about four turns of a starting deck.
 *   * Attack down. `deriveStats` floors every stat at 1, so a large negative
 *     STR bonus reliably produces the smallest swing the game can express.
 * Neither of these is a guarantee, so there is a third dial that IS one —
 * see `haltDrill`, which makes a fall structurally impossible rather than
 * merely unlikely.
 */
function beginDrill(state: GameState, lines: string[]): void {
  if (!state.player) return;
  const exhibit = new MonsterInstance({
    speciesId: DRILL_OPPONENT.speciesId,
    level: 1,
    nickname: DRILL_OPPONENT.nickname,
    bonusStats: { ...EMPTY_DRILL_STATS, STR: DRILL_OPPONENT.strPenalty },
    personalityId: DRILL_OPPONENT.personalityId,
  });
  exhibit.maxHp = DRILL_OPPONENT.hp;
  exhibit.hp = DRILL_OPPONENT.hp;

  // The recruit walks in whole and alone. No party — the drill teaches the
  // hero's own cards, and a beast in the line would add a second HP bar, a
  // second set of cards and the two-active limit to a lesson that is already
  // seven beats long. It also means nothing the player owns can be hurt here.
  const battle = startBattle(state.player, [], [exhibit], {
    isBossFight: false,
    gateId: null,
    expeditionExtras: [],
  });

  // Take the taming card out of the yard.
  //
  // `buildDeck` puts Reach Out in every deck unconditionally, and simulating
  // the drill across all four classes showed what that does here: the tame
  // roll against a docile level-1 goober lands often, and a landed tame ENDS
  // THE FIGHT — so a recruit could finish the tutorial at beat one, having
  // been taught nothing, and be paid for it. Removing it is also the correct
  // fiction: Bram would not issue a recruit a taming card in a yard containing
  // watch property. Cards are pulled from the draw pile and any that were
  // dealt are swapped for replacements, so the opening hand keeps its size.
  const isTame = (c: CardInstance) => c.cardId === TAME_CARD_ID;
  battle.drawPile = battle.drawPile.filter((c) => !isTame(c));
  const dealtTames = battle.hand.filter(isTame).length;
  battle.hand = battle.hand.filter((c) => !isTame(c));
  for (let i = 0; i < dealtTames && battle.drawPile.length > 0; i++) {
    battle.hand.push(battle.drawPile.pop()!);
  }

  state.battle = battle;
  state.drill = freshDrill();
  state.screen = 'battle';
  lines.push('Watch Captain Bram opens the ledger to a clean page. "Drill begins."');
}

const EMPTY_DRILL_STATS = { STR: 0, DEF: 0, DEX: 0, MANA: 0, MAGDEF: 0, INT: 0, LUCK: 0 };

/**
 * Fold what just happened into the drill's counters.
 *
 * Called after every battle action while a drill is running. Every field is a
 * plain observation of state that already exists — nothing here decides what
 * the player is being taught, it only records what they did. `drillBeat` does
 * the deciding, from these facts alone.
 */
function noteDrillProgress(state: GameState, ev: { played?: boolean; aimedAtFoe?: boolean; endedTurn?: boolean }): void {
  const d = state.drill;
  const b = state.battle;
  if (!d || !b || d.outcome !== 'running') return;
  if (ev.played) d.cardsPlayed += 1;
  if (ev.aimedAtFoe) d.aimed = true;
  if (ev.endedTurn) d.turnsTaken += 1;
  // Block raised THIS action is what teaches the guard lesson — the standing
  // fact "has block right now" would also be true of block raised two turns
  // ago and would tick the lesson off without it ever being read.
  const blockRaised = b.heroBlock > 0 && !d.guarded;
  if (b.heroBlock > 0) d.guarded = true;
  if ((state.player?.statusEffects.length ?? 0) > 0) d.sawStatus = true;
  // "Out of vigor" also covers the honest case where the candles are lit but
  // nothing in hand is affordable — a recruit must not be told to keep
  // spending money they cannot spend.
  const affordable = b.hand.some((inst) => (getCard(inst.cardId)?.cost ?? 99) <= b.energy);
  if (b.energy <= 0 || !affordable) d.spentOut = true;
  advanceBeat(d, { aimedAtFoe: ev.aimedAtFoe, endedTurn: ev.endedTurn, blockRaised });
}

/**
 * Close the drill and put the recruit back on the board, whole.
 *
 * ALWAYS restores: the hero leaves the yard at full health with no statuses
 * and no lingering stat mods, whatever happened in it. A tutorial that leaves
 * you poisoned and at nine hit points has taught you the wrong lesson about
 * whether it was safe to try.
 *
 * Pays exactly once per telling (`drillDone`). Repeating the drill is free,
 * encouraged, and worth nothing — which is the correct incentive: it is there
 * for the confused, not for the efficient.
 */
function endDrill(state: GameState, outcome: DrillState['outcome'], lines: string[]): void {
  const player = state.player;
  state.battle = null;
  state.screen = 'questBoard';
  if (state.drill) state.drill = { ...state.drill, outcome };
  if (player) {
    player.hp = player.maxHp;
    player.statusEffects = [];
    player.activeMods = [];
  }
  if (outcome !== 'passed') return;

  if (state.drillDone) {
    lines.push('Bram makes a mark, then crosses it out. "Already logged. The ledger pays a thing once."');
    return;
  }
  state.drillDone = true;
  lines.push(...DRILL_PASS_LINES);
  if (player) {
    player.addGold(DRILL_REWARD.gold);
    player.addConsumable(DRILL_REWARD.consumable.name, DRILL_REWARD.consumable.count);
    lines.push(
      `The watch pays its recruits: +${DRILL_REWARD.gold}g, and ${DRILL_REWARD.consumable.count}× ${DRILL_REWARD.consumable.name} from the guardhouse stores.`,
    );
  }
}

/**
 * Hold the article up until the lesson is finished.
 *
 * Returns true if the "victory" that just happened was premature and has been
 * refused. The drill's length must be the LESSON's length: simulation showed a
 * Thief emptying any pool a Bard could clear in a tolerable number of turns, so
 * pacing cannot live in the hit points. It lives here, and Bram announces it.
 */
function holdArticleUp(state: GameState, lines: string[]): boolean {
  const d = state.drill;
  const foe = state.battle?.enemies[0];
  if (!d || !foe || d.beat >= DRILL_BEATS.length - 1) return false;
  foe.hp = 1;
  // Said once, not every time a card lands on a dummy that will not fall.
  if (!lines.includes(DRILL_HELD_LINE) && !state.log.includes(DRILL_HELD_LINE)) lines.push(DRILL_HELD_LINE);
  return true;
}

/**
 * The hard non-lethality guarantee.
 *
 * The soft dials in `beginDrill` make a fall unlikely; this makes it
 * impossible. A drill can never reach `handleDefeat`, so it can never bank a
 * fall, never end a telling and never write a page in the Chronicler's book.
 * A tutorial that can close your run is not a tutorial, it is an ambush.
 *
 * It is not silently swallowed, though — Bram calls the halt out loud and
 * names what would have happened, which is the loss-condition lesson taught by
 * demonstration instead of by casualty.
 */
function haltDrill(state: GameState, lines: string[]): void {
  if (state.drill) state.drill.halted = true;
  lines.push(...DRILL_HALT_LINES);
  endDrill(state, 'halted', lines);
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
        const item = generateItem(player.level + outcome.ilvlBonus, player.effectiveStat('LUCK'), 1, setAffinityFor(player));
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
  const next = gameReducerCore(state, action);
  // Single choke point for the fog-of-war reveal: cheaper and far less
  // error-prone than calling revealLantern() at every one of MOVE's many
  // early-return branches (bump, smash, stairs, ascend...). revealLantern()
  // returns the same Expedition reference when nothing new is lit, so this
  // stays a no-op (no extra re-renders) on actions that don't move the hero.
  if (next.player && next.expedition) {
    const revealed = revealLantern(next.expedition, next.player);
    if (revealed !== next.expedition) return { ...next, expedition: revealed };
  }
  return next;
}

function gameReducerCore(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'CREATE_CHARACTER': {
      const player = new Character(action.name, action.race, action.className);
      // The Chronicler remembers previous tellings (PLAN5 #49).
      const meta = loadTellings();
      if (meta.purchased.includes('provisioned')) player.gold += 40;
      if (meta.purchased.includes('cellar')) {
        player.addConsumable('Herb', 2);
        player.addConsumable('Jerky', 1);
      }
      if (meta.purchased.includes('scars')) {
        player.stats.STR += 2;
        player.stats.DEF += 2;
      }
      if (meta.purchased.includes('oil')) player.stats.DEX += 4;
      if (meta.purchased.includes('lantern-luck')) player.stats.LUCK += 4;

      // The Next Draft: the premise the Chronicler wrote in before you began.
      // Read ONCE, here, and copied onto the state — going back to the desk
      // mid-telling must never reshape the telling you are already inside.
      const binding = bindingById(meta.binding);
      const depth = depthByLevel(meta.depth);
      const mods = runModifiers(meta.binding, meta.depth);
      // A premise outranks a boon: The Thin Ledger empties the purse even if
      // Well-Provisioned filled it, because that is the whole of the premise.
      if (mods.startGold !== null) player.gold = mods.startGold;

      player.recomputeDerived();
      player.hp = player.maxHp;
      const next = initialGameState();
      next.runId = `run-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6)}`;
      const seed = (Date.now() ^ (Math.random() * 0x7fffffff)) >>> 0;
      next.world = generateWorld(seed);
      next.player = player;
      next.screen = 'town';
      next.pendingStory = 0;
      next.storyChapter = 0;
      next.binding = meta.binding;
      next.depth = meta.depth;
      next.discovered = [];
      // Same read-once idiom as the premise above: whether this HUMAN has been
      // taught combat is settled at character creation and does not move again.
      next.drillKnown = hasDrilled();
      next.gearStock = restockGear(player);
      next.log = [`The realm of ${next.world.name} takes its shape around Everdusk. Welcome, ${player.name}.`];

      if (mods.startCompanion) {
        const companion = MonsterInstance.createWild(GATES.verdant.floors[0].spawn);
        companion.nickname = bestowName();
        companion.isTamed = true;
        companion.hp = companion.maxHp;
        companion.mp = companion.maxMp;
        next.party.push(companion);
        next.discovered.push(companion.speciesId);
        next.log.push(`${companion.nickname} the ${companion.species.name} was waiting at the road, and does not explain itself.`);
      }
      if (binding) next.log.push(`This telling is bound: ${binding.name}. ${binding.terms}`);
      if (depth.depth > 0) next.log.push(`Read at ${depth.name}. ${depth.terms}`);
      return next;
    }

    case 'STORY_CONTINUE': {
      if (state.pendingStory === null) return state;
      const finished = state.pendingStory;
      if (finished === 5 && state.player) {
        // A telling that reaches the end of the book was, until now, worth
        // nothing at the desk: the Victory screen restarts without banking or
        // turning the page, so winning cost you a telling's verses. Bank it
        // here instead. Idempotent per runId, same guard as a death.
        const mods = modsOf(state);
        const verses = Math.round(
          (BALANCE_TRIUMPH_BASE +
            state.player.level * 2 +
            state.orbs.length * 3 +
            state.chronicle.beastsSlain.length +
            state.questLog.filter((q) => q.claimed).length) *
            mods.verseMult,
        );
        recordLedger({ species: state.discovered ?? [], wardens: state.defeatedBosses });
        bankTriumph(state.runId, verses, { name: state.player.name, level: state.player.level, depth: state.depth ?? 0 });
        // A telling that reached the end leaves what it was carrying on the
        // back wall. Only a triumph does this; the dark keeps what a death was
        // holding. Idempotent per runId, on the wall's own guard.
        vaultKeepOnTriumph(state.runId, [
          ...Object.values(state.player.equipment).filter((i): i is ItemV2 => !!i),
          ...state.player.items,
        ]);
      }
      return { ...state, pendingStory: null, screen: finished === 5 ? 'victory' : state.screen };
    }

    case 'GOTO': {
      if (!state.player) return state;
      if (state.screen === 'battle' || state.screen === 'event' || state.screen === 'cardReward') return state;
      const seen = { ...state.seen };
      if (action.screen === 'questBoard') seen.questCount = availableQuests(state).length;
      if (action.screen === 'tavern') seen.tavernChapter = Math.max(seen.tavernChapter, state.storyChapter);
      // Paul's "before we leave for a gate": the one and only auto-suggestion,
      // fired when a tamer who has never drilled first goes looking at gates.
      // It is a LINE, not a gate — nothing is blocked, nothing is modal, and a
      // player who wants to just go simply keeps walking. Once per telling.
      if (
        action.screen === 'gateSelect' &&
        !state.drillKnown &&
        !state.drillDone &&
        !state.drillNudged
      ) {
        return {
          ...state,
          screen: action.screen,
          lastTalk: null,
          seen,
          drillNudged: true,
          log: pushLog(state.log, DRILL_NUDGE),
        };
      }
      return { ...state, screen: action.screen, lastTalk: null, seen };
    }

    case 'ENTER_GATE': {
      if (!state.player || state.screen !== 'gateSelect') return state;
      const gate = GATES[action.gateId];
      if (state.orbs.length < gate.requiredOrbs) return state;
      const next = cloneCore(state);
      next.expedition = newExpedition(action.gateId, next.world, next.chronicle, next.party.length + next.stable.length > 0);
      next.expedition.movLeft = movFor(next.player!);
      const entryLines = [`You step through the ${gate.name}.`];
      openExpeditionDeck(next, entryLines);
      next.screen = 'floor';
      next.log = pushLog(state.log, ...entryLines);
      applyQuestEvent(next.questLog, { type: 'reachFloor', gate: action.gateId, floor: 1 }, next.log);
      return next;
    }

    case 'ENTER_WILDS': {
      // Only past a Warden you've already felled — the Wilds are what lies
      // beyond ground you've already mapped, not a shortcut around it.
      if (!state.player || state.screen !== 'gateSelect') return state;
      if (!state.defeatedBosses.includes(action.gateId)) return state;
      const gate = GATES[action.gateId];
      const next = cloneCore(state);
      const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
      next.expedition = newWildExpedition(action.gateId, seed, next.world, next.chronicle, next.party.length + next.stable.length > 0);
      next.expedition.movLeft = movFor(next.player!);
      const wildLines = [`You leave the mapped floors of the ${gate.name} behind. The dark ahead has no name yet.`];
      openExpeditionDeck(next, wildLines);
      next.screen = 'floor';
      next.log = pushLog(state.log, ...wildLines);
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
          next.expedition = descend(exp, next.world, next.chronicle, next.party.length + next.stable.length > 0);
          next.expedition.movLeft = movFor(next.player!);
          const floorNumber = next.expedition.floorIndex + 1;
          lines.push(`Deeper. Floor ${floorNumber}.`);
          applyQuestEvent(next.questLog, { type: 'reachFloor', gate: exp.gateId, floor: floorNumber }, lines);
          next.log = pushLog(state.log, ...lines);
          return next;
        }
        case TILE.START: {
          if (exp.floorIndex > 0) {
            next.expedition = ascend(exp, next.world, next.chronicle, next.party.length + next.stable.length > 0);
            next.expedition.movLeft = movFor(next.player!);
            lines.push(`You climb back up. Floor ${next.expedition.floorIndex + 1}.`);
          } else {
            next.expedition = null;
            next.pendingMerchant = null;
            next.screen = 'town';
            lines.push('You step back through the gate into Everdusk.');
            closeExpeditionDeck(next, lines, 'The expedition cards fade like a dream on waking.');
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
              const item = generateItem(
                next.player!.level + floor.spawn.levelBonus + 1,
                next.player!.effectiveStat('LUCK'),
                1,
                setAffinityFor(next.player!),
              );
              next.player!.addItem(item);
              lines.push(`The chest yields ${item.name} [${item.rarity}].`);
            }
          }
          break;
        }
        case TILE.SECRET: {
          if (!isOpened(exp, tx, ty)) {
            exp.opened.push(openKey(exp, tx, ty));
            const item = generateItem(
              next.player!.level + floor.spawn.levelBonus + 2,
              next.player!.effectiveStat('LUCK'),
              2,
              setAffinityFor(next.player!),
            );
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

    case 'FORGE_CHARM': {
      if (!state.player || state.screen !== 'smith') return state;
      const cost = 90 + state.player.level * 10;
      const next = cloneCore(state);
      if (!next.player!.spendGold(cost)) {
        next.log = pushLog(state.log, 'The smith names a price your purse cannot argue with.');
        return next;
      }
      const charm = forgeCharm(next.player!.level, next.player!.effectiveStat('LUCK'));
      next.player!.addItem(charm);
      next.log = pushLog(state.log, `The smith works in silence, then hands you ${charm.name}. "For one of yours. Not for you."`);
      return next;
    }

    case 'FORGE_TRINKET': {
      if (!state.player || state.screen !== 'smith') return state;
      const cost = 110 + state.player.level * 12;
      const next = cloneCore(state);
      if (!next.player!.spendGold(cost)) {
        next.log = pushLog(state.log, 'The smith names a price your purse cannot argue with.');
        return next;
      }
      const trinket = forgeTrinket(next.player!.level, next.player!.effectiveStat('LUCK'));
      next.player!.addItem(trinket);
      next.log = pushLog(state.log, `The smith threads ${trinket.name} onto a cord. "A small kindness for a small companion."`);
      return next;
    }

    case 'VAULT_DEPOSIT': {
      if (!state.player || state.screen !== 'smith') return state;
      const next = cloneCore(state);
      const idx = next.player!.items.findIndex((i) => i.uid === action.uid);
      // Already gone: this is the second pass of a double-invoke, and the
      // piece is safely on the wall. Nothing to do and nothing to report.
      if (idx === -1) return state;
      const [item] = next.player!.items.splice(idx, 1);
      next.log = pushLog(
        state.log,
        `Grude takes ${item.name} without comment and finds it a place on the back wall. It is not yours for the rest of this telling.`,
      );
      return next;
    }

    case 'VAULT_WITHDRAW': {
      if (!state.player || state.screen !== 'smith') return state;
      // Same guard from the other direction: if the piece is already in the
      // bag, the wall has already given it up and this pass must not add a
      // second copy.
      if (state.player.items.some((i) => i.uid === action.item.uid)) return state;
      const next = cloneCore(state);
      next.player!.addItem(action.item);
      next.log = pushLog(state.log, `She lifts ${action.item.name} down off the wall and puts it in your hands. "Mind it."`);
      return next;
    }

    case 'RECAST_SET_PIECE': {
      if (!state.player || state.screen !== 'smith') return state;
      const player = state.player;
      const offering = player.items.find((i) => i.uid === action.uid);
      // The offering must be Legendary — she melts a named thing to make
      // another named thing, and will not do it with ordinary stock.
      if (!offering || offering.rarity !== 'Legendary') return state;
      const wanted = recastCandidates(player);
      if (wanted.length === 0) return state;
      const cost = recastCost(player);
      const next = cloneCore(state);
      const idx = next.player!.items.findIndex((i) => i.uid === action.uid);
      if (idx === -1) return state;
      if (!next.player!.spendGold(cost)) {
        next.log = pushLog(state.log, 'The smith names a price your purse cannot argue with.');
        return next;
      }
      const forged = forgeUnique(wanted[randInt(wanted.length)], next.player!.level);
      if (!forged) return state;
      next.player!.items.splice(idx, 1);
      next.player!.addItem(forged);
      next.log = pushLog(
        state.log,
        `Grude turns ${offering.name} over twice, then puts it in the fire. What comes back out is ${forged.name}. "I knew the shape of it. I know all their shapes."`,
      );
      return next;
    }

    case 'OPEN_MONSTER': {
      if (!state.player) return state;
      if (![...state.party, ...state.stable].some((m) => m.uid === action.uid)) return state;
      return { ...state, selectedMonsterUid: action.uid, screen: 'monsterSheet' };
    }

    case 'MONSTER_EQUIP': {
      if (!state.player || (state.screen !== 'stable' && state.screen !== 'monsterSheet')) return state;
      const next = cloneCore(state);
      const monster = [...next.party, ...next.stable].find((m) => m.uid === action.monsterUid);
      const idx = next.player!.items.findIndex((i) => i.uid === action.itemUid && (i.slot === 'charm' || i.slot === 'trinket'));
      if (!monster || idx === -1) return state;
      const [acc] = next.player!.items.splice(idx, 1);
      const prev = acc.slot === 'trinket' ? monster.trinket : monster.charm;
      if (prev) next.player!.items.push(prev);
      if (acc.slot === 'trinket') monster.trinket = acc;
      else monster.charm = acc;
      monster.deriveStats();
      monster.hp = Math.min(monster.hp, monster.maxHp);
      next.log = pushLog(state.log, `${monster.nickname} wears ${acc.name} now.`);
      return next;
    }

    case 'MONSTER_UNEQUIP': {
      if (!state.player || (state.screen !== 'stable' && state.screen !== 'monsterSheet')) return state;
      const next = cloneCore(state);
      const monster = [...next.party, ...next.stable].find((m) => m.uid === action.monsterUid);
      if (!monster) return state;
      const acc = action.slot === 'trinket' ? monster.trinket : monster.charm;
      if (!acc) return state;
      next.player!.addItem(acc);
      if (action.slot === 'trinket') monster.trinket = null;
      else monster.charm = null;
      monster.deriveStats();
      monster.hp = Math.min(monster.hp, monster.maxHp);
      next.log = pushLog(state.log, `${monster.nickname} sets aside ${acc.name}.`);
      return next;
    }

    case 'MERCY_SPARE': {
      if (!state.player || !state.battle || !state.battle.mercy || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      const b = next.battle!;
      const monster = b.enemies.find((e) => e.uid === b.mercy!.uid);
      if (!monster) return state;
      const lines: string[] = [`You lower your hand. ${monster.displayName()} rises, changed.`];
      monster.isTamed = true;
      monster.tameBonus = 0;
      monster.hp = Math.max(1, Math.floor(monster.maxHp * 0.3));
      b.enemies = b.enemies.filter((e) => e.uid !== monster.uid);
      delete b.intents[monster.uid];
      delete b.enemyBlock[monster.uid];
      b.mercy = undefined;
      adoptMonster(next, monster, lines);
      if (b.enemies.some((e) => e.isAlive())) {
        lines.push('The rest close ranks. This is not over.');
      } else {
        endBattlePeacefully(next, lines);
      }
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'MERCY_FINISH': {
      if (!state.player || !state.battle || !state.battle.mercy || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      const b = next.battle!;
      const monster = b.enemies.find((e) => e.uid === b.mercy!.uid);
      if (!monster) return state;
      const lines: string[] = [`You finish it. ${monster.displayName()} does not look away. The dark keeps its accounts.`];
      monster.hp = 0;
      b.mercy = undefined;
      handleVictory(next, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'LEAVE_GATE': {
      // v11: no more free teleports home. Burn a Witchwick, or walk back to
      // the door you came in by (the START tile on floor 1 remains free).
      if (state.screen !== 'floor' || !state.player) return state;
      const next = cloneCore(state);
      if (!next.player!.removeConsumable('Witchwick')) {
        next.log = pushLog(state.log, 'No Witchwick to burn. The way home is the way you came in — or Maribel sells the shortcut.');
        return next;
      }
      next.expedition = null;
      next.pendingMerchant = null;
      next.screen = 'town';
      const homeLines = ['You burn the Witchwick down to the wax. The dusk folds once, politely, and you are home.'];
      closeExpeditionDeck(next, homeLines, 'The reward cards fade like a dream on waking.');
      next.log = pushLog(state.log, ...homeLines);
      return next;
    }

    case 'REST': {
      // v11: beds cost money. The body is a candle; wax is not free.
      if (!state.player || state.screen !== 'town') return state;
      const cost = restCost(state.player);
      if (state.player.gold < cost) {
        return { ...state, log: pushLog(state.log, `Dovey shakes her head. A bed is ${cost}g, and the roof does not run on gratitude.`) };
      }
      const next = cloneCore(state);
      next.player!.gold -= cost;
      healParty(next.player!, next.party);
      for (const m of next.stable) {
        m.hp = m.maxHp;
        m.mp = m.maxMp;
      }
      next.gearStock = restockGear(next.player!);
      next.log = pushLog(state.log, `Rest, of a kind, for ${cost}g. The gear shop has new stock.`);
      return next;
    }

    case 'BLESSING': {
      // v11: Brother Casque mends the party for free, once per story chapter.
      if (!state.player || state.screen !== 'town') return state;
      if (state.blessingChapter >= state.storyChapter) {
        return { ...state, log: pushLog(state.log, 'Casque folds his hands. "The candle I can spare, I have already spared. Come back when the story turns."') };
      }
      const next = cloneCore(state);
      next.blessingChapter = next.storyChapter;
      healParty(next.player!, next.party);
      for (const m of next.stable) {
        m.hp = m.maxHp;
        m.mp = m.maxMp;
      }
      next.log = pushLog(state.log, 'Brother Casque says the short version of the long prayer. Warmth, briefly, like standing near a kiln.');
      return next;
    }

    case 'PLAY_CARD': {
      if (!state.player || !state.battle || state.screen !== 'battle') return state;
      const next = cloneCore(state);
      const result = playCard(next.player!, next.party, next.battle!, action.handIndex, action.targetUid);
      next.lastFx = result.fx;
      const lines = [...result.log];

      reapFallen(next, lines);
      // The drill forks BEFORE any of the real consequences below: no spoils,
      // no quest credit, no adoption, no card reward. Nothing that happens in
      // the yard is entered against your name, exactly as Bram promises.
      if (next.drill && next.drill.outcome === 'running') {
        const aimedAtFoe = !!action.targetUid && state.battle.enemies.some((e) => e.uid === action.targetUid);
        noteDrillProgress(next, { played: true, aimedAtFoe });
        if (result.outcome === 'tamed') {
          // Defence in depth: `beginDrill` pulls Reach Out from the yard's
          // deck, so this should be unreachable. If some future card ever
          // tames, the article is still not handed over as a free monster.
          lines.push(DRILL_TAME_LINE);
          endDrill(next, 'passed', lines);
        } else if (result.outcome === 'victory' && !holdArticleUp(next, lines)) {
          endDrill(next, 'passed', lines);
        }
        next.log = pushLog(state.log, ...lines);
        return next;
      }
      if (result.outcome === 'tamed' && result.tamed) {
        adoptMonster(next, result.tamed, lines);
        if (next.battle!.enemies.some((e) => e.isAlive())) {
          lines.push('The rest close ranks. This is not over.');
        } else {
          endBattlePeacefully(next, lines);
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
      if (next.drill && next.drill.outcome === 'running') {
        noteDrillProgress(next, { endedTurn: true });
        // `handleDefeat` is unreachable from a drill. This is the guarantee.
        if (result.outcome === 'defeat') haltDrill(next, lines);
        else if (result.outcome === 'victory' && !holdArticleUp(next, lines)) endDrill(next, 'passed', lines);
        next.log = pushLog(state.log, ...lines);
        return next;
      }
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
      // Nobody rolls dice to walk out of a training yard. A drill's exit is
      // the same door as DRILL_LEAVE, so a failed flee can never hand the
      // article a free round against a recruit who had already had enough.
      if (next.drill && next.drill.outcome === 'running') {
        const lines = [DRILL_LEAVE_LINE];
        endDrill(next, 'left', lines);
        next.log = pushLog(state.log, ...lines);
        return next;
      }
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
        lines.push(
          modsOf(next).keepCards
            ? `${getCard(action.cardId)!.name} joins your deck — and this telling does not give things back.`
            : `${getCard(action.cardId)!.name} joins your deck — for as long as this expedition lasts.`,
        );
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
      // 'equipment' is the same sheet reached from the floor's Gear button —
      // points must be spendable there too (v18 fix: clicks were no-oping).
      if (!state.player || (state.screen !== 'characterSheet' && state.screen !== 'equipment')) return state;
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
        BREEDING_COVENANT_LINES[(next.party.length + next.stable.length) % BREEDING_COVENANT_LINES.length]
          .replaceAll('{parentA}', parentA.nickname)
          .replaceAll('{parentB}', parentB.nickname),
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

    case 'START_DRILL': {
      // Repeatable on purpose, from the board, forever. The only bar is being
      // in town with a hero — a player mid-expedition cannot duck into the
      // guardhouse to top up, and a player who wants the lesson again at hour
      // forty is entitled to it.
      if (!state.player || state.screen !== 'questBoard' || state.battle) return state;
      const next = cloneCore(state);
      const lines: string[] = [];
      beginDrill(next, lines);
      next.log = pushLog(state.log, ...lines);
      return next;
    }

    case 'DRILL_LEAVE': {
      if (!state.drill || state.drill.outcome !== 'running') return state;
      const next = cloneCore(state);
      const lines = [DRILL_LEAVE_LINE];
      endDrill(next, 'left', lines);
      next.log = pushLog(state.log, ...lines);
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
      const copies =
        CLASS_DECKS[player.className].filter((id) => id === action.cardId).length +
        RACE_CARDS[player.race].filter((id) => id === action.cardId).length +
        (action.cardId === TAME_CARD_ID ? 1 : 0);
      const done = player.upgradedCounts[action.cardId] ?? 0;
      if (done >= copies) return state;
      const cost = BALANCE.upgradeCosts[card.rarity] ?? 100;
      const next = cloneCore(state);
      if (!next.player!.spendGold(cost)) {
        next.log = pushLog(state.log, 'The smith names a price your purse cannot argue with.');
        return next;
      }
      next.player!.upgradedCounts[action.cardId] = done + 1;
      next.log = pushLog(state.log, `One copy of ${card.name} is reforged (${done + 1}/${copies}).`);
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

    case 'DUEL_RESULT': {
      // A duel is a wager of pride, not of beasts: nothing is healed, killed,
      // levelled or looted here. The single-player state only keeps the tally.
      if (!state.player || state.screen !== 'multiplayer') return state;
      const record = { wins: 0, losses: 0, draws: 0, ...(state.duelRecord ?? {}) };
      if (action.result === 'win') record.wins++;
      else if (action.result === 'loss') record.losses++;
      else record.draws++;
      const line =
        action.result === 'win'
          ? `The ring goes to you. ${action.opponent} concedes the day.`
          : action.result === 'loss'
            ? `${action.opponent} takes the ring. Your beasts walk out with you, and that is the whole of what a duel costs.`
            : `Neither ring stands. ${action.opponent} calls it even.`;
      return { ...state, duelRecord: record, log: pushLog(state.log, line) };
    }

    case 'LOAD_STATE':
      return action.state;

    case 'RESTART':
      return initialGameState();

    default:
      return state;
  }
}
