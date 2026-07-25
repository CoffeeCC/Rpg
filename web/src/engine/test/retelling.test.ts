import { describe, it, expect, beforeEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FallenScreen } from '../../components/FallenScreen';
import { VictoryScreen } from '../../components/VictoryScreen';
import { ChronicleScreen } from '../../components/ChronicleScreen';
import { StoryOverlay } from '../../components/StoryOverlay';
import { TavernScreen } from '../../components/TavernScreen';
import { MarginaliaList, ChroniclerPassage, CarryLedger } from '../../components/BookPanel';
import {
  CARRIED_OVER,
  CARRY_HEADINGS,
  FRONTISPIECE_AGAIN,
  FRONTISPIECE_FIRST,
  MARGINALIA,
  MARGINALIA_DEPTH,
  NOT_CARRIED,
  RITE_OF_THE_PAGE,
  TELLINGS_PREFACE,
  TELLINGS_PREFACE_DEPTH,
  TIMELINE_PREAMBLE,
  TURNING_LESSONS,
  VICTORY_READING,
  fillSlots,
  frontispieceFor,
  marginaliaFor,
  pageTurnPassage,
  prefaceFor,
} from '../data/retellingLore';
import { bankFall, bankTriumph, loadTellings, nextTelling } from '../../platform/tellings';
import { initialGameState, type GameState } from '../game';
import { generateWorld } from '../systems/worldgen';
import { Character } from '../entities/Character';

// ---------------------------------------------------------------------------
// The Retelling: does the player actually meet the fiction?
//
// Two kinds of assertion here, and the second kind is the point:
//
//   1. The prose obeys the house register (VOICE_BIBLE in data/npcs.ts) and
//      the slot contracts, and the progressive-disclosure gates hold — in
//      particular that Depths are never mentioned before the book has been
//      finished once, which NextDraftPanel promises the player in as many
//      words and which this pass must not contradict.
//
//   2. Every passage is REACHABLE. An explanation nobody sees is not a
//      feature, so each screen is rendered for real and asserted on: the first
//      death shows the whole arrangement, the fifth does not, the Chronicle
//      offers the tabs that hold it, the desk offers the preface.
//
// The Tellings meta lives in localStorage and the suite runs under node, where
// there is none — tellings.ts swallows that and degrades to a fresh book on
// every call, which would make the reachability tests read a book that is
// permanently on its first telling. So: a real in-memory store, per test.
// ---------------------------------------------------------------------------

function installStorage() {
  const map = new Map<string, string>();
  (globalThis as unknown as { localStorage: unknown }).localStorage = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  return map;
}

/** Every player-facing string this pass adds, flattened. */
function allProse(): string[] {
  return [
    ...FRONTISPIECE_FIRST,
    ...FRONTISPIECE_AGAIN.flat(),
    ...RITE_OF_THE_PAGE,
    ...TURNING_LESSONS,
    ...CARRIED_OVER,
    ...NOT_CARRIED,
    ...TELLINGS_PREFACE,
    ...TELLINGS_PREFACE_DEPTH,
    ...VICTORY_READING,
    ...[...MARGINALIA, MARGINALIA_DEPTH].flatMap((m) => [m.title, m.note, m.plain]),
    TIMELINE_PREAMBLE,
    CARRY_HEADINGS.kept,
    CARRY_HEADINGS.lost,
  ];
}

function heroState(name = 'Ilse'): GameState {
  const s = initialGameState();
  const player = new Character(name, 'Human', 'Warrior');
  player.level = 7;
  player.recomputeDerived();
  player.hp = player.maxHp;
  s.player = player;
  s.world = generateWorld(12345);
  return s;
}

const noop = () => {};

// ---------------------------------------------------------------------------
// 1. The voice
// ---------------------------------------------------------------------------

