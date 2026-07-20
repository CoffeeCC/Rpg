import type { GameAction, GameState, Screen } from '../engine/game';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, SPECIES_CARDS, getCard } from '../engine/data/cards';
import { CardView } from './CardView';

function countIds(ids: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()];
}

export function DeckScreen({ state, backScreen, dispatch }: { state: GameState; backScreen: Screen; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const persistent = [...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID];

  const section = (title: string, entries: [string, number][], sourceUid?: string) => (
    <>
      <h2 className="title" style={{ fontSize: '0.95rem', marginTop: 16 }}>
        {title}
      </h2>
      <div className="deck-grid">
        {entries.map(([id, count]) => {
          const card = getCard(id);
          if (!card) return null;
          const source = sourceUid ? state.party.find((m) => m.uid === sourceUid) : undefined;
          return (
            <div key={id} className="deck-cell">
              <CardView card={card} hero={player} sourceMonster={source} width={128} upgraded={player.upgradedCards.includes(id)} />
              {count > 1 && <span className="deck-count">×{count}</span>}
            </div>
          );
        })}
      </div>
    </>
  );

  return (
    <div className="panel">
      <h1 className="title">🃏 Your Deck</h1>
      <p className="subtitle">
        {player.className} core + {player.race} blood + one open hand. Monsters add their cards while they live; expedition boons fade at the gate.
      </p>

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

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: backScreen })}>
          Back
        </button>
      </div>
    </div>
  );
}
