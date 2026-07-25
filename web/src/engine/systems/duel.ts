// ---------------------------------------------------------------------------
// Duel — 1v1 tamer-vs-tamer matches (PLAN8 #10-13, PLAN6 phase 3 foundation).
//
// THE ONE RULE OF THIS FILE: it does not implement card combat. Every point of
// damage, every status tick, every intent telegraph is resolved by the exact
// systems the single-player game uses (`systems/cardBattle`). This module only
// (a) sets two sides against each other, (b) sequences whose turn it is,
// (c) decides the win condition, and (d) hides what the other player must not
// see. That is precisely the set of jobs an authoritative server takes over.
//
// ---------------------------------------------------------------------------
// SHAPE OF A MATCH
// ---------------------------------------------------------------------------
// A duel holds TWO BattleStates — one per side — that share their combatants
// by reference:
//
//     sides.a.battle.enemies  ===  sides.b.party   (same MonsterInstance objects)
//     sides.b.battle.enemies  ===  sides.a.party
//
// So when A plays a card into `sides.a.battle`, the damage lands on the very
// objects B calls their party. No mirroring code, no desync surface — the
// engine mutates one board and both views are already correct. `cloneMatch`
// is written to preserve that aliasing (uid -> single clone).
//
// Consequences of reusing the single-player resolver verbatim, stated plainly
// so nobody mistakes them for bugs:
//   * A beast acts twice per round: on instinct during its own tamer's
//     end-of-turn, and on its telegraphed intent during the enemy tamer's
//     end-of-turn. Symmetric for both sides, so the duel stays fair.
//   * Statuses tick once per player turn (twice per round), like upkeep in
//     most card games.
//   * Enemy attacks hit beasts while any beast lives (engine rule), so a tamer
//     is only exposed once their board is empty — which already ends the duel.
//   * Reach Out is stripped from duel decks (you do not tame a rival's beast)
//     and the mercy-surrender roll is suppressed via `battle.tamerName`.
//
// ---------------------------------------------------------------------------
// DETERMINISM / SERVER AUTHORITY
// ---------------------------------------------------------------------------
// A match's randomness is a pure function of (`seed`, `rngCalls`). Every
// mutation runs inside `withSeededRandom`, which points the engine's random
// source at a `SeededRng` from engine/random.ts and counts how many numbers
// were consumed. Replaying the same action log against the same seed
// reproduces the state exactly — see `duelDigest` and duel.test.ts. That is
// the property that lets a server validate a client (or vice versa).
//
// The opponent AI does NOT draw from the match stream: it seeds off
// (seed, seq), so its choices are reproducible without perturbing resolution.
//
// FUTURE (real netcode): the engine currently reads randomness off the global
// `Math.random`, so `withSeededRandom` swaps that binding for the duration of
// one synchronous action. When the engine is extracted to `packages/engine`
// (PLAN6 phase 3) this should become explicit RNG injection into cardBattle;
// this module is the only place that would have to change.
// ---------------------------------------------------------------------------
import type { CardDef, CardEffect, CardInstance, FxEvent, Intent, Stat } from '../types';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import {
  startBattle,
  playCard,
  endTurn,
  purgeMonsterCards,
  effectAmount,
  elementMult,
  type BattleState,
} from './cardBattle';
import { generateItem } from './lootGen';
import { getCard, TAME_CARD_ID, SPECIES_CARDS } from '../data/cards';
import { speciesById } from '../data/species';
import { PERSONALITIES } from '../data/personalities';
import { talentsFor } from '../data/traits';
import { DUEL_PARTY_MAX, type RivalTamer } from '../data/duelParty';
import { SeededRng } from '../random';

export { DUEL_PARTY_MAX };

const MAX_DUEL_LOG = 90;
/** Hard stop so a pathological AI turn can never spin forever. */
export const MAX_ACTIONS_PER_TURN = 40;

/**
 * Duel vitality — the ring's one balance rule.
 *
 * Reusing the single-player resolver means every beast contributes THREE
 * damage sources per round: the cards it lends its tamer, its own instinct on
 * its tamer's turn, and its telegraphed retaliation on the enemy tamer's turn.
 * Against wild-encounter HP pools that empties both boards inside two rounds
 * (measured, not guessed). Duel combatants therefore enter with deeper
 * reserves so a match lasts long enough to be a match.
 *
 * This is a MODE rule applied once at setup, not a change to any shared
 * balance number — nothing in the single-player game moves.
 */
export const DUEL_VITALITY = 2.6;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DuelSideId = 'a' | 'b';
export const DUEL_SIDES: DuelSideId[] = ['a', 'b'];

/** Who supplies this side's actions. 'remote' is reserved for WebSocketTransport. */
export type DuelController = 'human' | 'ai' | 'remote';

export type DuelOutcome =
  | { kind: 'ongoing' }
  | { kind: 'win'; winner: DuelSideId; reason: 'board' | 'hero' | 'concede' }
  | { kind: 'draw' };

/** The complete wire protocol of a duel. Nothing else may mutate a match. */
export type DuelAction =
  | { kind: 'playCard'; side: DuelSideId; handIndex: number; targetUid?: string }
  | { kind: 'endTurn'; side: DuelSideId }
  | { kind: 'concede'; side: DuelSideId };

export interface DuelSide {
  id: DuelSideId;
  name: string;
  controller: DuelController;
  /** Flavor shown on the duel board (rival epithet, "you", ...). */
  title: string;
  hero: Character;
  party: MonsterInstance[];
  /** This side's view of the fight: `enemies` are the OTHER side's beasts. */
  battle: BattleState;
}

