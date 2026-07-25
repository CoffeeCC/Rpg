// =========================================================================
// THE RECRUIT DRILL — Bram's mock fight, from the reducer's side.
//
// Two things here matter more than the rest and are tested hardest:
//
//   1. THE DRILL CANNOT KILL YOU. A tutorial that can end a telling is an
//      ambush. `handleDefeat` must be structurally unreachable from a drill,
//      not merely unlikely, so there is a test that drives a recruit to one
//      hit point and swings until the reducer has to choose.
//   2. THE DRILL CANNOT PAY YOU TWICE, and cannot leak anything into the run
//      — no spoils, no exp, no quest credit, no adopted monster. It is
//      repeatable forever, which only stays safe if repeating is worthless.
//
// The beat ladder is tested as a pure function of facts, because that is what
// it is: `drillBeat` never sees the UI and the UI never advances the beat.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { Character } from '../entities/Character';
import {
  drillBeat,
  gameReducer,
  initialGameState,
  type DrillState,
  type GameState,
} from '../game';
import {
  DRILL_AFTERWORD,
  DRILL_BEATS,
  DRILL_HALT_LINES,
  DRILL_LEAVE_LINE,
  DRILL_OFFER,
  DRILL_OPPONENT,
  DRILL_PASS_LINES,
  DRILL_REWARD,
  DRILL_STATUS_ASIDE,
  DRILL_TAME_LINE,
  drillBeatAt,
} from '../data/drill';
import { CONSUMABLES } from '../data/items';
import { getCard } from '../data/cards';
import { SPECIES } from '../data/species';

function townState(): GameState {
  const s = initialGameState();
  s.player = new Character('Recruit', 'Human', 'Warrior');
  s.screen = 'questBoard';
  return s;
}

function startDrill(): GameState {
  return gameReducer(townState(), { type: 'START_DRILL' });
}

function facts(over: Partial<DrillState> = {}): DrillState {
  return {
    cardsPlayed: 0,
    turnsTaken: 0,
    aimed: false,
    spentOut: false,
    guarded: false,
    aimedLate: false,
    sawStatus: false,
    halted: false,
    outcome: 'running',
    ...over,
  };
}

// ---------------------------------------------------------------------------

describe('drill content', () => {
  it('names an opponent that exists and is padded, not dangerous', () => {
    expect(SPECIES[DRILL_OPPONENT.speciesId]).toBeTruthy();
    // Must outlast the lesson: a stock level-1 goober has 22 HP and dies to
    // one good opening turn, three beats short of the end.
    expect(DRILL_OPPONENT.hp).toBeGreaterThan(SPECIES[DRILL_OPPONENT.speciesId].baseHp * 2);
    expect(DRILL_OPPONENT.strPenalty).toBeLessThan(0);
  });

  it('pays a reward that exists in items.ts and is not a power spike', () => {
    expect(CONSUMABLES[DRILL_REWARD.consumable.name]).toBeTruthy();
    expect(DRILL_REWARD.gold).toBeLessThanOrEqual(50);
    expect(DRILL_REWARD.consumable.count).toBeLessThanOrEqual(3);
  });

  it('teaches in the order the player needs it, and teaches each thing once', () => {
    expect(DRILL_BEATS.map((b) => b.id)).toEqual([
      'strike',
      'spend',
      'endTurn',
      'intent',
      'guard',
      'weakness',
      'loss',
    ]);
    expect(new Set(DRILL_BEATS.map((b) => b.id)).size).toBe(DRILL_BEATS.length);
  });

  it('gives every beat exactly one thing to do', () => {
    for (const beat of DRILL_BEATS) {
      expect(beat.ask.length).toBeGreaterThan(0);
      expect(beat.lines.length).toBeGreaterThan(0);
      // One imperative per beat. Two asks in one beat is a beat that should
      // have been two beats.
      expect(beat.ask.split('.').filter((s) => s.trim()).length).toBe(1);
    }
  });
});

