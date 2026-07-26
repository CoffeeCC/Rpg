import { useRef, useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { CardDef } from '../engine/types';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, SPECIES_CARDS, cardMatchesQuery, getCard } from '../engine/data/cards';
import { TYPE_TINT } from '../art/cardFrames';
import { CardView } from './CardView';
import { CardDetailOverlay } from './CardDetailOverlay';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import { focusFirstIn, useNavScope, useRefocusOn } from '../nav';
import { play as sfx } from '../platform/sfx';
import '../sheets.css';

// v17 (PLAN7 C2): the deck as a card gallery — responsive grid of readable
// cards, type/rarity filter chips, a count in the header, hover lift+zoom.
// Merged with the search box + painted sort modes from the parallel pass:
// filters, search, and sorting all compose over the same entry list.
// Presentation only — the single GOTO dispatch is unchanged.

const CARD_TYPES: CardDef['type'][] = ['strike', 'spell', 'guard', 'tactic', 'summon'];
const CARD_RARITIES: CardDef['rarity'][] = ['starter', 'common', 'uncommon', 'rare'];

interface DeckEntry {
  card: CardDef;
  count: number;
  sourceMonster?: MonsterInstance;
}

function countIds(ids: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()];
}

function buildEntries(ids: string[], sourceMonster?: MonsterInstance): DeckEntry[] {
  const out: DeckEntry[] = [];
  for (const [id, count] of countIds(ids)) {
    const card = getCard(id);
    if (card) out.push({ card, count, sourceMonster });
  }
  return out;
}

type SortMode = 'source' | 'name' | 'cost' | 'type' | 'rarity' | 'count';

const SORT_MODES: [SortMode, string, string, string][] = [
  ['source', 'sort_source', '📚', 'By Source'],
  ['name', 'sort_name', '🔤', 'Name'],
  ['cost', 'sort_cost', '◈', 'Cost'],
  ['type', 'sort_type', '🗂', 'Type'],
  ['rarity', 'sort_rarity', '✨', 'Rarity'],
  ['count', 'sort_count', '×', 'Quantity'],
];

const TYPE_ORDER: CardDef['type'][] = ['strike', 'spell', 'guard', 'tactic', 'summon'];
const RARITY_ORDER: CardDef['rarity'][] = ['rare', 'uncommon', 'common', 'starter'];

const COMPARATORS: Record<Exclude<SortMode, 'source'>, (a: DeckEntry, b: DeckEntry) => number> = {
  name: (a, b) => a.card.name.localeCompare(b.card.name),
  cost: (a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name),
  type: (a, b) => TYPE_ORDER.indexOf(a.card.type) - TYPE_ORDER.indexOf(b.card.type) || a.card.name.localeCompare(b.card.name),
  rarity: (a, b) => RARITY_ORDER.indexOf(a.card.rarity) - RARITY_ORDER.indexOf(b.card.rarity) || a.card.name.localeCompare(b.card.name),
  count: (a, b) => b.count - a.count || a.card.name.localeCompare(b.card.name),
};

