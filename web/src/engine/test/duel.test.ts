import { describe, it, expect } from 'vitest';
import { Character } from '../entities/Character';
import { MonsterInstance } from '../entities/MonsterInstance';
import { SPECIES, speciesById } from '../data/species';
import { SPECIES_CARDS, TAME_CARD_ID, getCard } from '../data/cards';
import { PERSONALITIES } from '../data/personalities';
import { RIVAL_TAMERS, rivalById, rivalsForLevel, DUEL_PARTY_MAX } from '../data/duelParty';
import type { FxEvent } from '../types';
import {
  applyDuelAction,
  chooseDuelAction,
  createDuel,
  duelAimableUids,
  duelCardAction,
  duelDigest,
  DUEL_FOE_HERO_UID,
  effectiveCardCost,
  isLegalDuelAction,
  localizeDuelFx,
  LocalTransport,
  makeMirrorSide,
  makeRivalSide,
  otherSide,
  validateDuelSetup,
  viewFor,
  type DuelAction,
  type DuelMatch,
  type DuelSetup,
  type DuelSetupSide,
  type DuelSideId,
  type DuelView,
} from '../systems/duel';

// ---------------------------------------------------------------------------
// Fixtures — deterministic by construction (no Math.random at build time
// except MonsterInstance personality, which we always pin explicitly).
// ---------------------------------------------------------------------------

function beast(speciesId: string, level: number, nickname: string, personalityId: string): MonsterInstance {
  const m = new MonsterInstance({ speciesId, level, nickname, personalityId });
  m.isTamed = true;
  return m;
}

function playerSide(overrides: Partial<DuelSetupSide> = {}): DuelSetupSide {
  return {
    name: 'Aria',
    title: 'challenger',
    controller: 'human',
    hero: new Character('Aria', 'Human', 'Warrior'),
    party: [beast('fangPup', 5, 'Nib', 'valiant'), beast('sproutling', 5, 'Sprig', 'doting')],
    ...overrides,
  };
}

function aiSide(overrides: Partial<DuelSetupSide> = {}): DuelSetupSide {
  return {
    name: 'Halbrecht',
    title: 'the Kennelmaster',
    controller: 'ai',
    hero: new Character('Halbrecht', 'Dwarf', 'Knight'),
    party: [beast('duskhound', 5, 'Sentry', 'valiant'), beast('gelKnight', 5, 'Squire', 'stoic')],
    ...overrides,
  };
}

function setup(seed = 12345, a = playerSide(), b = aiSide()): DuelSetup {
  return { seed, matchId: 'test-duel', a, b };
}

const immediate = (fn: () => void) => fn();

const DUEL_SIDES_UNDER_TEST: DuelSideId[] = ['a', 'b'];

/** Play a whole duel with both seats driven by the duel AI. */
function runAutoDuel(seed: number, maxActions = 4000): LocalTransport {
  const transport = new LocalTransport(
    { ...setup(seed), a: { ...playerSide(), controller: 'ai' } },
    { schedule: immediate, aiDelayMs: 0, localSide: 'a' },
  );
  let guard = 0;
  while (transport.snapshot().outcome.kind === 'ongoing' && guard++ < maxActions) {
    const match = transport.snapshot();
    // Both sides are AI here, so the transport pump does the work; this loop
    // only exists to prove it terminates.
    if (match.turn === transport.localSide && match.sides[match.turn].controller !== 'ai') {
      transport.submitAction(chooseDuelAction(match, match.turn));
    } else {
      break;
    }
  }
  return transport;
}

/**
 * Deterministic scripted policy for the human seat: always play hand index 0
 * if legal, otherwise end the turn. Used by the determinism tests so the
 * "same action log" half of the property is genuinely reproducible.
 */
function scriptedHumanAction(match: DuelMatch, side: DuelSideId): DuelAction {
  const battle = match.sides[side].battle;
  for (let i = 0; i < battle.hand.length; i++) {
    const targetUid = battle.enemies.find((e) => e.isAlive())?.uid;
    const action: DuelAction = { kind: 'playCard', side, handIndex: i, targetUid };
    if (isLegalDuelAction(match, action)) return action;
  }
  return { kind: 'endTurn', side };
}