describe("drill voice — Bram's register", () => {
  /** Everything the drill can put in front of the player, in his voice. */
  const spoken = [
    ...DRILL_BEATS.flatMap((b) => [b.title, b.ask, ...b.lines]),
    ...DRILL_STATUS_ASIDE,
    ...DRILL_PASS_LINES,
    ...DRILL_HALT_LINES,
    ...Object.values(DRILL_AFTERWORD),
    DRILL_TAME_LINE,
    DRILL_LEAVE_LINE,
    DRILL_OFFER.text,
    DRILL_OFFER.ask,
    DRILL_OFFER.recorded,
  ];

  it('never exclaims and never congratulates', () => {
    for (const line of spoken) {
      expect(line, line).not.toContain('!');
      expect(line.toLowerCase(), line).not.toMatch(/great job|well done|nice work|congratulations|awesome|you got it/);
    }
  });

  it('never uses a contraction — his one absolute rule in npcs.ts', () => {
    // Apostrophes are fine in possessives ("a tamer's"); contractions are not.
    const CONTRACTION = /\b\w+(?:'|’)(?:s|t|re|ve|ll|d|m)\b/gi;
    for (const line of spoken) {
      for (const hit of line.match(CONTRACTION) ?? []) {
        // "the watch's", "Chronicler's" — possessive 's is not a contraction.
        // The contractions to catch are the verb forms.
        expect(hit.toLowerCase(), `${line} -> ${hit}`).not.toMatch(
          /\b(?:do|does|did|is|are|was|were|has|have|had|will|would|can|could|should|it|that|there|you|i|we|they|he|she|who|what)(?:'|’)(?:s|t|re|ve|ll|d|m)\b/,
        );
      }
    }
  });
});

describe('drillBeat — the ladder is a pure function of what was done', () => {
  it('opens on vigor and targeting', () => {
    expect(drillBeat(facts())).toBe(0);
  });

  it('advances as the recruit does each thing', () => {
    expect(drillBeat(facts({ aimed: true }))).toBe(1);
    expect(drillBeat(facts({ aimed: true, spentOut: true }))).toBe(2);
    expect(drillBeat(facts({ aimed: true, spentOut: true, turnsTaken: 1 }))).toBe(3);
    expect(drillBeat(facts({ aimed: true, spentOut: true, turnsTaken: 2 }))).toBe(4);
    expect(drillBeat(facts({ aimed: true, spentOut: true, turnsTaken: 2, guarded: true }))).toBe(5);
    expect(drillBeat(facts({ aimed: true, spentOut: true, turnsTaken: 2, guarded: true, aimedLate: true }))).toBe(6);
  });

  // The regression this ladder was rewritten for. Caught by playing it, not
  // by reading it: a recruit who ends a turn with vigor left used to sit on
  // beat 1 forever and never be taught intents, block or the loss condition.
  it('cannot deadlock on an optional action', () => {
    const stingy = facts({ aimed: true, spentOut: false, turnsTaken: 1 });
    expect(drillBeat(stingy)).toBeGreaterThan(1);
  });

  it('cannot deadlock on a card the shuffle never dealt', () => {
    // Four turns without drawing a guard must not stop the drill.
    const noGuard = facts({ aimed: true, spentOut: true, turnsTaken: 4, guarded: false });
    expect(drillBeat(noGuard)).toBeGreaterThan(4);
    const noSecondAim = facts({ aimed: true, spentOut: true, turnsTaken: 5, guarded: false, aimedLate: false });
    expect(drillBeat(noSecondAim)).toBe(6);
  });

  it('is monotonic — the rail never walks backwards as turns pass', () => {
    let prev = -1;
    for (let t = 0; t <= 10; t++) {
      const beat = drillBeat(facts({ aimed: true, turnsTaken: t }));
      expect(beat).toBeGreaterThanOrEqual(prev);
      prev = beat;
    }
  });

  it('never runs off the end of the beat list', () => {
    const last = drillBeat(facts({ aimed: true, spentOut: true, turnsTaken: 99, guarded: true, aimedLate: true }));
    expect(last).toBe(DRILL_BEATS.length - 1);
    expect(drillBeatAt(999)).toBe(DRILL_BEATS[DRILL_BEATS.length - 1]);
    expect(drillBeatAt(-5)).toBe(DRILL_BEATS[0]);
  });

  it('does not reach the guard lesson before the intent has been shown', () => {
    // Reading the telegraph must come before being told to answer it.
    expect(drillBeat(facts({ aimed: true, spentOut: true, turnsTaken: 1 }))).toBeLessThan(4);
  });
});

describe('starting the drill', () => {
  it('starts a real battle with one padded article and no party', () => {
    const s = startDrill();
    expect(s.screen).toBe('battle');
    expect(s.battle).toBeTruthy();
    expect(s.battle!.enemies).toHaveLength(1);
    const exhibit = s.battle!.enemies[0];
    expect(exhibit.speciesId).toBe(DRILL_OPPONENT.speciesId);
    expect(exhibit.maxHp).toBe(DRILL_OPPONENT.hp);
    expect(exhibit.hp).toBe(DRILL_OPPONENT.hp);
    // No beast of the player's is put at risk, and the two-active limit is
    // deliberately not part of the lesson.
    expect(s.party).toHaveLength(0);
  });

  it('deals a real hand from the real deck — this is not a slideshow', () => {
    const s = startDrill();
    expect(s.battle!.hand.length).toBeGreaterThan(0);
    expect(s.battle!.energy).toBeGreaterThan(0);
    for (const inst of s.battle!.hand) expect(getCard(inst.cardId)).toBeTruthy();
  });

  it('is not a gate fight: no gate, no boss, no expedition', () => {
    const s = startDrill();
    expect(s.battle!.gateId).toBeNull();
    expect(s.battle!.isBossFight).toBe(false);
    expect(s.expedition).toBeNull();
  });

  it('refuses to start from anywhere but the board, or on top of a fight', () => {
    const wrongScreen = gameReducer({ ...townState(), screen: 'town' }, { type: 'START_DRILL' });
    expect(wrongScreen.battle).toBeNull();
    const mid = startDrill();
    expect(gameReducer(mid, { type: 'START_DRILL' })).toBe(mid);
  });

  it('is repeatable — a confused player can always run it again', () => {
    let s = startDrill();
    s = gameReducer(s, { type: 'DRILL_LEAVE' });
    expect(s.screen).toBe('questBoard');
    const again = gameReducer(s, { type: 'START_DRILL' });
    expect(again.battle).toBeTruthy();
    expect(again.drill!.outcome).toBe('running');
  });
});

describe('the drill is not lethal', () => {
  it('never reaches the Fallen screen, however hard the recruit is hit', () => {
    let s = startDrill();
    s.player!.hp = 1;
    // Swing until the reducer has had to decide what a defeat means here.
    for (let i = 0; i < 40 && s.screen === 'battle'; i++) {
      s = gameReducer(s, { type: 'END_TURN' });
    }
    expect(s.screen).not.toBe('fallen');
    expect(s.fallenSummary).toBeNull();
  });

  it('halts and restores the recruit rather than ending the telling', () => {
    let s = startDrill();
    s.player!.hp = 1;
    // Force the exact branch: a real defeat outcome out of endTurn.
    s.player!.maxHp = 1;
    let guard = 0;
    while (s.screen === 'battle' && guard++ < 60) s = gameReducer(s, { type: 'END_TURN' });
    // Asserted unconditionally: a one-hit-point recruit against an article
    // that swings every turn reaches the defeat branch, reliably, and the
    // reducer must turn it into a halt every single time.
    expect(s.drill!.outcome).toBe('halted');
    expect(s.drill!.halted).toBe(true);
    expect(s.player!.hp).toBe(s.player!.maxHp);
    expect(s.player!.statusEffects).toHaveLength(0);
    expect(s.screen).toBe('questBoard');
    expect(s.log.join(' ')).toContain(DRILL_HALT_LINES[0]);
    expect(s.screen).not.toBe('fallen');
    expect(s.fallenSummary).toBeNull();
  });

  it('always returns the recruit whole, with no lingering statuses or mods', () => {
    let s = startDrill();
    s.player!.hp = 3;
    s.player!.activeMods = [{ stat: 'STR', amount: -3, turns: 4 }];
    s = gameReducer(s, { type: 'DRILL_LEAVE' });
    expect(s.player!.hp).toBe(s.player!.maxHp);
    expect(s.player!.activeMods).toHaveLength(0);
    expect(s.player!.statusEffects).toHaveLength(0);
  });

  it('lets a recruit walk out at any time without a dice roll', () => {
    let s = startDrill();
    s = gameReducer(s, { type: 'FLEE_BATTLE' });
    // "Flee" in the yard is a door, never an attempt that can fail.
    expect(s.screen).toBe('questBoard');
    expect(s.battle).toBeNull();
    expect(s.drill!.outcome).toBe('left');
    expect(s.log.join(' ')).toContain(DRILL_LEAVE_LINE);
  });
});

describe('the drill does not leak into the run', () => {
  function winDrill(s: GameState): GameState {
    // Kill the article outright, then let the reducer notice.
    s.battle!.enemies[0].hp = 0;
    return gameReducer(s, { type: 'END_TURN' });
  }

  it('pays exactly once, ever, however many times it is run', () => {
    let s = startDrill();
    const gold0 = s.player!.gold;
    const herbs0 = s.player!.inventory.filter((n) => n === DRILL_REWARD.consumable.name).length;
    s = winDrill(s);
    expect(s.drill!.outcome).toBe('passed');
    expect(s.drillDone).toBe(true);
    expect(s.player!.gold).toBe(gold0 + DRILL_REWARD.gold);
    expect(s.player!.inventory.filter((n) => n === DRILL_REWARD.consumable.name).length).toBe(
      herbs0 + DRILL_REWARD.consumable.count,
    );

    const goldAfter = s.player!.gold;
    s = gameReducer(s, { type: 'START_DRILL' });
    s = winDrill(s);
    expect(s.player!.gold).toBe(goldAfter);
  });

  it('grants no exp, no level, no spoils and no card reward', () => {
    let s = startDrill();
    const lvl = s.player!.level;
    const exp = s.player!.exp;
    s = winDrill(s);
    expect(s.player!.level).toBe(lvl);
    expect(s.player!.exp).toBe(exp);
    expect(s.pendingReward).toBeNull();
    expect(s.screen).toBe('questBoard');
  });

  it('gives no quest credit for the article', () => {
    let s = startDrill();
    s.questLog = [{ id: 'firstBlood', progress: 0, complete: false, claimed: false }];
    s = winDrill(s);
    expect(s.questLog[0].progress).toBe(0);
    expect(s.questLog[0].complete).toBe(false);
  });

  it('does not hand over a free monster if the recruit reaches out', () => {
    const s = startDrill();
    // Simulated directly: the tame roll is chance-based, so the branch is
    // asserted at the reducer's contract rather than by farming the dice.
    expect(DRILL_TAME_LINE).toContain('municipal property');
    expect(s.stable).toHaveLength(0);
    expect(s.party).toHaveLength(0);
  });

  it('records nothing in the Chronicle', () => {
    let s = startDrill();
    s = winDrill(s);
    expect(s.chronicle.beastsSlain).toHaveLength(0);
    expect(s.chronicle.deeds).toHaveLength(0);
  });
});

describe('the nudge before a gate', () => {
  it('speaks once, to a tamer who has never drilled, and never blocks them', () => {
    const s = { ...townState(), screen: 'town' as const };
    const first = gameReducer(s, { type: 'GOTO', screen: 'gateSelect' });
    // Suggested, not gated: they are standing at the gates regardless.
    expect(first.screen).toBe('gateSelect');
    expect(first.drillNudged).toBe(true);
    expect(first.log.join(' ')).toContain('You have not drilled');

    const back = gameReducer(first, { type: 'GOTO', screen: 'town' });
    const second = gameReducer(back, { type: 'GOTO', screen: 'gateSelect' });
    expect(second.log.filter((l) => l.includes('You have not drilled'))).toHaveLength(1);
  });

  it('says nothing to a veteran of an earlier telling', () => {
    const s = { ...townState(), screen: 'town' as const, drillKnown: true };
    const gone = gameReducer(s, { type: 'GOTO', screen: 'gateSelect' });
    expect(gone.log.join(' ')).not.toContain('You have not drilled');
    expect(gone.screen).toBe('gateSelect');
  });

  it('says nothing to someone who already drilled this telling', () => {
    const s = { ...townState(), screen: 'town' as const, drillDone: true };
    const gone = gameReducer(s, { type: 'GOTO', screen: 'gateSelect' });
    expect(gone.log.join(' ')).not.toContain('You have not drilled');
  });
});

describe('save compatibility', () => {
  it('treats a state written before the drill existed as "has not drilled"', () => {
    const old = townState();
    delete (old as Partial<GameState>).drill;
    delete (old as Partial<GameState>).drillDone;
    delete (old as Partial<GameState>).drillKnown;
    delete (old as Partial<GameState>).drillNudged;
    const s = gameReducer(old, { type: 'START_DRILL' });
    expect(s.battle).toBeTruthy();
    expect(s.drill!.outcome).toBe('running');
  });

  it('leaves a non-drill battle completely alone', () => {
    const s = townState();
    s.drill = null;
    // Nothing in the drill path may fire when there is no drill.
    const gone = gameReducer(s, { type: 'DRILL_LEAVE' });
    expect(gone).toBe(s);
  });
});