export interface DuelMatch {
  matchId: string;
  seed: number;
  /** How many random numbers this match has consumed. Position in the stream. */
  rngCalls: number;
  /** Monotonic action counter — a server's ordering/ack handle. */
  seq: number;
  round: number;
  turn: DuelSideId;
  starter: DuelSideId;
  lastActor: DuelSideId | null;
  sides: Record<DuelSideId, DuelSide>;
  outcome: DuelOutcome;
  log: string[];
  lastFx: FxEvent[];
}

export interface DuelSetupSide {
  name: string;
  title: string;
  controller: DuelController;
  hero: Character;
  party: MonsterInstance[];
}

export interface DuelSetup {
  seed: number;
  matchId?: string;
  a: DuelSetupSide;
  b: DuelSetupSide;
}

// ---------------------------------------------------------------------------
// Seeded randomness
// ---------------------------------------------------------------------------

interface RngCursor {
  seed: number;
  rngCalls: number;
}

/**
 * Run `fn` with the engine's randomness bound to this match's seeded stream,
 * then advance the cursor by however many numbers were consumed. Synchronous
 * only — never await inside.
 */
export function withSeededRandom<T>(cursor: RngCursor, fn: () => T): T {
  const rng = new SeededRng(cursor.seed);
  for (let i = 0; i < cursor.rngCalls; i++) rng.next();
  let calls = 0;
  const original = Math.random;
  Math.random = () => {
    calls++;
    return rng.next();
  };
  try {
    return fn();
  } finally {
    Math.random = original;
    cursor.rngCalls += calls;
  }
}

/** Side-channel RNG for AI decisions: reproducible, but off the match stream. */
function decisionRng(match: DuelMatch, salt: number): SeededRng {
  return new SeededRng((match.seed ^ Math.imul(match.seq + 1, 2654435761) ^ Math.imul(salt + 1, 40503)) >>> 0);
}

export function otherSide(id: DuelSideId): DuelSideId {
  return id === 'a' ? 'b' : 'a';
}

// ---------------------------------------------------------------------------
// Setup & validation
// ---------------------------------------------------------------------------

export interface DuelValidation {
  ok: boolean;
  errors: string[];
}

export function validateDuelSide(side: DuelSetupSide | null | undefined, label: string): string[] {
  const errors: string[] = [];
  if (!side) return [`${label}: no tamer.`];
  if (!side.hero) errors.push(`${label}: no hero.`);
  if (!side.name?.trim()) errors.push(`${label}: a tamer must have a name.`);
  const party = side.party ?? [];
  if (party.length === 0) errors.push(`${label}: bring at least one beast to the ring.`);
  if (party.length > DUEL_PARTY_MAX) errors.push(`${label}: no more than ${DUEL_PARTY_MAX} beasts (has ${party.length}).`);
  const uids = new Set<string>();
  for (const m of party) {
    if (uids.has(m.uid)) errors.push(`${label}: ${m.nickname} is entered twice.`);
    uids.add(m.uid);
    if (!speciesById(m.speciesId)) errors.push(`${label}: unknown species "${m.speciesId}".`);
  }
  return errors;
}

export function validateDuelSetup(setup: DuelSetup): DuelValidation {
  const errors = [...validateDuelSide(setup.a, 'Challenger'), ...validateDuelSide(setup.b, 'Opponent')];
  const aUids = new Set((setup.a?.party ?? []).map((m) => m.uid));
  for (const m of setup.b?.party ?? []) {
    if (aUids.has(m.uid)) errors.push(`Both tamers entered the same beast (${m.nickname}).`);
  }
  if (!Number.isFinite(setup.seed)) errors.push('A duel needs a finite seed.');
  return { ok: errors.length === 0, errors };
}

/** Duel decks never carry Reach Out — you do not tame what belongs to someone else. */
function stripTameCards(battle: BattleState) {
  const isTame = (c: CardInstance) => c.cardId === TAME_CARD_ID;
  const handSize = battle.hand.length;
  battle.drawPile = battle.drawPile.filter((c) => !isTame(c));
  battle.hand = battle.hand.filter((c) => !isTame(c));
  while (battle.hand.length < handSize && battle.drawPile.length > 0) {
    battle.hand.push(battle.drawPile.pop()!);
  }
}

/**
 * Combatants entering a duel are re-identified by their ring slot ("a0", "b2")
 * instead of keeping the timestamped uid `freshUid` hands out.
 *
 * This is a protocol decision, not cosmetics: `targetUid` travels inside
 * DuelAction, so an action log is only replayable if the ids it names are
 * derivable from the setup rather than from the wall clock of whoever built
 * the match first. Slot ids also make a duel's state hash comparable between
 * a client and a server that constructed their copies independently.
 */
export function duelSlotUid(side: DuelSideId, index: number): string {
  return `${side}${index}`;
}

function prepareSide(id: DuelSideId, s: DuelSetupSide): DuelSide {
  // Duels never touch the entities the caller handed over — a bad duel must
  // not maim the party you take back into the gates.
  const hero = s.hero.clone();
  hero.statusEffects = [];
  hero.activeMods = [];
  hero.recomputeDerived();
  // Vitality is applied AFTER the derived pass; nothing recomputes it again
  // mid-duel (no exp, no gear changes inside the ring), so it holds.
  hero.maxHp = Math.floor(hero.maxHp * DUEL_VITALITY);
  hero.hp = hero.maxHp;
  hero.mp = hero.maxMp;
  const party = s.party.map((m, i) => {
    const c = m.clone();
    c.uid = duelSlotUid(id, i);
    c.statusEffects = [];
    c.activeMods = [];
    c.isBoss = false;
    c.isTamed = true; // instincts only fire for bonded beasts
    c.tameBonus = 0;
    c.deriveStats();
    c.maxHp = Math.floor(c.maxHp * DUEL_VITALITY);
    c.hp = c.maxHp;
    c.mp = c.maxMp;
    return c;
  });
  return { id, name: s.name.trim(), title: s.title ?? '', controller: s.controller, hero, party, battle: null as unknown as BattleState };
}

