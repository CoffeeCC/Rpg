// =========================================================================
// LEAVINGS — the floor remembers who walked it.
//
// What is actually worth testing here is ATTRIBUTION, not prose. A leaving's
// whole claim is that the person it names is real: findable in the same
// generated history the Chronicle screen renders, with the same fate line and
// the same causal threads. Prose that reads well but names somebody the world
// never generated would be worse than no feature at all, so most of this file
// checks that every name a leaving produces can be traced back to its source.
// =========================================================================
import { describe, expect, it } from 'vitest';
import { composeLeaving, candidateFigures, type LeavingContext } from '../data/leavings';
import { generateWorld } from '../systems/worldgen';
import type { FallenTelling } from '../../platform/tellings';
import type { GeneratedWorld } from '../types';

const WORLD: GeneratedWorld = generateWorld(4242);

/**
 * A deterministic `pick` so a test names the branch it means to test.
 *
 * The call ORDER matters and is easy to get wrong: `composeLeaving`
 * short-circuits the telling branch when the book holds no dead, so with an
 * empty `fallen` the FIRST pick a test sees is the figure roll, not the
 * telling roll. Getting that wrong is not a loud failure — it silently steers
 * every case into the nameless branch and leaves the figure assertions
 * skipping on `continue`, which is exactly how this file was green and
 * vacuous on its first run. Hence `figurePick` below and the counters.
 */
function fixedPick(...values: number[]): (n: number) => number {
  let i = 0;
  return (n) => {
    const v = values[Math.min(i++, values.length - 1)];
    return v % Math.max(1, n);
  };
}

function ctx(over: Partial<LeavingContext> = {}): LeavingContext {
  return {
    world: WORLD,
    gateId: 'verdant',
    fallen: [],
    usedTellings: [],
    pick: fixedPick(0),
    ...over,
  };
}

/** No fallen: pick #1 is the figure roll, #2 the figure index, #3 the object. */
function figurePick(index: number): (n: number) => number {
  return fixedPick(0, index, 0);
}

const RECORD: FallenTelling = {
  telling: 3,
  name: 'Ashwin',
  place: 'the Verdant Gate',
  level: 7,
  epitaph: 'Went down still facing the way they came in.',
};

describe('leavings — attribution', () => {
  it('names only figures the generated world actually contains', () => {
    const names = new Set(WORLD.figures.map((f) => `${f.name} ${f.title}`));
    const figures = candidateFigures(WORLD);
    let checked = 0;
    // Sweep every dead figure rather than trusting one roll.
    for (let i = 0; i < figures.length; i++) {
      const leaving = composeLeaving(ctx({ pick: figurePick(i) }));
      expect(leaving.kind).toBe('figure');
      expect(names.has(leaving.author!)).toBe(true);
      checked++;
    }
    expect(checked).toBe(figures.length);
  });

  it("quotes the figure's own fate line verbatim, so the Chronicle agrees with the floor", () => {
    const figures = candidateFigures(WORLD);
    expect(figures.length).toBeGreaterThan(0);
    for (let i = 0; i < figures.length; i++) {
      const leaving = composeLeaving(ctx({ pick: figurePick(i) }));
      expect(leaving.kind).toBe('figure');
      const figure = WORLD.figures.find((f) => `${f.name} ${f.title}` === leaving.author)!;
      expect(leaving.passage.some((p) => p.includes(figure.fate))).toBe(true);
    }
  });

  it('only claims a beast is still here when that beast is in this gate', () => {
    const figures = candidateFigures(WORLD);
    let strongClaims = 0;
    for (let i = 0; i < figures.length; i++) {
      for (const gateId of ['verdant', 'hollow', 'sunken', 'storm', 'abyss'] as const) {
        const leaving = composeLeaving(ctx({ gateId, pick: figurePick(i) }));
        expect(leaving.kind).toBe('figure');
        const figure = WORLD.figures.find((f) => `${f.name} ${f.title}` === leaving.author)!;
        const said = leaving.passage.join(' ');
        if (!said.includes('has not moved on')) continue;
        // The strong claim was made. It must be true.
        strongClaims++;
        const beast = WORLD.beasts.find((b) => b.id === figure.slainByBeastId);
        expect(beast).toBeDefined();
        expect(beast!.gateId).toBe(gateId);
      }
    }
    // Guard against a green test that never reached the branch it names.
    expect(strongClaims).toBeGreaterThan(0);
  });

  it('never invents a mentor or rival that is not in the history', () => {
    const ids = new Set(WORLD.figures.map((f) => `${f.name} ${f.title}`));
    const figures = candidateFigures(WORLD);
    let threadsSeen = 0;
    for (let i = 0; i < figures.length; i++) {
      const leaving = composeLeaving(ctx({ pick: figurePick(i) }));
      const figure = WORLD.figures.find((f) => `${f.name} ${f.title}` === leaving.author)!;
      for (const otherId of [figure.mentorId, figure.rivalId]) {
        if (!otherId) continue;
        const other = WORLD.figures.find((f) => f.id === otherId);
        // The link itself must resolve: a thread pointing at an id the world
        // does not contain would render as "undefined undefined taught them".
        expect(other).toBeDefined();
        if (leaving.passage.join(' ').includes(`${other!.name} ${other!.title}`)) {
          expect(ids.has(`${other!.name} ${other!.title}`)).toBe(true);
          threadsSeen++;
        }
      }
    }
    expect(threadsSeen).toBeGreaterThan(0);
  });
});