describe('the retelling prose keeps the house register', () => {
  it('never uses an exclamation mark', () => {
    for (const line of allProse()) expect(line, line).not.toContain('!');
  });

  it('avoids modern-glib and therapy vocabulary the voice bible forbids', () => {
    // The bible's forbidden list, plus the tutorial tics this pass was most at
    // risk of importing ("Let's get started", "Don't worry", "Tip:").
    const banned = [
      'vibes',
      'no cap',
      'nailed it',
      'awesome',
      'closure',
      'trauma',
      "let's get started",
      'get started',
      'do not worry',
      "don't worry",
      'good luck',
      'have fun',
      'pro tip',
      'tip:',
    ];
    for (const line of allProse()) {
      const lower = line.toLowerCase();
      for (const word of banned) expect(lower, `"${line}" contains "${word}"`).not.toContain(word);
    }
  });

  it('leaves no unfilled slots once the passages are rendered', () => {
    const filled = [
      ...frontispieceFor(1, { telling: 'first', name: 'Ilse' }),
      ...frontispieceFor(4, { telling: 'fourth', name: 'Ilse' }),
      ...pageTurnPassage(1, { name: 'Ilse', place: 'the Sunken Gate' }),
      ...pageTurnPassage(6, { name: 'Ilse', place: 'the Sunken Gate' }),
      ...VICTORY_READING.map((p) => fillSlots(p, { name: 'Ilse', telling: 'third' })),
    ];
    for (const line of filled) expect(line, line).not.toMatch(/\{[a-z]+\}/);
  });

  it('declares every slot it actually uses, and no others', () => {
    const used = new Set<string>();
    for (const line of [...FRONTISPIECE_AGAIN.flat(), ...RITE_OF_THE_PAGE, ...TURNING_LESSONS, ...VICTORY_READING]) {
      for (const m of line.matchAll(/\{([a-z]+)\}/g)) used.add(m[1]);
    }
    expect([...used].sort()).toEqual(['name', 'place', 'telling']);
  });

  it('does not spend the first death before it happens', () => {
    // The opening frontispiece plants the book and says nothing about dying,
    // repeating or starting over — the Fallen screen is where that lands.
    const opening = FRONTISPIECE_FIRST.join(' ').toLowerCase();
    for (const word of ['died', 'death', 'again', 'retell', 'draft', 'verses']) {
      expect(opening, `opening frontispiece leaks "${word}"`).not.toContain(word);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Progressive disclosure
// ---------------------------------------------------------------------------

describe('what the Chronicler will and will not say yet', () => {
  it('keeps the Depths sealed until the book has been read through once', () => {
    expect(prefaceFor(false).join(' ')).not.toMatch(/reading[s]? beneath|deeper reading/i);
    expect(prefaceFor(true).join(' ')).toMatch(/readings beneath the reading/i);
    expect(marginaliaFor(false).map((m) => m.id)).not.toContain('depths');
    expect(marginaliaFor(true).map((m) => m.id)).toContain('depths');
  });

  it('gives the whole arrangement on the first page turn and one lesson after', () => {
    expect(pageTurnPassage(1, { name: 'Ilse', place: 'the road' })).toHaveLength(RITE_OF_THE_PAGE.length);
    for (const telling of [2, 3, 4, 5, 6, 30]) {
      expect(pageTurnPassage(telling, { name: 'Ilse', place: 'the road' })).toHaveLength(1);
    }
  });

  it('teaches a different thing at each of the first several page turns', () => {
    const seen = [2, 3, 4, 5].map((t) => pageTurnPassage(t, { name: 'Ilse', place: 'the road' })[0]);
    expect(new Set(seen).size).toBe(4);
    // and then settles rather than running off the end of the array
    expect(pageTurnPassage(99, { name: 'Ilse', place: 'the road' })[0]).toBe(
      pageTurnPassage(TURNING_LESSONS.length + 1, { name: 'Ilse', place: 'the road' })[0],
    );
  });

  it('opens on a different frontispiece once the story is being retold', () => {
    expect(frontispieceFor(1, {})).toEqual(FRONTISPIECE_FIRST);
    expect(frontispieceFor(2, { telling: 'second', name: 'Ilse' })).not.toEqual(FRONTISPIECE_FIRST);
    // The second telling is where the regenerated deep history is explained,
    // which is the only thing that reconciles worldgen with the retelling.
    expect(frontispieceFor(2, { telling: 'second', name: 'Ilse' }).join(' ')).toMatch(/remembered rather than recorded/i);
  });
});

// ---------------------------------------------------------------------------
// 3. The plain reading is accurate
// ---------------------------------------------------------------------------

describe('the carry-over ledger tells the truth', () => {
  it('names verses, premises and the standing record as kept', () => {
    const kept = CARRIED_OVER.join(' ').toLowerCase();
    expect(kept).toContain('verses');
    expect(kept).toContain('premise');
    expect(kept).toContain('standing record');
  });

  it('names the hero, the party and the gear as lost', () => {
    const lost = NOT_CARRIED.join(' ').toLowerCase();
    expect(lost).toContain('hero');
    expect(lost).toContain('stable');
    expect(lost).toContain('gear');
  });

  it('matches what a RESTART actually does to the game state', () => {
    // Everything in the "lost" column is genuinely empty in a fresh state.
    const fresh = initialGameState();
    expect(fresh.player).toBeNull();
    expect(fresh.party).toHaveLength(0);
    expect(fresh.stable).toHaveLength(0);
    expect(fresh.orbs).toHaveLength(0);
    expect(fresh.world).toBeNull();
  });

  it('is right that the realm comes back differently', () => {
    // CREATE_CHARACTER seeds generateWorld() afresh, so the deep history the
    // Chronicle shows is genuinely re-remembered each telling.
    const a = generateWorld(1);
    const b = generateWorld(2);
    expect(a.eras.map((e) => e.name)).not.toEqual(b.eras.map((e) => e.name));
  });
});

// ---------------------------------------------------------------------------
// 4. Reachability — the player actually sees this
// ---------------------------------------------------------------------------

describe('the fiction is reachable on the screens that carry it', () => {
  beforeEach(() => {
    installStorage();
  });

  it('delivers the whole arrangement on the first Fallen screen', () => {
    const state = heroState();
    state.fallenSummary = { verses: 9, level: 7, orbs: 1, beasts: 2 };
    bankFall(state.runId, 9, { name: 'Ilse', place: 'the Sunken Gate', level: 7 });

    const html = renderToStaticMarkup(createElement(FallenScreen, { state, dispatch: noop }));
    expect(html).toContain('Now you have asked');
    expect(html).toMatch(/I do not erase/);
    expect(html).toContain('the Sunken Gate'); // the {place} slot really resolved
    expect(html).toContain('Ilse');
    // and the plain reading is there too
    expect(html).toContain(CARRY_HEADINGS.kept);
    expect(html).toContain(CARRY_HEADINGS.lost);
  });

  it('does not repeat the whole arrangement on later Fallen screens', () => {
    const state = heroState();
    state.fallenSummary = { verses: 4, level: 3, orbs: 0, beasts: 0 };
    nextTelling();
    nextTelling(); // now the third telling
    bankFall(state.runId, 4, { name: 'Ilse', place: 'the road', level: 3 });

    const html = renderToStaticMarkup(createElement(FallenScreen, { state, dispatch: noop }));
    expect(loadTellings().telling).toBe(3);
    expect(html).not.toContain('Now you have asked');
    // but the lesson for this page turn is, and so is the plain ledger
    expect(html).toContain('never once gone backwards');
    expect(html).toContain(CARRY_HEADINGS.kept);
  });

  it('introduces the Depths on the Victory screen and nowhere earlier', () => {
    const state = heroState();
    bankTriumph(state.runId, 25, { name: 'Ilse', level: 30, depth: 0 });
    const html = renderToStaticMarkup(createElement(VictoryScreen, { state, dispatch: noop }));
    expect(html).toMatch(/goes down further than the story does/);
    expect(html).toContain('Ilse');
    // and it is honest about what beginning again costs
    expect(html).toMatch(/carry over/);
  });

  it('offers the frontispiece before the opening crawl, and the crawl behind it', () => {
    const state = heroState();
    state.pendingStory = 0;
    const html = renderToStaticMarkup(createElement(StoryOverlay, { state, dispatch: noop }));
    expect(html).toContain('Open the book');
    expect(html).toMatch(/already inked at the top/);
    // the crawl itself is not shown until the book is opened
    expect(html).not.toContain('Everdusk keeps the one hour that never finishes');
  });

  it('names the standing premise on the frontispiece of a bound telling', () => {
    const state = heroState();
    state.pendingStory = 0;
    state.binding = 'thin-ledger';
    const html = renderToStaticMarkup(createElement(StoryOverlay, { state, dispatch: noop }));
    expect(html).toContain('The Thin Ledger');
    expect(html).toContain('Inscribed on this draft');
  });

  it('does not put a frontispiece in front of the later chapters', () => {
    const state = heroState();
    state.pendingStory = 2;
    const html = renderToStaticMarkup(createElement(StoryOverlay, { state, dispatch: noop }));
    expect(html).not.toContain('Open the book');
    expect(html).toContain('Two Orbs Kept');
  });

  it('gives the Chronicle a permanent home for the frame and a glossary', () => {
    const state = heroState();
    state.screen = 'chronicle';
    const html = renderToStaticMarkup(createElement(ChronicleScreen, { state, dispatch: noop }));
    // both new tabs are present as real buttons, so they are pad-reachable
    expect(html).toContain('The Tellings');
    expect(html).toContain('Marginalia');
    // and the timeline itself now explains why it will not read the same twice
    expect(html).toContain('memory retells');
  });

  it('offers the preface at the Chronicler\'s desk without forcing it', () => {
    const state = heroState();
    state.screen = 'tavern';
    const html = renderToStaticMarkup(createElement(TavernScreen, { state, dispatch: noop }));
    expect(html).toContain('Ask what the book is for');
    expect(html).toContain('aria-expanded="false"'); // folded away until asked
    expect(html).not.toContain('I am asked, in the drafts'); // not dumped on arrival
    // the two ledgers at the desk are told apart for a player meeting them cold
    expect(html).toContain('The Desk: Boons');
    expect(html).toContain('The second ledger');
  });

  it('renders the glossary with both readings of every entry', () => {
    const html = renderToStaticMarkup(createElement(MarginaliaList, { triumphed: false }));
    for (const entry of MARGINALIA) {
      expect(html).toContain(entry.title);
    }
    // every entry carries a plain reading as well as a spoken one
    const tags = html.match(/margin note/g) ?? [];
    expect(tags.length).toBe(MARGINALIA.length);
    expect(html).not.toContain('Readings Beneath');
  });

  it('renders margin notes as margin notes rather than as prose', () => {
    const html = renderToStaticMarkup(
      createElement(ChroniclerPassage, { paragraphs: ['Plain sentence.', '[margin note] An aside.'] }),
    );
    expect(html).toContain('chronicler-margin');
    // the bracketed tag is stripped; the styling carries it instead
    expect(html).not.toContain('[margin note]');
    expect(html).toContain('An aside.');
  });

  it('states every carried and uncarried line in the ledger markup', () => {
    const html = renderToStaticMarkup(createElement(CarryLedger, {}));
    for (const line of [...CARRIED_OVER, ...NOT_CARRIED]) {
      // apostrophes are entity-escaped in static markup; compare on a prefix
      expect(html).toContain(line.split("'")[0]);
    }
  });
});