function playScriptedDuel(seed: number): { transport: LocalTransport; log: DuelAction[] } {
  const transport = new LocalTransport(setup(seed), { schedule: immediate, aiDelayMs: 0 });
  let guard = 0;
  while (transport.snapshot().outcome.kind === 'ongoing' && guard++ < 600) {
    const match = transport.snapshot();
    if (match.turn !== transport.localSide) break; // AI pump stalled — should not happen
    transport.submitAction(scriptedHumanAction(match, transport.localSide));
  }
  return { transport, log: [...transport.actionLog] };
}

// ---------------------------------------------------------------------------

describe('duel setup validity', () => {
  it('accepts a well-formed pair of tamers', () => {
    expect(validateDuelSetup(setup())).toEqual({ ok: true, errors: [] });
  });

  it('rejects a tamer who brings no beasts', () => {
    const result = validateDuelSetup(setup(1, playerSide({ party: [] })));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/at least one beast/i);
  });

  it('rejects a party over the ring limit', () => {
    const party = [
      beast('fangPup', 4, 'A', 'valiant'),
      beast('sproutling', 4, 'B', 'doting'),
      beast('goober', 4, 'C', 'craven'),
      beast('peckerel', 4, 'D', 'bright'),
    ];
    const result = validateDuelSetup(setup(1, playerSide({ party })));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain(`no more than ${DUEL_PARTY_MAX}`);
  });

  it('rejects the same beast entered on both sides', () => {
    const shared = beast('fangPup', 4, 'Nib', 'valiant');
    const result = validateDuelSetup(setup(1, playerSide({ party: [shared] }), aiSide({ party: [shared] })));
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/same beast/i);
  });

  it('createDuel refuses an invalid setup instead of starting a broken match', () => {
    expect(() => createDuel(setup(1, playerSide({ party: [] })))).toThrow(/Invalid duel setup/);
  });

  it('shares combatants across both battle views so one board cannot desync', () => {
    const match = createDuel(setup());
    expect(match.sides.a.battle.enemies).toEqual(match.sides.b.party);
    for (const [i, enemy] of match.sides.a.battle.enemies.entries()) {
      expect(enemy).toBe(match.sides.b.party[i]);
    }
    for (const [i, enemy] of match.sides.b.battle.enemies.entries()) {
      expect(enemy).toBe(match.sides.a.party[i]);
    }
  });

  it('never mutates the entities the caller handed over', () => {
    const mine = playerSide();
    const hpBefore = mine.party[0].hp;
    const heroHpBefore = mine.hero.hp;
    const match = createDuel(setup(7, mine));
    match.sides.a.party[0].takeDamage(9999);
    match.sides.a.hero.takeDamage(9999);
    expect(mine.party[0].hp).toBe(hpBefore);
    expect(mine.hero.hp).toBe(heroHpBefore);
  });

  it('builds real decks from both tamers and strips Reach Out — you do not tame a rival beast', () => {
    const match = createDuel(setup());
    for (const side of [match.sides.a, match.sides.b]) {
      const all = [...side.battle.drawPile, ...side.battle.hand];
      expect(all.length).toBeGreaterThan(8);
      expect(all.some((c) => c.cardId === TAME_CARD_ID)).toBe(false);
      // Species cards from the tamer's own beasts made it into the deck.
      expect(all.some((c) => !!c.sourceMonsterUid)).toBe(true);
      for (const c of all) expect(getCard(c.cardId)).toBeTruthy();
    }
  });

  it('opens with a full hand, full Vigor, and a telegraph on every enemy beast', () => {
    const match = createDuel(setup());
    for (const side of [match.sides.a, match.sides.b]) {
      expect(side.battle.hand.length).toBeGreaterThan(0);
      expect(side.battle.energy).toBe(side.battle.maxEnergy);
      for (const enemy of side.battle.enemies) expect(side.battle.intents[enemy.uid]).toBeTruthy();
    }
    expect(match.outcome).toEqual({ kind: 'ongoing' });
    expect(match.round).toBe(1);
  });
});