describe('leavings — your own dead', () => {
  it('reuses the epitaph the book already wrote, rather than composing a new one', () => {
    const leaving = composeLeaving(ctx({ fallen: [RECORD], pick: fixedPick(0) }));
    expect(leaving.kind).toBe('telling');
    expect(leaving.passage.join(' ')).toContain(RECORD.epitaph);
    expect(leaving.passage.join(' ')).toContain(RECORD.place);
    expect(leaving.author).toContain(RECORD.name);
    expect(leaving.tellingNumber).toBe(RECORD.telling);
  });

  it('meets the most recent unspent telling, not the oldest', () => {
    const older: FallenTelling = { ...RECORD, telling: 1, name: 'Oldest' };
    const leaving = composeLeaving(ctx({ fallen: [older, RECORD], pick: fixedPick(0) }));
    expect(leaving.tellingNumber).toBe(RECORD.telling);
  });

  it('will not offer a telling that has already been met this expedition', () => {
    const leaving = composeLeaving(ctx({ fallen: [RECORD], usedTellings: [RECORD.telling], pick: fixedPick(0) }));
    expect(leaving.kind).not.toBe('telling');
  });

  it('falls back cleanly on a first run, when the book holds no dead at all', () => {
    const leaving = composeLeaving(ctx({ fallen: [], pick: fixedPick(0) }));
    expect(leaving.kind).not.toBe('telling');
    expect(leaving.passage.length).toBeGreaterThan(0);
  });
});

describe('leavings — the floor', () => {
  it('always produces something readable, on any roll, with or without a world', () => {
    for (let i = 0; i < 120; i++) {
      for (const world of [WORLD, null]) {
        const leaving = composeLeaving(ctx({ world, pick: fixedPick(i, i, i, i) }));
        expect(leaving.name.length).toBeGreaterThan(0);
        expect(leaving.passage.length).toBeGreaterThan(0);
        expect(leaving.passage.every((p) => p.trim().length > 0)).toBe(true);
        expect(leaving.logLine.length).toBeGreaterThan(0);
        // The nameless must stay nameless — a null author is a decision here,
        // not a missing value, and rendering "undefined" would give it away.
        if (leaving.kind === 'nameless') expect(leaving.author).toBeNull();
        else expect(leaving.author).toBeTruthy();
      }
    }
  });

  it('with no world generated at all, only the nameless are left', () => {
    for (let i = 0; i < 30; i++) {
      const leaving = composeLeaving(ctx({ world: null, fallen: [], pick: fixedPick(i, i, i) }));
      expect(leaving.kind).toBe('nameless');
    }
  });

  // Placement lives in floors.ts (`leavingSpots`) and is covered by
  // leavingTile.test.ts — it is derived from a floor's identity rather than
  // written into its grid, so there is nothing to assert about grids here.
});
