import { useState } from 'react';
import type { GameAction, GameState, Screen } from '../engine/game';
import type { CardDef } from '../engine/types';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, SPECIES_CARDS, getCard } from '../engine/data/cards';
import { TYPE_TINT } from '../art/cardFrames';
import { CardView } from './CardView';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import '../sheets.css';

// v17 (PLAN7 C2): the deck as a card gallery — responsive grid of readable
// cards, type/rarity filter chips, a count in the header, hover lift+zoom.
// Presentation only — the single GOTO dispatch is unchanged.

const CARD_TYPES: CardDef['type'][] = ['strike', 'spell', 'guard', 'tactic', 'summon'];
const CARD_RARITIES: CardDef['rarity'][] = ['starter', 'common', 'uncommon', 'rare'];

function countIds(ids: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()];
}

export function DeckScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const [typeFilter, setTypeFilter] = useState<'all' | CardDef['type']>('all');
  const [rarityFilter, setRarityFilter] = useState<'all' | CardDef['rarity']>('all');
  const persistent = [...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID];

  const matches = (id: string): boolean => {
    const card = getCard(id);
    if (!card) return false;
    return (typeFilter === 'all' || card.type === typeFilter) && (rarityFilter === 'all' || card.rarity === rarityFilter);
  };

  const totalCards =
    persistent.length + state.party.reduce((n, m) => n + (SPECIES_CARDS[m.speciesId]?.length ?? 0), 0) + state.expeditionExtras.length;
  const anyShown = [
    ...persistent,
    ...state.party.flatMap((m) => SPECIES_CARDS[m.speciesId] ?? []),
    ...state.expeditionExtras,
  ].some(matches);

  const section = (title: string, entries: [string, number][], sourceUid?: string) => {
    const shown = entries.filter(([id]) => matches(id));
    if (shown.length === 0) return null;
    return (
      <>
        <h2 className="sheet-section-title">
          {title} <span className="sheet-sec-count">{shown.reduce((n, [, c]) => n + c, 0)}</span>
        </h2>
        <div className="deck-grid-lg">
          {shown.map(([id, count]) => {
            const card = getCard(id);
            if (!card) return null;
            const source = sourceUid ? state.party.find((m) => m.uid === sourceUid) : undefined;
            return (
              <div key={id} className="deck-cell">
                <CardView card={card} hero={player} sourceMonster={source} width={180} upgraded={(player.upgradedCounts[id] ?? 0) > 0} />
                {count > 1 && <span className="deck-count">×{count}</span>}
              </div>
            );
          })}
        </div>
      </>
    );
  };

  return (
    <div className="panel deck-screen">
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

      {section(`${player.className} & ${player.race} · ${persistent.length} cards`, countIds(persistent))}

      {state.party.map((m) => (
        <div key={m.uid}>
          {section(
            `${m.species.emoji} ${m.nickname}${m.plus > 0 ? ` +${m.plus}` : ''} · ${m.isAlive() ? 'fighting' : 'KO — cards inactive'}`,
            countIds(SPECIES_CARDS[m.speciesId] ?? []),
            m.uid
          )}
        </div>
      ))}

      {state.expeditionExtras.length > 0 && section(`Expedition boons · fade on leaving`, countIds(state.expeditionExtras))}

      {!anyShown && (
        <div className="empty-state">
          <span className="empty-glyph">🃏</span>
          No cards match that filter.
        </div>
      )}

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