describe('duel opponents', () => {
  it('every authored rival is playable: known species, known personality, cards to bring', () => {
    expect(RIVAL_TAMERS.length).toBeGreaterThanOrEqual(4);
    const personalities = new Set(PERSONALITIES.map((p) => p.id));
    const ids = new Set<string>();
    for (const tamer of RIVAL_TAMERS) {
      expect(ids.has(tamer.id)).toBe(false);
      ids.add(tamer.id);
      expect(tamer.beasts.length).toBeGreaterThan(0);
      expect(tamer.beasts.length).toBeLessThanOrEqual(DUEL_PARTY_MAX);
      expect(tamer.statPriority.length).toBeGreaterThan(0);
      for (const b of tamer.beasts) {
        expect(speciesById(b.speciesId), `${tamer.id}: unknown species ${b.speciesId}`).toBeTruthy();
        expect(SPECIES_CARDS[b.speciesId]?.length ?? 0, `${tamer.id}: ${b.speciesId} has no cards`).toBeGreaterThan(0);
        expect(personalities.has(b.personalityId), `${tamer.id}: unknown personality ${b.personalityId}`).toBe(true);
      }
      expect(rivalById(tamer.id)).toBe(tamer);
    }
  });

  it('rivalsForLevel puts the closest band first', () => {
    const near = rivalsForLevel(1)[0];
    expect(near.band).toBeLessThanOrEqual(5);
    const deep = rivalsForLevel(30)[0];
    expect(deep.band).toBeGreaterThanOrEqual(18);
  });

  it('makeRivalSide scales an authored tamer to the agreed band, reproducibly', () => {
    const tamer = rivalById('halbrecht')!;
    const one = makeRivalSide(tamer, 14, 99);
    const two = makeRivalSide(tamer, 14, 99);
    expect(one.hero.level).toBe(14);
    expect(one.party.length).toBe(tamer.beasts.length);
    expect(one.hero.maxHp).toBe(two.hero.maxHp);
    expect(one.party.map((m) => m.maxHp)).toEqual(two.party.map((m) => m.maxHp));
    expect(validateDuelSetup({ seed: 1, a: playerSide(), b: one }).ok).toBe(true);
  });

  it('makeMirrorSide fields your own build back at you', () => {
    const mine = playerSide();
    const mirror = makeMirrorSide(mine.hero, mine.party, 4242);
    expect(mirror.party.map((m) => m.speciesId)).toEqual(mine.party.map((m) => m.speciesId));
    expect(mirror.hero.level).toBe(mine.hero.level);
    // Distinct uids, so both sides can legally enter the same ring.
    expect(validateDuelSetup({ seed: 1, a: mine, b: mirror }).ok).toBe(true);
  });
});

describe('duel action legality', () => {
  it('rejects actions from the side that is not to move', () => {
    const match = createDuel(setup());
    const idle = otherSide(match.turn);
    expect(isLegalDuelAction(match, { kind: 'endTurn', side: idle })).toBe(false);
    expect(isLegalDuelAction(match, { kind: 'endTurn', side: match.turn })).toBe(true);
  });

  it('rejects an out-of-range hand index, an unaffordable card, and a dead target', () => {
    const match = createDuel(setup());
    const side = match.turn;
    const battle = match.sides[side].battle;
    expect(isLegalDuelAction(match, { kind: 'playCard', side, handIndex: 99 })).toBe(false);
    expect(isLegalDuelAction(match, { kind: 'playCard', side, handIndex: -1 })).toBe(false);
    expect(isLegalDuelAction(match, { kind: 'playCard', side, handIndex: 0, targetUid: 'no-such-beast' })).toBe(false);

    battle.energy = 0;
    const anyCosted = battle.hand.findIndex((c) => effectiveCardCost(match.sides[side].hero, battle, getCard(c.cardId)!) > 0);
    if (anyCosted >= 0) {
      expect(isLegalDuelAction(match, { kind: 'playCard', side, handIndex: anyCosted })).toBe(false);
    }
  });

  it('an illegal action returns the identical match — a server rejects without desyncing', () => {
    const match = createDuel(setup());
    const bad: DuelAction = { kind: 'endTurn', side: otherSide(match.turn) };
    expect(applyDuelAction(match, bad)).toBe(match);
  });

  it('a legal action produces a new match and leaves the previous one untouched', () => {
    const match = createDuel(setup());
    const before = duelDigest(match);
    const next = applyDuelAction(match, { kind: 'endTurn', side: match.turn });
    expect(next).not.toBe(match);
    expect(duelDigest(match)).toBe(before);
    expect(next.seq).toBe(match.seq + 1);
    expect(next.turn).toBe(otherSide(match.turn));
  });

  it('conceding hands the duel to the other tamer', () => {
    const match = createDuel(setup());
    const next = applyDuelAction(match, { kind: 'concede', side: match.turn });
    expect(next.outcome).toEqual({ kind: 'win', winner: otherSide(match.turn), reason: 'concede' });
    // A finished match accepts nothing further.
    expect(applyDuelAction(next, { kind: 'endTurn', side: next.turn })).toBe(next);
  });
});