export function createDuel(setup: DuelSetup): DuelMatch {
  const check = validateDuelSetup(setup);
  if (!check.ok) throw new Error(`Invalid duel setup: ${check.errors.join(' ')}`);

  const a = prepareSide('a', setup.a);
  const b = prepareSide('b', setup.b);
  const cursor: RngCursor = { seed: setup.seed >>> 0, rngCalls: 0 };

  const starter = withSeededRandom(cursor, (): DuelSideId => {
    // Both decks are shuffled and both openers drawn inside the seeded stream,
    // then the toss decides the first turn. All of it replayable.
    for (const [side, foe] of [
      [a, b],
      [b, a],
    ] as const) {
      const battle = startBattle(side.hero, side.party, [...foe.party], {
        isBossFight: false,
        gateId: null,
        expeditionExtras: [],
      });
      // A named opposing tamer suppresses the wild-beast mercy roll.
      battle.tamerName = foe.name;
      battle.unitKind = 'tamer';
      stripTameCards(battle);
      side.battle = battle;
    }
    return Math.random() < 0.5 ? 'a' : 'b';
  });

  const match: DuelMatch = {
    matchId: setup.matchId ?? `duel-${(setup.seed >>> 0).toString(36)}`,
    seed: setup.seed >>> 0,
    rngCalls: cursor.rngCalls,
    seq: 0,
    round: 1,
    turn: starter,
    starter,
    lastActor: null,
    sides: { a, b },
    outcome: { kind: 'ongoing' },
    log: [
      `${a.name} and ${b.name} step into the ring.`,
      `${a.name} fields ${a.party.map((m) => m.nickname).join(', ')}.`,
      `${b.name} fields ${b.party.map((m) => m.nickname).join(', ')}.`,
      `The toss falls to ${(starter === 'a' ? a : b).name}. Round 1.`,
    ],
    lastFx: [],
  };
  return match;
}

// ---------------------------------------------------------------------------
// Cloning — purity, with the cross-side aliasing preserved
// ---------------------------------------------------------------------------

function cloneMatch(match: DuelMatch): DuelMatch {
  const seen = new Map<string, MonsterInstance>();
  const mon = (m: MonsterInstance): MonsterInstance => {
    let c = seen.get(m.uid);
    if (!c) {
      c = m.clone();
      seen.set(m.uid, c);
    }
    return c;
  };
  // Parties first, so `battle.enemies` resolves to the very same clones.
  const parties: Record<DuelSideId, MonsterInstance[]> = {
    a: match.sides.a.party.map(mon),
    b: match.sides.b.party.map(mon),
  };
  const dupRecord = <T>(src: Record<string, Record<string, T>> | undefined) =>
    src ? Object.fromEntries(Object.entries(src).map(([k, v]) => [k, { ...v }])) : undefined;

  const cloneSide = (s: DuelSide): DuelSide => ({
    ...s,
    hero: s.hero.clone(),
    party: parties[s.id],
    battle: {
      ...s.battle,
      enemies: s.battle.enemies.map(mon),
      intents: { ...s.battle.intents },
      enemyBlock: { ...s.battle.enemyBlock },
      drawPile: [...s.battle.drawPile],
      hand: [...s.battle.hand],
      discardPile: [...s.battle.discardPile],
      exhaustPile: [...s.battle.exhaustPile],
      moveCooldowns: dupRecord(s.battle.moveCooldowns),
      movesUsed: dupRecord(s.battle.movesUsed),
    },
  });

  return {
    ...match,
    sides: { a: cloneSide(match.sides.a), b: cloneSide(match.sides.b) },
    outcome: { ...match.outcome } as DuelOutcome,
    log: [...match.log],
    lastFx: [],
  };
}

// ---------------------------------------------------------------------------
// Legality — the server's rejection rule, expressed once
// ---------------------------------------------------------------------------

/** Mirrors cardBattle's free-card rules so legality matches resolution. */
export function effectiveCardCost(hero: Character, battle: BattleState, card: CardDef): number {
  const talents = talentsFor(hero.level);
  const freeByTalent = talents.firstCardFree && !battle.firstCardUsed;
  const freeByOath = hero.traits.firstStrikeFree && !battle.freeStrikeUsed && card.type === 'strike';
  return freeByTalent || freeByOath ? 0 : card.cost;
}

