import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextDraftPanel } from '../../components/NextDraftPanel';
import {
  BINDINGS,
  DEPTHS,
  MAX_DEPTH,
  NO_MODIFIERS,
  bindingById,
  faceableSpeciesCount,
  faceableSpeciesIds,
  runModifiers,
} from '../data/bindings';
import { GATES } from '../data/gates';
import {
  availableBindings,
  bankFall,
  bankTriumph,
  bindingUnlocked,
  bindingWritten,
  hasTriumphed,
  inscribeBinding,
  loadTellings,
  offeredDepth,
  recordLedger,
  setBinding,
  setDepth,
  type TellingsMeta,
} from '../../platform/tellings';
import { gameReducer, initialGameState, modsOf, rewardChoiceCount, type GameState } from '../game';
import { floorOf, tileAt, playerWalkable } from '../systems/floors';
import { SPECIES } from '../data/species';

// ---------------------------------------------------------------------------
// The Next Draft: Bindings, Depths and the standing Ledger.
//
// The Tellings meta lives in localStorage and the suite runs under node, where
// there is none — tellings.ts swallows that in a try/catch and degrades to a
// fresh book every call, which would make every persistence assertion here
// vacuously true. So: a real in-memory store, reset between tests.
// ---------------------------------------------------------------------------

const KEY = 'everdusk.tellings.v1';

function installStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  (globalThis as unknown as { localStorage: unknown }).localStorage = store;
  return map;
}

let raw: Map<string, string>;

beforeEach(() => {
  raw = installStorage();
});

/** Write a book straight into storage, bypassing the guarded setters. */
function seed(patch: Partial<TellingsMeta>) {
  const base = loadTellings();
  raw.set(KEY, JSON.stringify({ ...base, ...patch }));
  return loadTellings();
}

// ---------------------------------------------------------------------------
// Data integrity
// ---------------------------------------------------------------------------

describe('binding and depth data', () => {
  it('gives every binding a unique id, a price, terms and a requirement line', () => {
    const ids = BINDINGS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of BINDINGS) {
      expect(b.name.length, b.id).toBeGreaterThan(3);
      expect(b.text.length, b.id).toBeGreaterThan(40);
      expect(b.terms.length, b.id).toBeGreaterThan(10);
      expect(b.requirementText.length, b.id).toBeGreaterThan(10);
      expect(b.cost, b.id).toBeGreaterThan(0);
      expect(Object.keys(b.mods).length, b.id).toBeGreaterThan(0);
    }
  });

  it('never lets a binding reference a modifier the merger does not know', () => {
    const known = new Set(Object.keys(NO_MODIFIERS));
    for (const b of BINDINGS) for (const k of Object.keys(b.mods)) expect(known.has(k), `${b.id}.${k}`).toBe(true);
    for (const d of DEPTHS) for (const k of Object.keys(d.mods)) expect(known.has(k), `depth ${d.depth}.${k}`).toBe(true);
  });

  it('never gates a binding behind something the game cannot actually give you', () => {
    const faceable = faceableSpeciesCount();
    const wardenTotal = Object.keys(GATES).length;
    // Three species exist only as breeding results and no floor ever spawns
    // them, so an unlock asking for all 51 would be unreachable forever.
    expect(faceable).toBeGreaterThan(0);
    expect(faceable).toBeLessThanOrEqual(Object.keys(SPECIES).length);
    for (const b of BINDINGS) {
      if (b.requires.species !== undefined) expect(b.requires.species, b.id).toBeLessThanOrEqual(faceable);
      if (b.requires.wardens !== undefined) expect(b.requires.wardens, b.id).toBeLessThanOrEqual(wardenTotal);
    }
  });

  it('only counts species a gate can really spawn, so the chase can be finished', () => {
    const ids = faceableSpeciesIds();
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(SPECIES[id], id).toBeDefined();
  });

  it('keeps the depths contiguous from the surface down, escalating monotonically', () => {
    expect(DEPTHS.map((d) => d.depth)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(MAX_DEPTH).toBe(5);
    let lastLevel = -1;
    let lastVerses = 0;
    for (const d of DEPTHS) {
      const m = runModifiers(null, d.depth);
      expect(m.enemyLevelBonus, d.name).toBeGreaterThan(lastLevel);
      expect(m.verseMult, d.name).toBeGreaterThanOrEqual(lastVerses);
      lastLevel = m.enemyLevelBonus;
      lastVerses = m.verseMult;
    }
  });

  it('leaves an unbound surface telling completely unmodified', () => {
    expect(runModifiers(null, 0)).toEqual(NO_MODIFIERS);
    expect(runModifiers(undefined, undefined)).toEqual(NO_MODIFIERS);
    expect(runModifiers('no-such-binding', 99)).toEqual(NO_MODIFIERS);
  });
});

