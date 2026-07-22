import { useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { CardDef } from '../engine/types';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, SPECIES_CARDS, getCard } from '../engine/data/cards';
import { CardView } from './CardView';
import { CardDetailOverlay } from './CardDetailOverlay';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import { play as sfx } from '../platform/sfx';

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

const SORT_MODES: [SortMode, string][] = [
  ['source', '📚 By Source'],
  ['name', '🔤 Name'],
  ['cost', '◈ Cost'],
  ['type', '🗂 Type'],
  ['rarity', '✨ Rarity'],
  ['count', '× Quantity'],
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
  const [sortMode, setSortMode] = useState<SortMode>('source');
  const [reverse, setReverse] = useState(false);
  const [inspect, setInspect] = useState<DeckEntry | null>(null);

  const persistentEntries = buildEntries([...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID]);
  const monsterGroups = state.party.map((m) => ({ monster: m, entries: buildEntries(SPECIES_CARDS[m.speciesId] ?? [], m) }));
  const expeditionEntries = buildEntries(state.expeditionExtras);

  const cell = (entry: DeckEntry) => (
    <button
      type="button"
      key={`${entry.card.id}-${entry.sourceMonster?.uid ?? 'x'}`}
      className="deck-cell"
      onClick={() => {
        sfx('uiClick');
        setInspect(entry);
      }}
    >
      <CardView
        card={entry.card}
        hero={player}
        sourceMonster={entry.sourceMonster}
        width={128}
        upgraded={(player.upgradedCounts[entry.card.id] ?? 0) > 0}
      />
      {entry.count > 1 && <span className="deck-count">×{entry.count}</span>}
    </button>
  );

  const section = (title: string, entries: DeckEntry[]) => (
    <>
      <h2 className="title" style={{ fontSize: '0.95rem', marginTop: 16 }}>
        {title}
      </h2>
      <div className="deck-grid">{entries.map(cell)}</div>
    </>
  );

  let flatView: DeckEntry[] = [];
  if (sortMode !== 'source') {
    flatView = [...persistentEntries, ...monsterGroups.flatMap((g) => g.entries), ...expeditionEntries].sort(COMPARATORS[sortMode]);
    if (reverse) flatView.reverse();
  }

  return (
    <div className="panel">
      <h1 className="title title-with-icon">
        <Icon name="deck" size={26} emoji="" /> Your Deck
      </h1>
      <NpcHost npcId="kess" state={state} />
      <p className="subtitle">
        {player.className} core + {player.race} blood + one open hand. Monsters add their cards while they live; expedition boons fade at the gate.
      </p>

      <div className="btn-row">
        {SORT_MODES.map(([id, label]) => (
          <button
            key={id}
            className={`btn small ${sortMode === id ? 'primary' : ''}`}
            onClick={() => {
              sfx('uiClick');
              setSortMode(id);
            }}
          >
            {label}
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
          ⇅ Reverse
        </button>
      </div>

      {sortMode === 'source' ? (
        <>
          {section(`${player.className} & ${player.race} · ${persistentEntries.length} cards`, persistentEntries)}
          {monsterGroups.map(({ monster: m, entries }) => (
            <div key={m.uid}>
              {section(`${m.species.emoji} ${m.nickname}${m.plus > 0 ? ` +${m.plus}` : ''} · ${m.isAlive() ? 'fighting' : 'KO — cards inactive'}`, entries)}
            </div>
          ))}
          {expeditionEntries.length > 0 && section(`Expedition boons · fade on leaving`, expeditionEntries)}
        </>
      ) : (
        section(`All cards · ${flatView.length}`, flatView)
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'cardCodex' })}>
          📖 Card Codex
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