export function isLegalDuelAction(match: DuelMatch, action: DuelAction): boolean {
  if (match.outcome.kind !== 'ongoing') return false;
  const side = match.sides[action.side];
  if (!side) return false;
  if (action.side !== match.turn) return false;
  if (action.kind === 'endTurn' || action.kind === 'concede') return true;
  if (!Number.isInteger(action.handIndex)) return false;
  const inst = side.battle.hand[action.handIndex];
  if (!inst) return false;
  const card = getCard(inst.cardId);
  if (!card) return false;
  if (effectiveCardCost(side.hero, side.battle, card) > side.battle.energy) return false;
  if (card.target === 'enemy' && !side.battle.enemies.some((e) => e.isAlive())) return false;
  if (action.targetUid !== undefined) {
    const ok =
      action.targetUid === 'hero' ||
      side.battle.enemies.some((e) => e.uid === action.targetUid && e.isAlive()) ||
      side.party.some((m) => m.uid === action.targetUid && m.isAlive());
    if (!ok) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// The reducer
// ---------------------------------------------------------------------------

function sideDefeated(s: DuelSide): 'hero' | 'board' | null {
  if (!s.hero.isAlive()) return 'hero';
  if (s.party.length === 0 || s.party.every((m) => !m.isAlive())) return 'board';
  return null;
}

/** A dead beast's cards burn out of its own tamer's deck, both sides. */
function syncBoards(match: DuelMatch) {
  for (const id of DUEL_SIDES) {
    const s = match.sides[id];
    for (const m of s.party) if (!m.isAlive()) purgeMonsterCards(s.battle, m.uid);
  }
}

function resolveOutcome(match: DuelMatch, lines: string[]) {
  if (match.outcome.kind !== 'ongoing') return;
  const aDown = sideDefeated(match.sides.a);
  const bDown = sideDefeated(match.sides.b);
  if (aDown && bDown) {
    match.outcome = { kind: 'draw' };
    lines.push('Both rings empty in the same breath. The dusk calls it even.');
    return;
  }
  if (aDown) {
    match.outcome = { kind: 'win', winner: 'b', reason: aDown };
    lines.push(`${match.sides.a.name} has nothing left standing. ${match.sides.b.name} takes the duel.`);
    return;
  }
  if (bDown) {
    match.outcome = { kind: 'win', winner: 'a', reason: bDown };
    lines.push(`${match.sides.b.name} has nothing left standing. ${match.sides.a.name} takes the duel.`);
  }
}

function pushDuelLog(log: string[], lines: string[]): string[] {
  const combined = [...log, ...lines];
  return combined.length > MAX_DUEL_LOG ? combined.slice(combined.length - MAX_DUEL_LOG) : combined;
}

/**
 * The whole of a duel's mutation surface. Pure: returns a new match, or the
 * SAME object (identity-equal) when the action is illegal — which is exactly
 * how an authoritative server rejects a client without desyncing it.
 */
export function applyDuelAction(match: DuelMatch, action: DuelAction): DuelMatch {
  if (!isLegalDuelAction(match, action)) return match;

  const next = cloneMatch(match);
  next.seq = match.seq + 1;
  const side = next.sides[action.side];
  const foe = next.sides[otherSide(action.side)];
  const lines: string[] = [];
  if (next.lastActor !== side.id) lines.push(`— ${side.name} —`);
  next.lastActor = side.id;

  const cursor: RngCursor = { seed: next.seed, rngCalls: next.rngCalls };
  withSeededRandom(cursor, () => {
    if (action.kind === 'playCard') {
      const result = playCard(side.hero, side.party, side.battle, action.handIndex, action.targetUid);
      lines.push(...result.log);
      next.lastFx = result.fx;
    } else if (action.kind === 'endTurn') {
      const result = endTurn(side.hero, side.party, side.battle);
      lines.push(...result.log);
      next.lastFx = result.fx;
    } else {
      lines.push(`${side.name} yields the ring.`);
    }
  });
  next.rngCalls = cursor.rngCalls;

  syncBoards(next);

  if (action.kind === 'concede') {
    next.outcome = { kind: 'win', winner: foe.id, reason: 'concede' };
  } else {
    resolveOutcome(next, lines);
  }

  if (action.kind === 'endTurn' && next.outcome.kind === 'ongoing') {
    next.turn = foe.id;
    if (next.turn === next.starter) next.round++;
  }

  next.log = pushDuelLog(next.log, lines);
  return next;
}

// ---------------------------------------------------------------------------
// Redaction — the per-player projection a server would broadcast
// ---------------------------------------------------------------------------

/**
 * The uid the battlefield uses for the OPPOSING tamer.
 *
 * A duel is rendered by the single-player BattleScreen, whose uid space is
 * `'hero'` (you) plus one slot uid per beast. The rival tamer has no slot —
 * they live in `battle.enemies` of a board this client never holds — so fx
 * addressed to `'hero'` by the other side's resolver are re-addressed to this
 * id before they reach the UI (see `localizeDuelFx`). It cannot collide with a
 * slot uid, which is always side-letter + index ("a0", "b2").
 */
export const DUEL_FOE_HERO_UID = 'foe-hero';

export interface DuelSideView {
  id: DuelSideId;
  name: string;
  title: string;
  hero: Character;
  party: MonsterInstance[];
  handCount: number;
  drawCount: number;
  discardCount: number;
  exhaustCount: number;
  /** This side's own turn counter — public, and what re-deals the hand fan. */
  turn: number;
  /** The tamer's own Ward. */
  block: number;
  /**
   * Ward standing on each of this side's beasts, by uid. Public information:
   * a hardened beast is visibly hardened, in this game as in every other.
   */
  beastBlock: Record<string, number>;
  energy: number;
  maxEnergy: number;
}

/**
 * Your OWN piles. Contents, deliberately: the battlefield lets you inspect
 * Deck/Embers/Ashes, and it inspects them alphabetically (never in draw order),
 * exactly as the single-player stage does. Nothing here is hidden from you in
 * the first place — it is your deck.
 */
export interface DuelOwnPiles {
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
}

export interface DuelView {
  matchId: string;
  seq: number;
  round: number;
  turn: DuelSideId;
  yourTurn: boolean;
  outcome: DuelOutcome;
  /** Full information: your own hand, piles, and their source beasts. */
  you: DuelSideView & { hand: CardInstance[] } & DuelOwnPiles;
  /** Public information only: board, block, pile COUNTS, telegraphed intents. */
  foe: DuelSideView & { intents: Record<string, Intent> };
  log: string[];
  fx: FxEvent[];
  /**
   * Which side's resolver produced `fx`. The UI needs it to re-address the
   * stream into its own uid space — see `localizeDuelFx`.
   */
  fxFrom: DuelSideId | null;
}

/**
 * `opponentBattle` is the battle in which this side's beasts are the enemies —
 * the only place their Ward is tracked. Reading it here is deliberate and
 * safe: Ward is public, unlike hands and draw order.
 */
function sideView(s: DuelSide, opponentBattle: BattleState): DuelSideView {
  const beastBlock: Record<string, number> = {};
  for (const m of s.party) {
    const ward = opponentBattle.enemyBlock[m.uid] ?? 0;
    if (ward > 0) beastBlock[m.uid] = ward;
  }
  return {
    id: s.id,
    name: s.name,
    title: s.title,
    hero: s.hero,
    party: s.party,
    handCount: s.battle.hand.length,
    drawCount: s.battle.drawPile.length,
    discardCount: s.battle.discardPile.length,
    exhaustCount: s.battle.exhaustPile.length,
    turn: s.battle.turn,
    block: s.battle.heroBlock,
    beastBlock,
    energy: s.battle.energy,
    maxEnergy: s.battle.maxEnergy,
  };
}

/**
 * Redact a match for one player. The opponent's hand contents and draw order
 * never cross this boundary — only counts, the public board, and the intents
 * they have already telegraphed. This is PLAN6's `redactFor(playerId)`.
 */
export function viewFor(match: DuelMatch, side: DuelSideId): DuelView {
  const you = match.sides[side];
  const foe = match.sides[otherSide(side)];
  return {
    matchId: match.matchId,
    seq: match.seq,
    round: match.round,
    turn: match.turn,
    yourTurn: match.turn === side && match.outcome.kind === 'ongoing',
    outcome: match.outcome,
    you: {
      ...sideView(you, foe.battle),
      hand: [...you.battle.hand],
      drawPile: [...you.battle.drawPile],
      discardPile: [...you.battle.discardPile],
      exhaustPile: [...you.battle.exhaustPile],
    },
    // Telegraphs for the foe's beasts live in YOUR battle — they are what your
    // side has been shown, which is exactly what may be revealed.
    foe: { ...sideView(foe, you.battle), intents: { ...you.battle.intents } },
    log: match.log,
    fx: match.lastFx,
    fxFrom: match.lastActor,
  };
}

// ---------------------------------------------------------------------------
// Presentation adapters — the pure half of "a duel renders on the real
// battlefield". These take a redacted view and nothing else, so they can be
// tested without a DOM and can never reach past the redaction boundary.
// ---------------------------------------------------------------------------

/**
 * Re-address an fx stream into the LOCAL player's uid space.
 *
 * The resolver that produced these events was looking at the acting side's
 * board, where `'hero'` is that side's tamer and `side: 'ally'` is that side's
 * units. When the opponent acted, both readings are inverted for us: their
 * tamer becomes `DUEL_FOE_HERO_UID`, their allies become our enemies. Beast
 * uids are global slot ids and need no translation.
 *
 * Returns the SAME array when nothing needs changing — the battlefield keys its
 * "have I already played this batch?" guard on array identity.
 */
export function localizeDuelFx(fx: FxEvent[], from: DuelSideId | null, local: DuelSideId): FxEvent[] {
  if (fx.length === 0 || from === null || from === local) return fx;
  return fx.map((e): FxEvent => {
    if (e.fx === 'shake') return e;
    if (e.fx === 'actor') {
      return {
        ...e,
        uid: e.uid === 'hero' ? DUEL_FOE_HERO_UID : e.uid,
        side: e.side === 'ally' ? 'enemy' : 'ally',
      };
    }
    return e.targetUid === 'hero' ? { ...e, targetUid: DUEL_FOE_HERO_UID } : e;
  });
}

/**
 * Every uid the battlefield can put a crosshair on, derived from the redacted
 * view alone: the foe's living beasts, your own living beasts, and your tamer.
 * `undefined` (no uid) also aims at your tamer — that is the engine's rule for
 * a self-targeted card and the reason it is not in this list.
 */
export function duelAimableUids(view: DuelView): string[] {
  return [
    ...view.foe.party.filter((m) => m.isAlive()).map((m) => m.uid),
    'hero',
    ...view.you.party.filter((m) => m.isAlive()).map((m) => m.uid),
  ];
}

/** The exact action the battlefield submits when a card is played. */
export function duelCardAction(side: DuelSideId, handIndex: number, targetUid?: string): DuelAction {
  return { kind: 'playCard', side, handIndex, targetUid };
}

// ---------------------------------------------------------------------------
// Digest — the state hash a server and client compare
// ---------------------------------------------------------------------------

function statusSig(c: Character | MonsterInstance): string {
  return c.statusEffects.map((s) => `${s.name}:${s.turns}:${s.stacks ?? 0}`).join('+');
}
function modSig(c: Character | MonsterInstance): string {
  return c.activeMods.map((m) => `${m.stat}${m.amount}:${m.turns}`).join('+');
}
function intentSig(i: Intent | undefined): string {
  if (!i) return '-';
  return `${i.kind}:${i.amount ?? 0}x${i.times ?? 1}:${i.moveId ?? ''}${i.drain ? ':drain' : ''}`;
}
function outcomeSig(o: DuelOutcome): string {
  return o.kind === 'win' ? `win:${o.winner}:${o.reason}` : o.kind;
}

/**
 * Canonical, uid-free fingerprint of a match. Deliberately excludes uids
 * (which carry a timestamp and never affect resolution) so two independently
 * constructed matches from the same seed compare equal.
 */
export function duelDigest(match: DuelMatch): string {
  const part = (s: DuelSide) => {
    const b = s.battle;
    return [
      `name=${s.name}`,
      `hero=${s.hero.hp}/${s.hero.maxHp}`,
      `hstat=${statusSig(s.hero)}`,
      `hmod=${modSig(s.hero)}`,
      `party=${s.party.map((m) => `${m.speciesId}@${m.level}:${m.hp}/${m.maxHp}:mp${m.mp}:${statusSig(m)}:${modSig(m)}`).join('|')}`,
      `vigor=${b.energy}/${b.maxEnergy}`,
      `ward=${b.heroBlock}`,
      `bturn=${b.turn}`,
      `hand=${b.hand.map((c) => c.cardId + (c.upgraded ? '+' : '')).join(',')}`,
      `draw=${b.drawPile.map((c) => c.cardId).join(',')}`,
      `disc=${b.discardPile.map((c) => c.cardId).join(',')}`,
      `exh=${b.exhaustPile.map((c) => c.cardId).join(',')}`,
      `eblock=${b.enemies.map((e) => b.enemyBlock[e.uid] ?? 0).join(',')}`,
      `intent=${b.enemies.map((e) => intentSig(b.intents[e.uid])).join('|')}`,
    ].join(';');
  };
  return [
    `seq=${match.seq}`,
    `round=${match.round}`,
    `turn=${match.turn}`,
    `rng=${match.rngCalls}`,
    `out=${outcomeSig(match.outcome)}`,
    part(match.sides.a),
    part(match.sides.b),
  ].join('#');
}

// ---------------------------------------------------------------------------
// Duel AI — authored decision weights, in the spirit of data/enemyAi kits
// ---------------------------------------------------------------------------

interface CardScore {
  score: number;
  targetUid?: string;
}

/** Bonus for a blow that finishes a beast — kills are worth more than chip. */
const LETHAL_BONUS = 34;

function scoreCard(side: DuelSide, card: CardDef, inst: CardInstance): CardScore {
  const battle = side.battle;
  const hero = side.hero;
  const source = inst.sourceMonsterUid ? side.party.find((m) => m.uid === inst.sourceMonsterUid) : undefined;
  const upgraded = !!inst.upgraded;
  const living = battle.enemies.filter((e) => e.isAlive());
  const woundedAllies = side.party.filter((m) => m.isAlive() && m.hp < m.maxHp);
  const aimsAtEnemy = card.target === 'enemy';
  const hasDamage = card.effects.some((e) => e.kind === 'damage' || e.kind === 'drain' || e.kind === 'resolveDamage');

  let incoming = 0;
  for (const e of living) {
    const it = battle.intents[e.uid];
    if (it?.kind === 'attack') incoming += (it.amount ?? 0) * (it.times ?? 1);
  }
  const underPressure = incoming > 0 && incoming >= hero.maxHp * 0.25;

  let score = 0;
  let targetUid: string | undefined;

  const pickDamageTarget = (effect: CardEffect, base: number): number => {
    let best: MonsterInstance | null = null;
    let bestValue = -1;
    for (const t of living) {
      const dmg = base * elementMult(effect, t);
      const shielded = battle.enemyBlock[t.uid] ?? 0;
      const lethal = dmg >= t.hp + shielded;
      // Threat weighting mirrors the enemy kits: hit what hurts, finish what bleeds.
      const value = dmg + (lethal ? LETHAL_BONUS : 0) + t.getAttack() * 0.25 - shielded * 0.4;
      if (value > bestValue) {
        bestValue = value;
        best = t;
      }
    }
    if (best && aimsAtEnemy && targetUid === undefined) targetUid = best.uid;
    return Math.max(0, bestValue);
  };

  for (const effect of card.effects) {
    switch (effect.kind) {
      case 'damage': {
        if (living.length === 0) break;
        const base = effectAmount(effect, hero, source, upgraded) * (effect.times ?? 1);
        if (card.target === 'allEnemies') {
          score += living.reduce((sum, t) => sum + base * elementMult(effect, t) + (base * elementMult(effect, t) >= t.hp ? LETHAL_BONUS : 0), 0);
        } else if (card.target === 'randomEnemy') {
          score += base;
        } else {
          score += pickDamageTarget(effect, base);
        }
        break;
      }
      case 'resolveDamage': {
        if (living.length === 0) break;
        const base = effect.amount + effect.perExhausted * battle.exhaustPile.length;
        score += pickDamageTarget(effect, base);
        break;
      }
      case 'drain': {
        if (living.length === 0) break;
        const base = effectAmount(effect, hero, source, upgraded);
        score += pickDamageTarget(effect, base) * 1.2;
        break;
      }
      case 'block': {
        const amount = effectAmount(effect, hero, source, upgraded);
        // A tamer is only exposed once their board is empty, so Ward matters
        // most when the beasts are thin on the ground or the hero shields them.
        const exposed = hero.traits.protectorHero || side.party.filter((m) => m.isAlive()).length <= 1;
        score += amount * (exposed ? (underPressure ? 1.5 : 0.9) : 0.35);
        break;
      }
      case 'heal': {
        const amount = effectAmount(effect, hero, source, upgraded);
        const heroMissing = hero.maxHp - hero.hp;
        const worst = woundedAllies.slice().sort((x, y) => x.hp / x.maxHp - y.hp / y.maxHp)[0];
        const allyMissing = worst ? worst.maxHp - worst.hp : 0;
        if (!hasDamage && worst && allyMissing > heroMissing) {
          targetUid = worst.uid;
          score += Math.min(amount, allyMissing) * 1.15;
        } else {
          score += Math.min(amount, heroMissing) * (heroMissing > hero.maxHp * 0.35 ? 1.1 : 0.3);
        }
        break;
      }
      case 'status': {
        const chance = effect.chance ?? 1;
        const pool = aimsAtEnemy ? living : [];
        const fresh = pool.filter((t) => !t.hasStatus(effect.status));
        if (fresh.length > 0 && aimsAtEnemy && targetUid === undefined) targetUid = fresh[0].uid;
        score += (fresh.length > 0 ? 11 : 3) * chance;
        break;
      }
      case 'selfStatus':
        score -= 6; // engine statuses are hostile; taking one is a cost
        break;
      case 'mod':
        score += effect.onSelf ? 7 : 8;
        break;
      case 'draw':
        score += effect.count * 6;
        break;
      case 'energy':
        score += effect.amount * 7;
        break;
      case 'selfDamage':
        score -= effect.amount * 1.4;
        break;
      case 'tame':
        return { score: 0 }; // never in a duel deck; belt and braces
    }
  }

  // Prefer plays that actually spend the turn's Vigor rather than hoarding it.
  if (effectiveCardCost(hero, battle, card) === battle.energy && score > 0) score += 3;
  if (aimsAtEnemy && targetUid === undefined && living.length > 0) targetUid = living[0].uid;
  return { score, targetUid };
}

/**
 * The opponent's brain. Pure and reproducible: seeded off (match.seed, seq) so
 * the same match state always yields the same decision, without touching the
 * match's own random stream. A remote human simply replaces this function.
 */
export function chooseDuelAction(match: DuelMatch, sideId: DuelSideId): DuelAction {
  const side = match.sides[sideId];
  if (match.outcome.kind !== 'ongoing' || match.turn !== sideId) return { kind: 'endTurn', side: sideId };

  const candidates: { handIndex: number; targetUid?: string; weight: number }[] = [];
  for (let i = 0; i < side.battle.hand.length; i++) {
    const inst = side.battle.hand[i];
    const card = getCard(inst.cardId);
    if (!card) continue;
    const scored = scoreCard(side, card, inst);
    if (scored.score <= 0) continue;
    const action: DuelAction = { kind: 'playCard', side: sideId, handIndex: i, targetUid: scored.targetUid };
    if (!isLegalDuelAction(match, action)) continue;
    candidates.push({ handIndex: i, targetUid: scored.targetUid, weight: Math.max(1, Math.round(scored.score)) });
  }
  if (candidates.length === 0) return { kind: 'endTurn', side: sideId };

  // Weighted pick, exactly like the enemy kits roll their telegraphs — the
  // opponent favours its best line without being perfectly predictable.
  const rng = decisionRng(match, candidates.length);
  const total = candidates.reduce((sum, c) => sum + c.weight, 0);
  let roll = rng.int(total);
  let pick = candidates[candidates.length - 1];
  for (const c of candidates) {
    roll -= c.weight;
    if (roll < 0) {
      pick = c;
      break;
    }
  }
  return { kind: 'playCard', side: sideId, handIndex: pick.handIndex, targetUid: pick.targetUid };
}

// ---------------------------------------------------------------------------
// Transport — the seam a server drops into
// ---------------------------------------------------------------------------

/**
 * Everything the duel UI is allowed to know about where a match lives.
 *
 * `LocalTransport` runs the authoritative match in this tab against an AI.
 * A future `WebSocketTransport` implements the same three methods: send the
 * action to the server, hand every redacted snapshot the server pushes to the
 * subscribers, close the socket on dispose. The screen does not change.
 */
export interface DuelTransport {
  /** Which side this client controls. */
  readonly localSide: DuelSideId;
  /** Fire-and-forget. Illegal actions are dropped by the authority, not here. */
  submitAction(action: DuelAction): void;
  /** Subscribe to redacted snapshots; fires immediately with the current one. */
  onState(cb: (view: DuelView) => void): () => void;
  dispose(): void;
}

export interface LocalTransportOptions {
  /** Pacing hook. UI passes setTimeout; tests pass an immediate scheduler. */
  schedule?: (fn: () => void, ms: number) => void;
  /** Delay between the opponent's actions, so a duel is watchable. */
  aiDelayMs?: number;
  /** Override which side this client speaks for (default: the human one). */
  localSide?: DuelSideId;
}

export class LocalTransport implements DuelTransport {
  readonly localSide: DuelSideId;
  private match: DuelMatch;
  private listeners = new Set<(v: DuelView) => void>();
  private schedule: (fn: () => void, ms: number) => void;
  private aiDelayMs: number;
  private disposed = false;
  private pumpQueued = false;
  private actionsThisTurn = 0;
  /** Every action the authority accepted, in order — replayable proof. */
  readonly actionLog: DuelAction[] = [];

  constructor(setup: DuelSetup, opts: LocalTransportOptions = {}) {
    this.match = createDuel(setup);
    this.localSide = opts.localSide ?? (setup.b.controller === 'human' && setup.a.controller !== 'human' ? 'b' : 'a');
    this.schedule = opts.schedule ?? ((fn, ms) => setTimeout(fn, ms));
    this.aiDelayMs = opts.aiDelayMs ?? 650;
    this.pump();
  }

  submitAction(action: DuelAction): void {
    if (this.disposed) return;
    // A client may only speak for itself; the authority enforces it here just
    // as a server would enforce it on the socket's identity.
    if (action.side !== this.localSide) return;
    this.applyInternal(action);
    this.pump();
  }

  onState(cb: (v: DuelView) => void): () => void {
    this.listeners.add(cb);
    cb(this.currentView());
    return () => {
      this.listeners.delete(cb);
    };
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }

  /** Local-only accessor for tests/debugging. Not part of DuelTransport. */
  snapshot(): DuelMatch {
    return this.match;
  }

  currentView(): DuelView {
    return viewFor(this.match, this.localSide);
  }

  private applyInternal(action: DuelAction) {
    const before = this.match;
    const after = applyDuelAction(this.match, action);
    if (after === before) return; // rejected — no state change, no broadcast
    this.match = after;
    this.actionLog.push(action);
    this.actionsThisTurn = action.kind === 'endTurn' ? 0 : this.actionsThisTurn + 1;
    this.emit();
  }

  private emit() {
    const view = this.currentView();
    for (const cb of this.listeners) cb(view);
  }

  /** True when the side to move is machine-driven (supports bot-vs-bot runs). */
  private aiToMove(): boolean {
    return this.match.outcome.kind === 'ongoing' && this.match.sides[this.match.turn].controller === 'ai';
  }

  private pump() {
    if (this.disposed || this.pumpQueued || !this.aiToMove()) return;
    this.pumpQueued = true;
    this.schedule(() => {
      this.pumpQueued = false;
      if (this.disposed || !this.aiToMove()) return;
      const acting = this.match.turn;
      const action =
        this.actionsThisTurn >= MAX_ACTIONS_PER_TURN
          ? ({ kind: 'endTurn', side: acting } as DuelAction)
          : chooseDuelAction(this.match, acting);
      this.applyInternal(action);
      this.pump();
    }, this.aiDelayMs);
  }
}

// ---------------------------------------------------------------------------
// Opponent construction (authored rivals + mirror match)
// ---------------------------------------------------------------------------

const CLASS_FALLBACK_STATS: Stat[] = ['STR', 'DEF', 'DEX', 'MANA', 'MAGDEF', 'INT', 'LUCK'];

function levelHeroTo(hero: Character, level: number, priority: Stat[]) {
  let guard = 0;
  while (hero.level < level && guard++ < 200) {
    hero.gainExp(Math.max(1, hero.expToNext() - hero.exp));
  }
  const order = priority.length > 0 ? priority : CLASS_FALLBACK_STATS;
  let i = 0;
  while (hero.attributePoints > 0 && i < 5000) {
    hero.spendAttributePoint(order[i % order.length]);
    i++;
  }
  hero.recomputeDerived();
  hero.hp = hero.maxHp;
  hero.mp = hero.maxMp;
}

/**
 * Instantiate an authored rival at a given level band. Fully seeded: the same
 * (tamer, level, seed) always produces the same opponent, which is what makes
 * a duel invitation reproducible for both players later.
 */
export function makeRivalSide(tamer: RivalTamer, level: number, seed: number, beastCount?: number): DuelSetupSide {
  const cursor: RngCursor = { seed: seed >>> 0, rngCalls: 0 };
  return withSeededRandom(cursor, () => {
    const hero = new Character(tamer.name, tamer.race, tamer.className);
    levelHeroTo(hero, Math.max(1, level), tamer.statPriority);
    // A rival who has been fighting as long as you have is not in starting gear.
    for (let i = 0; i < 3; i++) hero.equip(generateItem(Math.max(1, level + 1), hero.effectiveStat('LUCK'), 1));
    hero.recomputeDerived();
    hero.hp = hero.maxHp;
    hero.mp = hero.maxMp;

    // A sanctioned duel is fought at matched numbers: the rival fields exactly
    // as many beasts as the challenger brings, cycling their authored lineup
    // if asked for more than they wrote down.
    const want = Math.max(1, Math.min(DUEL_PARTY_MAX, beastCount ?? tamer.beasts.length));
    const party = Array.from({ length: want }, (_, i) => {
      const b = tamer.beasts[i % tamer.beasts.length];
      const beast = new MonsterInstance({
        speciesId: b.speciesId,
        level: Math.max(1, level + b.levelOffset),
        nickname: i < tamer.beasts.length ? b.nickname : `${b.nickname} the Younger`,
        personalityId: b.personalityId,
      });
      beast.isTamed = true;
      beast.bond = Math.max(1, Math.floor(level / 3));
      return beast;
    });
    return { name: tamer.name, title: tamer.title, controller: 'ai' as DuelController, hero, party };
  });
}

/**
 * A true mirror: your own build, your own beasts, a different hand of luck and
 * different temperaments. The fairest possible test of play over roster.
 */
export function makeMirrorSide(hero: Character, party: MonsterInstance[], seed: number): DuelSetupSide {
  const cursor: RngCursor = { seed: seed >>> 0, rngCalls: 0 };
  return withSeededRandom(cursor, () => {
    const shade = hero.clone();
    shade.name = `${hero.name}'s Reflection`;
    const beasts = party.slice(0, DUEL_PARTY_MAX).map((m) => {
      const copy = m.clone();
      copy.uid = `mirror-${m.uid}`;
      copy.personalityId = PERSONALITIES[Math.floor(Math.random() * PERSONALITIES.length)].id;
      copy.isTamed = true;
      copy.deriveStats();
      copy.hp = copy.maxHp;
      copy.mp = copy.maxMp;
      return copy;
    });
    return { name: shade.name, title: 'wearing your face', controller: 'ai' as DuelController, hero: shade, party: beasts };
  });
}

/** Beasts with no cards contribute nothing to a deck — the setup screen says so. */
export function beastContributesCards(m: MonsterInstance): boolean {
  return (SPECIES_CARDS[m.speciesId]?.length ?? 0) > 0;
}