describe('duel opponent AI', () => {
  it('only ever produces legal actions, across a long match', () => {
    let match = createDuel(setup(777, { ...playerSide(), controller: 'ai' }));
    let guard = 0;
    let plays = 0;
    while (match.outcome.kind === 'ongoing' && guard++ < 800) {
      const action = chooseDuelAction(match, match.turn);
      expect(action.side).toBe(match.turn);
      expect(isLegalDuelAction(match, action), `illegal AI action: ${JSON.stringify(action)}`).toBe(true);
      if (action.kind === 'playCard') plays++;
      const next = applyDuelAction(match, action);
      expect(next).not.toBe(match); // legal actions must always advance the match
      match = next;
    }
    expect(plays).toBeGreaterThan(0);
    expect(match.outcome.kind).not.toBe('ongoing');
  });

  it('never aims at a dead or foreign beast', () => {
    let match = createDuel(setup(31337, { ...playerSide(), controller: 'ai' }));
    let guard = 0;
    while (match.outcome.kind === 'ongoing' && guard++ < 400) {
      const action = chooseDuelAction(match, match.turn);
      if (action.kind === 'playCard' && action.targetUid) {
        const side = match.sides[action.side];
        const known =
          side.battle.enemies.some((e) => e.uid === action.targetUid && e.isAlive()) ||
          side.party.some((m) => m.uid === action.targetUid && m.isAlive());
        expect(known).toBe(true);
      }
      match = applyDuelAction(match, action);
    }
  });

  it('ends its turn rather than stalling when it cannot afford anything', () => {
    const match = createDuel(setup(5));
    const side = match.sides[match.turn];
    side.battle.energy = 0;
    // Free-card traits would still allow a play; spend those too, then leave
    // only cards that actually cost Vigor in hand.
    side.battle.firstCardUsed = true;
    side.battle.freeStrikeUsed = true;
    side.battle.hand = side.battle.hand.filter((c) => (getCard(c.cardId)?.cost ?? 0) > 0);
    expect(side.battle.hand.length).toBeGreaterThan(0);
    expect(chooseDuelAction(match, match.turn).kind).toBe('endTurn');
  });

  it('ends its turn on an empty hand', () => {
    const match = createDuel(setup(6));
    match.sides[match.turn].battle.hand = [];
    expect(chooseDuelAction(match, match.turn).kind).toBe('endTurn');
  });
});

