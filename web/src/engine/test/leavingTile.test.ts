// Does stepping on a leaving tile actually produce a leaving? The data layer
// is tested in leavings.test.ts; this is the wiring, which is the part that
// was silently doing nothing when the feature was first driven in a browser.
import { describe, expect, it } from 'vitest';
import { gameReducer, initialGameState, type GameState } from '../game';
import { Character } from '../entities/Character';
import { newExpedition, leavingSpots } from '../systems/floors';
import { generateWorld } from '../systems/worldgen';

function onFloor(): GameState {
  const s = initialGameState();
  s.player = new Character('Walker', 'Human', 'Warrior');
  s.world = generateWorld(99);
  s.screen = 'floor';
  s.expedition = newExpedition('verdant', s.world, s.chronicle, false);
  s.expedition.movLeft = 9;
  return s;
}

/**
 * Park the hero one step west of a real leaving spot, so `MOVE east` lands on
 * it.
 *
 * Deliberately does NOT edit the floor grid. The first version of this helper
 * wrote a tile char into `floorOf(exp)` — which returns the SHARED, module-
 * level `GATES` definition — so every test after it ran against a mutated
 * gate, and a later test asserting "the gate's own floors have leavings on
 * them" passed on a leaving that an earlier test had injected. The feature was
 * shipping nothing and the suite was green. Derive, never mutate.
 */
function beside(s: GameState): GameState {
  const spots = [...leavingSpots(s.expedition!)];
  expect(spots.length).toBeGreaterThan(0);
  const [x, y] = spots[0].split(',').map(Number);
  s.expedition!.x = x - 1;
  s.expedition!.y = y;
  return s;
}

describe('the leaving tile', () => {
  it('produces a leaving when the hero steps onto it', () => {
    const s = beside(onFloor());
    const next = gameReducer(s, { type: 'MOVE', dir: 'east' });
    expect(next.pendingLeaving).not.toBeNull();
    expect(next.pendingLeaving!.passage.length).toBeGreaterThan(0);
  });

  it('writes a line to the run log, so it reads without the overlay', () => {
    const s = beside(onFloor());
    const next = gameReducer(s, { type: 'MOVE', dir: 'east' });
    expect(next.log.some((l) => l.includes(next.pendingLeaving!.name))).toBe(true);
  });

  it('pays out once and never again on the same tile', () => {
    const s = beside(onFloor());
    const first = gameReducer(s, { type: 'MOVE', dir: 'east' });
    const goldAfterFirst = first.player!.gold;
    expect(goldAfterFirst).toBeGreaterThan(s.player!.gold);
    // Step off and back on.
    const back = gameReducer(gameReducer(first, { type: 'LEAVING_SEEN' }), { type: 'MOVE', dir: 'west' });
    const again = gameReducer(back, { type: 'MOVE', dir: 'east' });
    expect(again.player!.gold).toBe(goldAfterFirst);
    expect(again.pendingLeaving).toBeNull();
  });

  it('is dismissed by LEAVING_SEEN', () => {
    const s = beside(onFloor());
    const shown = gameReducer(s, { type: 'MOVE', dir: 'east' });
    expect(gameReducer(shown, { type: 'LEAVING_SEEN' }).pendingLeaving).toBeNull();
  });

  it("puts leavings on the Gates' own hand-authored floors, not just the Wilds", () => {
    // The bug this exists for: placement used to live in `generateFloor`,
    // which only builds the Unmapped Wilds, so no leaving ever appeared on
    // any of the five authored Gates a new player actually walks.
    for (const gateId of ['verdant', 'hollow', 'sunken', 'storm', 'abyss'] as const) {
      for (let floorIndex = 0; floorIndex < 3; floorIndex++) {
        const s = onFloor();
        s.expedition!.gateId = gateId;
        s.expedition!.floorIndex = floorIndex;
        expect(leavingSpots(s.expedition!).size).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('keeps a floor\'s leavings in the same places on every look', () => {
    const s = onFloor();
    const a = [...leavingSpots(s.expedition!)].sort();
    const b = [...leavingSpots(s.expedition!)].sort();
    expect(a).toEqual(b);
    // ...and a different floor is a different place.
    s.expedition!.floorIndex = 1;
    expect([...leavingSpots(s.expedition!)].sort()).not.toEqual(a);
  });
});