describe('runModifiers merging', () => {
  it('adds the additive fields and multiplies the verse rate', () => {
    // The Crowded Dark (packs +1, verses x1.5) read at The Marginalia
    // (levels +4, packs +1, verses x2) is packs +2 and verses x3.
    const m = runModifiers('crowded-dark', 2);
    expect(m.packBonus).toBe(2);
    expect(m.enemyLevelBonus).toBe(4);
    expect(m.verseMult).toBeCloseTo(3);
  });

  it('lets a binding empty the purse while a depth leaves it alone', () => {
    expect(runModifiers('thin-ledger', 5).startGold).toBe(0);
    expect(runModifiers(null, 5).startGold).toBeNull();
  });

  it('stacks reward penalties from both halves', () => {
    // The Long Memory (-2) at The Last Telling (-2).
    expect(runModifiers('long-memory', 5).rewardDelta).toBe(-4);
  });

  it('ors the boolean premises rather than letting the later one clear them', () => {
    const m = runModifiers('long-memory', 5);
    expect(m.keepCards).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The book: persistence, unlocks, and old saves
// ---------------------------------------------------------------------------

describe('the tellings book', () => {
  it('loads a book written before the Next Draft existed without losing it', () => {
    raw.set(
      KEY,
      JSON.stringify({ telling: 4, verses: 30, purchased: ['scars'], lastBankedRun: 'run-x', fallen: [{ telling: 1 }] }),
    );
    const meta = loadTellings();
    expect(meta.telling).toBe(4);
    expect(meta.verses).toBe(30);
    expect(meta.purchased).toEqual(['scars']);
    expect(meta.fallen).toHaveLength(1);
    // ...and the new half defaults to an unbound surface telling.
    expect(meta.binding).toBeNull();
    expect(meta.depth).toBe(0);
    expect(meta.ledger).toEqual({ species: [], wardens: [], deepest: 0 });
    expect(meta.triumphs).toEqual([]);
  });

  it('survives a corrupt ledger rather than throwing', () => {
    raw.set(KEY, JSON.stringify({ telling: 2, ledger: { species: 'not-an-array', deepest: -9 }, depth: 999 }));
    const meta = loadTellings();
    expect(meta.ledger.species).toEqual([]);
    expect(meta.ledger.deepest).toBe(0);
    expect(meta.depth).toBe(MAX_DEPTH); // clamped, not rejected
  });

  it('folds discoveries into the standing record as a set union', () => {
    recordLedger({ species: ['slimeGreen', 'slimeGreen', 'batCave'], wardens: ['verdant'] });
    recordLedger({ species: ['batCave', 'wispPale'], wardens: ['verdant', 'hollow'] });
    const meta = loadTellings();
    expect(meta.ledger.species.sort()).toEqual(['batCave', 'slimeGreen', 'wispPale']);
    expect(meta.ledger.wardens.sort()).toEqual(['hollow', 'verdant']);
  });

  it('never counts a species the Chronicler has already been shown', () => {
    for (let i = 0; i < 5; i++) recordLedger({ species: ['slimeGreen'] });
    expect(loadTellings().ledger.species).toHaveLength(1);
  });
});

describe('binding unlocks', () => {
  it('seals a binding until the standing record earns it', () => {
    const borrowed = bindingById('borrowed-page')!;
    const crowded = bindingById('crowded-dark')!;
    expect(bindingUnlocked(borrowed, loadTellings())).toBe(false); // telling 1
    expect(bindingUnlocked(crowded, loadTellings())).toBe(false);

    const meta = seed({ telling: 2, ledger: { species: new Array(22).fill(0).map((_, i) => `s${i}`), wardens: [], deepest: 0 } });
    expect(bindingUnlocked(borrowed, meta)).toBe(true);
    expect(bindingUnlocked(crowded, meta)).toBe(true);
  });

  it('separates "earned" from "written": eligibility is not selectability', () => {
    const meta = seed({ telling: 2, verses: 0 });
    const borrowed = bindingById('borrowed-page')!;
    expect(bindingUnlocked(borrowed, meta)).toBe(true);
    expect(bindingWritten(borrowed, meta)).toBe(false);
    expect(availableBindings(meta)).toEqual([]);
    // Cannot select what has not been paid for.
    expect(setBinding('borrowed-page').binding).toBeNull();
  });

  it('refuses to inscribe without the verses, and spends them exactly once', () => {
    seed({ telling: 2, verses: 9 });
    expect(inscribeBinding('borrowed-page')).toBeNull(); // costs 10
    seed({ telling: 2, verses: 10 });
    const after = inscribeBinding('borrowed-page');
    expect(after).not.toBeNull();
    expect(after!.verses).toBe(0);
    expect(after!.binding).toBe('borrowed-page'); // paying for it selects it
    expect(inscribeBinding('borrowed-page')).toBeNull(); // no double charge
  });

  it('refuses to inscribe a binding the record has not earned, even when rich', () => {
    seed({ telling: 99, verses: 999 });
    expect(inscribeBinding('crowded-dark')).toBeNull();
    expect(loadTellings().verses).toBe(999);
  });

  it('lets a written premise be struck out again', () => {
    seed({ telling: 2, verses: 10 });
    inscribeBinding('borrowed-page');
    expect(loadTellings().binding).toBe('borrowed-page');
    expect(setBinding(null).binding).toBeNull();
    expect(setBinding('borrowed-page').binding).toBe('borrowed-page');
  });
});

describe('depths', () => {
  it('offers nothing beneath the surface until the book has been finished once', () => {
    const meta = seed({ telling: 8, ledger: { species: [], wardens: ['verdant', 'hollow'], deepest: 0 } });
    expect(hasTriumphed(meta)).toBe(false);
    expect(offeredDepth(meta)).toBe(0);
    expect(setDepth(3).depth).toBe(0);
  });

  it('opens exactly one reading below the deepest actually carried to the end', () => {
    const meta = seed({
      triumphs: [{ telling: 3, name: 'Ash', level: 20, depth: 0, line: 'x' }],
      ledger: { species: [], wardens: [], deepest: 0 },
    });
    expect(offeredDepth(meta)).toBe(1);
    expect(setDepth(1).depth).toBe(1);
    expect(setDepth(2).depth).toBe(1); // still clamped: 2 has not been earned
  });

  it('clamps at the last telling and never below the surface', () => {
    seed({
      triumphs: [{ telling: 3, name: 'Ash', level: 20, depth: 0, line: 'x' }],
      ledger: { species: [], wardens: [], deepest: MAX_DEPTH },
    });
    expect(setDepth(MAX_DEPTH).depth).toBe(MAX_DEPTH);
    expect(setDepth(999).depth).toBe(MAX_DEPTH);
    expect(setDepth(-4).depth).toBe(0);
  });
});

describe('banking a telling', () => {
  it('banks a triumph once, turns the page, and records the reading', () => {
    seed({ telling: 5, verses: 3 });
    const first = bankTriumph('run-a', 40, { name: 'Ilse', level: 22, depth: 2 });
    expect(first.verses).toBe(43);
    expect(first.telling).toBe(6); // the Victory screen never turned the page; this does
    expect(first.triumphs).toHaveLength(1);
    expect(first.triumphs[0].line).toContain('Ilse');
    expect(first.ledger.deepest).toBe(2);

    // StrictMode double-invocation, or a second render of the victory screen.
    const again = bankTriumph('run-a', 40, { name: 'Ilse', level: 22, depth: 2 });
    expect(again.verses).toBe(43);
    expect(again.telling).toBe(6);
    expect(again.triumphs).toHaveLength(1);
  });

  it('never lowers the deepest reading on a shallower triumph', () => {
    seed({ ledger: { species: [], wardens: [], deepest: 4 } });
    expect(bankTriumph('run-b', 5, { name: 'Ilse', level: 9, depth: 1 }).ledger.deepest).toBe(4);
  });

  it('shares the once-per-run guard with a fall, since a run ends only one way', () => {
    bankFall('run-c', 12, { name: 'Ilse', place: 'the road', level: 4 });
    const after = bankTriumph('run-c', 500, { name: 'Ilse', level: 4, depth: 0 });
    expect(after.verses).toBe(12);
    expect(after.triumphs).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// The engine: does a premise actually reshape the run?
// ---------------------------------------------------------------------------

function newRun(): GameState {
  return gameReducer(initialGameState(), {
    type: 'CREATE_CHARACTER',
    name: 'Ilse',
    race: 'Human',
    className: 'Warrior',
  });
}

/** Give the book a premise that is already paid for, then begin a telling. */
function runUnder(bindingId: string | null, depth = 0): GameState {
  seed({
    telling: 40,
    verses: 0,
    purchased: bindingId ? [bindingId] : [],
    binding: bindingId,
    depth,
    ledger: { species: [], wardens: [], deepest: MAX_DEPTH },
    triumphs: [{ telling: 1, name: 'x', level: 1, depth: 0, line: 'x' }],
  });
  return newRun();
}

describe('a premise reaching the run', () => {
  it('copies the premise onto the state exactly once, at the moment the hero is made', () => {
    const state = runUnder('crowded-dark', 2);
    expect(state.binding).toBe('crowded-dark');
    expect(state.depth).toBe(2);
    expect(modsOf(state).packBonus).toBe(2);

    // Changing the book mid-telling must not reshape the telling in progress.
    setBinding(null);
    setDepth(0);
    expect(state.binding).toBe('crowded-dark');
    expect(modsOf(state).packBonus).toBe(2);
  });

  it('leaves an unbound telling identical to the game before any of this existed', () => {
    const state = runUnder(null);
    expect(modsOf(state)).toEqual(NO_MODIFIERS);
    expect(state.party).toHaveLength(0);
    expect(rewardChoiceCount(state)).toBe(state.player!.traits.rewardChoices);
  });

  it('lets The Thin Ledger empty the purse even when a boon has just filled it', () => {
    seed({
      telling: 40,
      purchased: ['provisioned', 'thin-ledger'], // Well-Provisioned grants +40 gold
      binding: 'thin-ledger',
      depth: 0,
      ledger: { species: [], wardens: ['verdant'], deepest: 0 },
    });
    const bound = newRun();
    expect(bound.player!.gold).toBe(0);

    // ...and without the premise, the boon still works exactly as it did.
    seed({ telling: 40, purchased: ['provisioned'], binding: null, depth: 0 });
    const unbound = newRun();
    expect(unbound.player!.gold).toBeGreaterThanOrEqual(40);
  });

  it('seats a companion at the road under The Covenant Kept, and records its species', () => {
    const state = runUnder('covenant-kept');
    expect(state.party).toHaveLength(1);
    expect(state.party[0].isTamed).toBe(true);
    expect(state.party[0].hp).toBe(state.party[0].maxHp);
    expect(state.party[0].nickname).not.toBe(state.party[0].species.name);
    expect(state.discovered).toContain(state.party[0].speciesId);
    expect(SPECIES[state.party[0].speciesId]).toBeDefined();
  });

  it('names the premise in the opening log so the player cannot miss it', () => {
    const state = runUnder('crowded-dark', 3);
    const opening = state.log.join(' | ');
    expect(opening).toContain('The Crowded Dark');
    expect(opening).toContain('The Palimpsest');
  });

  it('bends how many cards a Boon lays out, but never below one', () => {
    const base = runUnder(null).player!.traits.rewardChoices;
    expect(rewardChoiceCount(runUnder('thin-ledger'))).toBe(base + 2);
    expect(rewardChoiceCount(runUnder('long-memory'))).toBe(Math.max(1, base - 2));
    expect(rewardChoiceCount(runUnder('long-memory', 5))).toBe(1); // -4: floored, never zero
  });
});

// ---------------------------------------------------------------------------
// Deck shape: the largest thing a premise changes
// ---------------------------------------------------------------------------

function enterVerdant(state: GameState): GameState {
  const atGate = gameReducer(state, { type: 'GOTO', screen: 'gateSelect' });
  return gameReducer(atGate, { type: 'ENTER_GATE', gateId: 'verdant' });
}

describe('deck shape under a premise', () => {
  it('seeds three cards from another draft on every expedition under The Borrowed Page', () => {
    const state = enterVerdant(runUnder('borrowed-page'));
    expect(state.expeditionExtras).toHaveLength(3);
    expect(state.log.join(' | ')).toContain("Someone else's cards");
  });

  it('starts every expedition empty-handed when unbound', () => {
    expect(enterVerdant(runUnder(null)).expeditionExtras).toHaveLength(0);
  });

  it('carries Boon cards across expeditions under The Long Memory, and drops them otherwise', () => {
    // Simulate having earned two cards, then stepping into a fresh expedition.
    const kept = enterVerdant(runUnder('long-memory'));
    const withCards: GameState = { ...kept, expeditionExtras: ['cleave', 'cinder'], expedition: null, screen: 'town' };
    const again = enterVerdant(withCards);
    expect(again.expeditionExtras).toEqual(['cleave', 'cinder']);
    expect(again.log.join(' | ')).toContain('has not forgotten');

    const plain = enterVerdant(runUnder(null));
    const plainWithCards: GameState = { ...plain, expeditionExtras: ['cleave', 'cinder'], expedition: null, screen: 'town' };
    expect(enterVerdant(plainWithCards).expeditionExtras).toEqual([]);
  });

  it('does not let the Witchwick shortcut dodge The Long Memory', () => {
    const state = enterVerdant(runUnder('long-memory'));
    const armed: GameState = { ...state, expeditionExtras: ['cleave'] };
    armed.player!.addConsumable('Witchwick', 1);
    const home = gameReducer(armed, { type: 'LEAVE_GATE' });
    expect(home.screen).toBe('town');
    expect(home.expeditionExtras).toEqual(['cleave']);
    expect(home.log.join(' | ')).toContain('do not fade');
  });

  it('still fades the cards on the way home when unbound', () => {
    const state = enterVerdant(runUnder(null));
    const armed: GameState = { ...state, expeditionExtras: ['cleave'] };
    armed.player!.addConsumable('Witchwick', 1);
    const home = gameReducer(armed, { type: 'LEAVE_GATE' });
    expect(home.expeditionExtras).toEqual([]);
    expect(home.log.join(' | ')).toContain('fade like a dream');
  });
});

// ---------------------------------------------------------------------------
// Depth actually reaches the monsters
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The desk itself. An unlock the player never sees is not a feature, so the
// panel is rendered at three stages of the book and read back. renderToStatic-
// Markup needs no DOM, which is why this can live in the node-env suite.
// ---------------------------------------------------------------------------

describe('the Chronicler’s desk', () => {
  function deskHtml(state: GameState) {
    return renderToStaticMarkup(
      createElement(NextDraftPanel, { state, meta: loadTellings(), setMeta: () => {} }),
    );
  }

  it('shows a new book every premise it has, all of them sealed, and hides the readings', () => {
    const html = deskHtml(newRun());
    for (const b of BINDINGS) expect(html, b.id).toContain(b.name);
    expect(html).toContain('An Unbound Telling');
    expect((html.match(/>sealed</g) ?? []).length).toBe(BINDINGS.length);
    // Depths are never even mentioned until the book has been finished once.
    expect(html).toContain('readings beneath this one');
    expect(html).not.toContain('depth-chip');
  });

  it('separates standing, unwritten and sealed premises as the record grows', () => {
    seed({
      telling: 4,
      verses: 30,
      purchased: ['borrowed-page'],
      binding: 'borrowed-page',
      ledger: { species: Array.from({ length: 12 }, (_, i) => `s${i}`), wardens: ['verdant'], deepest: 0 },
    });
    const html = deskHtml(newRun());
    expect((html.match(/>standing</g) ?? []).length).toBe(1); // The Borrowed Page
    expect((html.match(/>unwritten</g) ?? []).length).toBe(2); // Thin Ledger (1 warden), Covenant Kept (12 species)
    expect((html.match(/>sealed</g) ?? []).length).toBe(2); // Long Memory (2 wardens), Crowded Dark (22 species)
    // The chase reads against what the gates can actually spawn.
    expect(html).toContain(`12/${faceableSpeciesCount()}`);
  });

  it('opens the readings after a triumph, locking only what has not been earned', () => {
    seed({
      telling: 12,
      verses: 200,
      purchased: BINDINGS.map((b) => b.id),
      binding: 'crowded-dark',
      depth: 2,
      ledger: { species: [], wardens: [], deepest: 3 },
      triumphs: [{ telling: 9, name: 'Ilse', level: 24, depth: 1, line: 'The ninth telling reached the last page.' }],
    });
    const html = deskHtml(newRun());
    expect((html.match(/depth-chip/g) ?? []).length).toBe(DEPTHS.length);
    // deepest 3 offers 4, so only the fifth reading is still shut.
    expect((html.match(/depth-chip locked/g) ?? []).length).toBe(1);
    expect(html).toContain('The Marginalia'); // the standing reading's terms
    expect(html).toContain('Shorter Shelf'); // finished tellings are kept and shown
    expect(html).toContain('reached the last page');
  });
});

describe('a depth reaching the dark', () => {
  const dirs = [
    { d: 'north' as const, dx: 0, dy: -1 },
    { d: 'south' as const, dx: 0, dy: 1 },
    { d: 'west' as const, dx: -1, dy: 0 },
    { d: 'east' as const, dx: 1, dy: 0 },
  ];

  /**
   * Stand next to a plain enemy unit and bump it, the way MOVE expects.
   * Returns the staging so the SAME unit on the SAME floor can be bumped
   * again under a different premise — floor layouts and unit levels are
   * generated per expedition, so two separate expeditions are not comparable.
   */
  function stageBump(state: GameState): { staged: GameState; dir: (typeof dirs)[number]['d'] } | null {
    const exp = state.expedition!;
    const floor = floorOf(exp);
    for (const unit of exp.units) {
      // Tamer packs roll random beasts; only plain units and minibosses take
      // their level straight from the map, which is what makes this exact.
      if (unit.kind !== 'enemy') continue;
      for (const { d, dx, dy } of dirs) {
        const fromX = unit.x - dx;
        const fromY = unit.y - dy;
        if (!playerWalkable(exp, fromX, fromY)) continue;
        if (tileAt(floor, fromX, fromY) === undefined) continue;
        const staged: GameState = { ...state, expedition: { ...exp, x: fromX, y: fromY, movLeft: 3 } };
        if (gameReducer(staged, { type: 'MOVE', dir: d }).battle) return { staged, dir: d };
      }
    }
    return null;
  }

  it('sends the very same foe out older at a deeper reading', () => {
    const base = enterVerdant(runUnder(null));
    const stage = stageBump(base);
    expect(stage, 'expected a bumpable enemy unit on Verdant floor 1').not.toBeNull();

    // One expedition, one unit, one variable: the reading it is met at.
    const surface = gameReducer(stage!.staged, { type: 'MOVE', dir: stage!.dir });
    const deepStaged: GameState = { ...stage!.staged, depth: 5 }; // The Last Telling: +12
    const deep = gameReducer(deepStaged, { type: 'MOVE', dir: stage!.dir });

    // enemies[0] is the unit itself; any packmate behind it is a random roll.
    expect(deep.battle!.enemies[0].level).toBe(surface.battle!.enemies[0].level + 12);
    expect(deep.battle!.enemies[0].maxHp).toBeGreaterThan(surface.battle!.enemies[0].maxHp);
  });

  it('leaves the surface reading exactly where it was', () => {
    const base = enterVerdant(runUnder(null));
    const stage = stageBump(base);
    expect(stage).not.toBeNull();
    const a = gameReducer(stage!.staged, { type: 'MOVE', dir: stage!.dir });
    const b = gameReducer({ ...stage!.staged, depth: 0, binding: null }, { type: 'MOVE', dir: stage!.dir });
    expect(a.battle!.enemies[0].level).toBe(b.battle!.enemies[0].level);
  });

  it('records every species it meets into the telling, for the Ledger to keep', () => {
    const stage = stageBump(enterVerdant(runUnder(null)));
    expect(stage).not.toBeNull();
    const bumped = gameReducer(stage!.staged, { type: 'MOVE', dir: stage!.dir });
    expect(bumped.discovered!.length).toBeGreaterThan(0);
    for (const e of bumped.battle!.enemies) expect(bumped.discovered).toContain(e.speciesId);
  });
});