describe('duel transport contract', () => {
  it('pushes the current view on subscribe and on every accepted action', () => {
    const transport = new LocalTransport(setup(2024), { schedule: immediate, aiDelayMs: 0 });
    const seen: DuelView[] = [];
    const off = transport.onState((v) => seen.push(v));
    expect(seen.length).toBe(1);
    expect(seen[0].matchId).toBe('test-duel');

    const first = seen.length;
    transport.submitAction({ kind: 'endTurn', side: transport.localSide });
    expect(seen.length).toBeGreaterThan(first);

    off();
    const afterUnsub = seen.length;
    transport.submitAction({ kind: 'endTurn', side: transport.localSide });
    expect(seen.length).toBe(afterUnsub);
    transport.dispose();
  });

  it('drops actions submitted on behalf of the other seat', () => {
    const transport = new LocalTransport(setup(11), { schedule: immediate, aiDelayMs: 0 });
    const seq = transport.snapshot().seq;
    transport.submitAction({ kind: 'endTurn', side: otherSide(transport.localSide) });
    expect(transport.snapshot().seq).toBe(seq);
    transport.dispose();
  });

  it('accepts nothing after dispose', () => {
    const transport = new LocalTransport(setup(12), { schedule: immediate, aiDelayMs: 0 });
    transport.dispose();
    const seq = transport.snapshot().seq;
    transport.submitAction({ kind: 'endTurn', side: transport.localSide });
    expect(transport.snapshot().seq).toBe(seq);
  });

  it('redacts the opponent: counts and telegraphs, never their hand or draw order', () => {
    const match = createDuel(setup(808));
    const view = viewFor(match, 'a');
    expect(view.you.hand.length).toBe(match.sides.a.battle.hand.length);
    expect(view.foe.handCount).toBe(match.sides.b.battle.hand.length);
    expect((view.foe as unknown as { hand?: unknown }).hand).toBeUndefined();
    expect(Object.keys(view.foe.intents).length).toBe(match.sides.b.party.length);
    // Ward on a beast is public in both directions; the hand behind it is not.
    match.sides.a.battle.enemyBlock[match.sides.b.party[0].uid] = 9;
    expect(viewFor(match, 'a').foe.beastBlock[match.sides.b.party[0].uid]).toBe(9);
    expect(viewFor(match, 'b').you.beastBlock[match.sides.b.party[0].uid]).toBe(9);
    // Both players' redacted views agree about the public board.
    const other = viewFor(match, 'b');
    expect(other.foe.party).toEqual(view.you.party);
    expect(other.you.party).toEqual(view.foe.party);
  });

  it('drives the AI seat automatically so the human seat always gets the turn back', () => {
    const transport = new LocalTransport(setup(99), { schedule: immediate, aiDelayMs: 0 });
    transport.submitAction({ kind: 'endTurn', side: transport.localSide });
    const match = transport.snapshot();
    // Either the opponent finished its turn and handed play back, or the duel ended.
    expect(match.outcome.kind !== 'ongoing' || match.turn === transport.localSide).toBe(true);
    transport.dispose();
  });

  it('plays end to end: a scripted duel reaches a decisive result', () => {
    const { transport } = playScriptedDuel(4242);
    const match = transport.snapshot();
    expect(match.outcome.kind).not.toBe('ongoing');
    if (match.outcome.kind === 'win') {
      const loser = match.sides[otherSide(match.outcome.winner)];
      expect(loser.hero.isAlive() && loser.party.some((m) => m.isAlive())).toBe(false);
    }
    expect(match.log.length).toBeGreaterThan(5);
    transport.dispose();
  });

  it('bot-vs-bot terminates', () => {
    const transport = runAutoDuel(20260724);
    expect(transport.snapshot().outcome.kind).not.toBe('ongoing');
    transport.dispose();
  });
});

describe('duel determinism (server authority)', () => {
  it('same seed + same action log ⇒ identical end state', () => {
    const first = playScriptedDuel(31415);
    const second = playScriptedDuel(31415);
    expect(duelDigest(second.transport.snapshot())).toBe(duelDigest(first.transport.snapshot()));
    expect(second.log).toEqual(first.log);
  });

  it('replaying a recorded action log against a fresh match reproduces it exactly', () => {
    const { transport, log } = playScriptedDuel(271828);
    const original = transport.snapshot();

    // The server's job: take the seed and the accepted actions, rebuild state.
    let replay = createDuel(setup(271828));
    for (const action of log) {
      const next = applyDuelAction(replay, action);
      expect(next, `replayed action rejected: ${JSON.stringify(action)}`).not.toBe(replay);
      replay = next;
    }
    expect(duelDigest(replay)).toBe(duelDigest(original));
    expect(replay.rngCalls).toBe(original.rngCalls);
    expect(replay.seq).toBe(original.seq);
  });

  it('a different seed produces a different match from the same rosters', () => {
    const a = playScriptedDuel(101).transport.snapshot();
    const b = playScriptedDuel(202).transport.snapshot();
    expect(duelDigest(a)).not.toBe(duelDigest(b));
  });

  it('the AI decides off the match state alone — no hidden mutable memory', () => {
    const match = createDuel(setup(646464, { ...playerSide(), controller: 'ai' }));
    const first = chooseDuelAction(match, match.turn);
    const again = chooseDuelAction(match, match.turn);
    expect(again).toEqual(first);
  });
});

// ---------------------------------------------------------------------------
// v20: the duel is drawn by the single-player battlefield (BattleStage). These
// cover the seam between the two — the pure half of the adapter, which is the
// half that can leak information or emit an action the authority will reject.
// ---------------------------------------------------------------------------