export function DeckScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [typeFilter, setTypeFilter] = useState<'all' | CardDef['type']>('all');
  const [rarityFilter, setRarityFilter] = useState<'all' | CardDef['rarity']>('all');
  const [sortMode, setSortMode] = useState<SortMode>('source');
  const [reverse, setReverse] = useState(false);
  const [inspect, setInspect] = useState<DeckEntry | null>(null);
  const [query, setQuery] = useState('');

  const persistentEntries = buildEntries([...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID]);
  const monsterGroups = state.party.map((m) => ({ monster: m, entries: buildEntries(SPECIES_CARDS[m.speciesId] ?? [], m) }));
  const expeditionEntries = buildEntries(state.expeditionExtras);

  // Filter chips AND search compose: a card must satisfy both to show.
  const matches = (e: DeckEntry): boolean =>
    (typeFilter === 'all' || e.card.type === typeFilter) &&
    (rarityFilter === 'all' || e.card.rarity === rarityFilter) &&
    cardMatchesQuery(e.card, query);

  const entryKey = (e: DeckEntry) => `${e.card.id}-${e.sourceMonster?.uid ?? 'x'}`;

  const cell = (entry: DeckEntry) => (
    <button
      type="button"
      key={entryKey(entry)}
      className="deck-cell"
      // The grid, not the toolbar, is where the cursor belongs: the toolbar is
      // three rows of chips with three different meanings, and the cards are
      // what the player came to look at. LB/RB reach the filters from here.
      data-nav-initial={entryKey(entry) === firstShownKey ? '' : undefined}
      data-nav-key={`deck-${entryKey(entry)}`}
      aria-label={`${entry.card.name}${entry.count > 1 ? `, ${entry.count} copies` : ''}`}
      onClick={() => {
        sfx('uiClick');
        setInspect(entry);
      }}
    >
      <CardView
        card={entry.card}
        hero={player}
        sourceMonster={entry.sourceMonster}
        width={180}
        upgraded={(player.upgradedCounts[entry.card.id] ?? 0) > 0}
      />
      {entry.count > 1 && <span className="deck-count">×{entry.count}</span>}
    </button>
  );

  const section = (title: string, entries: DeckEntry[]) => {
    const shown = entries.filter(matches);
    if (shown.length === 0) return null;
    return (
      <>
        <h2 className="sheet-section-title">
          {title} <span className="sheet-sec-count">{shown.reduce((n, e) => n + e.count, 0)}</span>
        </h2>
        <div className="deck-grid-lg">{shown.map(cell)}</div>
      </>
    );
  };

  let flatView: DeckEntry[] = [];
  if (sortMode !== 'source') {
    flatView = [...persistentEntries, ...monsterGroups.flatMap((g) => g.entries), ...expeditionEntries].sort(COMPARATORS[sortMode]);
    if (reverse) flatView.reverse();
  }

  const allEntries = [...persistentEntries, ...monsterGroups.flatMap((g) => g.entries), ...expeditionEntries];
  const totalCards = allEntries.reduce((n, e) => n + e.count, 0);
  const anyShown = allEntries.some(matches);
  const persistentMatchCount = persistentEntries.filter(matches).length;
  const flatMatchCount = flatView.filter(matches).length;

  // The first card the grid will actually draw, in render order — `cell` reads
  // this to mark where the cursor opens. Declared here rather than beside
  // `cell` because it depends on the sort mode, which is resolved above.
  const firstShownKey = (sortMode === 'source' ? allEntries : flatView).filter(matches).map(entryKey)[0];

  const root = useRef<HTMLDivElement>(null);
  /** Step the type filter, so a shoulder button cuts the grid down without a trip to the toolbar. */
  const cycleType = (delta: 1 | -1): boolean => {
    const order: ('all' | CardDef['type'])[] = ['all', ...CARD_TYPES];
    const at = order.indexOf(typeFilter);
    setTypeFilter(order[(at + delta + order.length) % order.length]);
    return true;
  };
  useNavScope(root, {
    id: 'deck',
    onButton: (button) => (button === 'prevTab' ? cycleType(-1) : button === 'nextTab' ? cycleType(1) : false),
    onCancel: () => {
      // Three things B can mean here, in the order a player means them.
      const active = document.activeElement;
      if (active instanceof HTMLInputElement && active.type === 'text') {
        // Out of the search box first — arrows type in there, so it is the one
        // place the cursor can feel stuck. Hand it back to the grid, not to
        // <body>, or the ring vanishes with no way to get it back.
        if (!focusFirstIn(root.current?.querySelector<HTMLElement>('.deck-grid-lg'))) active.blur();
        return true;
      }
      if (query || typeFilter !== 'all' || rarityFilter !== 'all') {
        setQuery('');
        setTypeFilter('all');
        setRarityFilter('all');
        return true;
      }
      dispatch({ type: 'GOTO', screen: backScreen });
      return true;
    },
  });
  // Every one of these rebuilds the grid under the cursor.
  useRefocusOn([query, typeFilter, rarityFilter, sortMode, reverse]);

  return (
    <div className="panel deck-screen" ref={root}>
      <h1 className="title title-with-icon">
        <Icon name="deck" size={26} emoji="" /> Your Deck <span className="deck-total">{totalCards} cards</span>
      </h1>
      <NpcHost npcId="kess" state={state} />
      <p className="subtitle">
        {player.className} core + {player.race} blood + one open hand. Monsters add their cards while they live; expedition boons fade at the gate.
      </p>

      <div className="deck-toolbar">
        <button
          className={`deck-chip ${typeFilter === 'all' && rarityFilter === 'all' ? 'on' : ''}`}
          onClick={() => {
            setTypeFilter('all');
            setRarityFilter('all');
          }}
        >
          All
        </button>
        {CARD_TYPES.map((t) => (
          <button key={t} className={`deck-chip ${typeFilter === t ? 'on' : ''}`} onClick={() => setTypeFilter(typeFilter === t ? 'all' : t)}>
            <span className="deck-dot" style={{ background: TYPE_TINT[t] }} />
            {t}
          </button>
        ))}
        <span className="deck-chip-sep" aria-hidden="true" />
        {CARD_RARITIES.map((r) => (
          <button key={r} className={`deck-chip ${rarityFilter === r ? 'on' : ''}`} onClick={() => setRarityFilter(rarityFilter === r ? 'all' : r)}>
            {r}
          </button>
        ))}
      </div>

      <input
        type="text"
        className="card-search"
        placeholder="Search by name, type, or text..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search cards"
      />

      <div className="btn-row">
        {SORT_MODES.map(([id, icon, emoji, label]) => (
          <button
            key={id}
            className={`btn small ${sortMode === id ? 'primary' : ''}`}
            onClick={() => {
              sfx('uiClick');
              setSortMode(id);
            }}
          >
            <Icon name={icon} emoji={emoji} size={16} /> {label}
          </button>
        ))}
        <button
          className={`btn small ${reverse ? 'primary' : ''}`}
          disabled={sortMode === 'source'}
          onClick={() => {
            sfx('uiClick');
            setReverse((r) => !r);
          }}
        >
          <Icon name="sort_reverse" emoji="⇅" size={16} /> Reverse
        </button>
      </div>

      {sortMode === 'source' ? (
        <>
          {section(`${player.className} & ${player.race} · ${persistentMatchCount} cards`, persistentEntries)}
          {monsterGroups.map(({ monster: m, entries }) => (
            <div key={m.uid}>
              {section(`${m.species.emoji} ${m.nickname}${m.plus > 0 ? ` +${m.plus}` : ''} · ${m.isAlive() ? 'fighting' : 'KO — cards inactive'}`, entries)}
            </div>
          ))}
          {expeditionEntries.length > 0 && section(`Expedition boons · fade on leaving`, expeditionEntries)}
        </>
      ) : (
        section(`All cards · ${flatMatchCount}`, flatView)
      )}

      {!anyShown && (
        <div className="empty-state">
          <span className="empty-glyph">🃏</span>
          {query ? `No cards match "${query}".` : 'No cards match that filter.'}
        </div>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'cardCodex' })}>
          <Icon name="deck" emoji="📖" size={16} /> Card Codex
        </button>
      </div>

      {inspect && (
        <CardDetailOverlay
          card={inspect.card}
          hero={player}
          sourceMonster={inspect.sourceMonster}
          count={inspect.count}
          upgraded={(player.upgradedCounts[inspect.card.id] ?? 0) > 0}
          onClose={() => setInspect(null)}
        />
      )}
    </div>
  );
}