describe('the redaction boundary (v20: the battlefield renders from this view)', () => {
  it('NEVER lets the opponent hand or pile CONTENTS reach the view model', () => {
    // Play a while first so all four of their piles hold something.
    const { transport } = playScriptedDuel(9182736);
    const match = transport.snapshot();

    for (const side of DUEL_SIDES_UNDER_TEST) {
      const foeSide = match.sides[otherSide(side)];
      const secrets = [
        ...foeSide.battle.hand,
        ...foeSide.battle.drawPile,
        ...foeSide.battle.discardPile,
        ...foeSide.battle.exhaustPile,
      ].map((c) => c.uid);
      expect(secrets.length, 'the fixture must actually hold cards to hide').toBeGreaterThan(8);

      const view = viewFor(match, side);
      // The strong form: not one of their card instances appears ANYWHERE in
      // the foe projection, at any depth, under any key.
      const serialised = JSON.stringify(view.foe);
      for (const uid of secrets) {
        expect(serialised.includes(uid), `foe view leaked card instance ${uid}`).toBe(false);
      }
      // And the shape says so too: counts only, no card arrays.
      const foeKeys = Object.keys(view.foe);
      for (const forbidden of ['hand', 'drawPile', 'discardPile', 'exhaustPile']) {
        expect(foeKeys, `foe view must not carry ${forbidden}`).not.toContain(forbidden);
      }
      expect(view.foe.handCount).toBe(foeSide.battle.hand.length);
      expect(view.foe.drawCount).toBe(foeSide.battle.drawPile.length);
    }
    transport.dispose();
  });

  it('gives YOU your own piles, so the battlefield can inspect Deck/Embers/Ashes', () => {
    const { transport } = playScriptedDuel(5150);
    const match = transport.snapshot();
    const view = viewFor(match, 'a');
    expect(view.you.drawPile.map((c) => c.uid)).toEqual(match.sides.a.battle.drawPile.map((c) => c.uid));
    expect(view.you.discardPile.map((c) => c.uid)).toEqual(match.sides.a.battle.discardPile.map((c) => c.uid));
    expect(view.you.exhaustPile.map((c) => c.uid)).toEqual(match.sides.a.battle.exhaustPile.map((c) => c.uid));
    // Copies, not the live arrays — the UI cannot reach in and reorder a deck.
    expect(view.you.drawPile).not.toBe(match.sides.a.battle.drawPile);
    // Both sides' turn counters are public (the hand fan re-deals on them).
    expect(view.you.turn).toBe(match.sides.a.battle.turn);
    expect(view.foe.turn).toBe(match.sides.b.battle.turn);
    transport.dispose();
  });

  it('reports which side produced the fx, so the UI can re-address it', () => {
    const match = createDuel(setup(4321));
    expect(match.lastFx).toEqual([]);
    expect(viewFor(match, 'a').fxFrom).toBe(null);
    const acted = applyDuelAction(match, { kind: 'endTurn', side: match.turn });
    expect(viewFor(acted, 'a').fxFrom).toBe(match.turn);
    expect(viewFor(acted, 'b').fxFrom).toBe(match.turn);
  });
});

describe('duel fx localization (one battlefield, two uid spaces)', () => {
  const stream: FxEvent[] = [
    { fx: 'actor', uid: 'hero', label: 'Cleave', side: 'ally' },
    { fx: 'actor', uid: 'b1', label: 'Instinct', side: 'ally' },
    { fx: 'slash', targetUid: 'a0', amount: 7 },
    { fx: 'heal', targetUid: 'hero', amount: 4 },
    { fx: 'ko', targetUid: 'a1' },
    { fx: 'shake' },
  ];

  it('is the identity when the events came from this client', () => {
    expect(localizeDuelFx(stream, 'a', 'a')).toBe(stream);
    expect(localizeDuelFx(stream, null, 'a')).toBe(stream);
    expect(localizeDuelFx([], 'b', 'a')).toEqual([]);
  });

  it("re-addresses the opponent's stream: their tamer, and ally/enemy flipped", () => {
    const local = localizeDuelFx(stream, 'b', 'a');
    expect(local).not.toBe(stream);
    expect(local[0]).toEqual({ fx: 'actor', uid: DUEL_FOE_HERO_UID, label: 'Cleave', side: 'enemy' });
    // A beast keeps its slot uid — those are global — but the side flips.
    expect(local[1]).toEqual({ fx: 'actor', uid: 'b1', label: 'Instinct', side: 'enemy' });
    // Damage landing on OUR beast is already addressed correctly.
    expect(local[2]).toBe(stream[2]);
    expect(local[3]).toEqual({ fx: 'heal', targetUid: DUEL_FOE_HERO_UID, amount: 4 });
    expect(local[4]).toBe(stream[4]);
    expect(local[5]).toBe(stream[5]);
    // And the original is untouched — a view may be rendered by both seats.
    expect(stream[0]).toEqual({ fx: 'actor', uid: 'hero', label: 'Cleave', side: 'ally' });
  });

  it('cannot collide with a beast slot uid', () => {
    const match = createDuel(setup(77));
    const uids = [...match.sides.a.party, ...match.sides.b.party].map((m) => m.uid);
    expect(uids).not.toContain(DUEL_FOE_HERO_UID);
    expect(uids).not.toContain('hero');
  });
});

describe('duel adapter actions (what the battlefield submits)', () => {
  it('every uid the battlefield can aim at is one the authority accepts', () => {
    const match = createDuel(setup(31122));
    const side = match.turn;
    const view = viewFor(match, side);
    const affordable = view.you.hand.findIndex(
      (c) => effectiveCardCost(match.sides[side].hero, match.sides[side].battle, getCard(c.cardId)!) <= view.you.energy,
    );
    expect(affordable).toBeGreaterThanOrEqual(0);

    const aimable = duelAimableUids(view);
    expect(aimable).toContain('hero');
    expect(aimable).toContain(view.foe.party[0].uid);
    expect(aimable).toContain(view.you.party[0].uid);
    for (const uid of aimable) {
      const action = duelCardAction(side, affordable, uid);
      expect(isLegalDuelAction(match, action), `rejected an aimable uid: ${uid}`).toBe(true);
      expect(applyDuelAction(match, action)).not.toBe(match);
    }
    // The untargeted form (a self card) is legal too, and a made-up uid is not.
    expect(isLegalDuelAction(match, duelCardAction(side, affordable))).toBe(true);
    expect(isLegalDuelAction(match, duelCardAction(side, affordable, 'not-a-uid'))).toBe(false);
  });

  it('a felled beast leaves the aimable set', () => {
    const match = createDuel(setup(6161));
    const doomed = match.sides.b.party[0];
    doomed.takeDamage(99999);
    expect(doomed.isAlive()).toBe(false);
    const view = viewFor(match, 'a');
    expect(duelAimableUids(view)).not.toContain(doomed.uid);
    expect(isLegalDuelAction(match, duelCardAction('a', 0, doomed.uid))).toBe(false);
  });

  it('the transport accepts the exact action the battlefield builds from a view', () => {
    const transport = new LocalTransport(setup(2718281), { schedule: immediate, aiDelayMs: 0 });
    const view = transport.currentView();
    // The pump has already played the opponent's turn out if they won the toss,
    // so the human seat is on move — otherwise this test proves nothing.
    expect(view.yourTurn).toBe(true);
    const before = transport.snapshot().seq;
    const target = view.foe.party.find((m) => m.isAlive())!.uid;
    const idx = view.you.hand.findIndex((c) => (getCard(c.cardId)?.cost ?? 99) <= view.you.energy);
    expect(idx).toBeGreaterThanOrEqual(0);
    transport.submitAction(duelCardAction(transport.localSide, idx, target));
    expect(transport.snapshot().seq).toBe(before + 1);
    // And the fx it produced is addressed to THIS seat, unchanged.
    const after = transport.currentView();
    expect(after.fxFrom).toBe(transport.localSide);
    expect(localizeDuelFx(after.fx, after.fxFrom, after.you.id)).toBe(after.fx);
    transport.dispose();
  });
});

describe('duel data sanity', () => {
  it('every species a rival can field still exists in the bestiary', () => {
    for (const tamer of RIVAL_TAMERS) {
      for (const b of tamer.beasts) expect(Object.keys(SPECIES)).toContain(b.speciesId);
    }
  });
});
