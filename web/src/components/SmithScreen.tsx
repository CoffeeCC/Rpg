import type { GameAction, GameState } from '../engine/game';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, getCard } from '../engine/data/cards';
import { BALANCE } from '../engine/data/balance';
import { CardView } from './CardView';
import { play as sfx } from '../platform/sfx';

export function SmithScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const persistent = [...new Set([...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID])];

  return (
    <div className="panel">
      <h1 className="title">⚒️ The Smith</h1>
      <p className="subtitle">
        <span className="gold">☉ {player.gold}</span> · Reforging a card improves every copy in your deck, forever. Monster cards sharpen with their
        monster instead.
      </p>

      <div className="deck-grid">
        {persistent.map((id) => {
          const card = getCard(id);
          if (!card) return null;
          const done = player.upgradedCards.includes(id);
          const cost = BALANCE.upgradeCosts[card.rarity] ?? 100;
          return (
            <div key={id} className="deck-cell">
              <CardView card={card} hero={player} width={128} upgraded={done} />
              {done ? (
                <span className="pill slain-pill">reforged</span>
              ) : (
                <button
                  className="btn small"
                  disabled={player.gold < cost}
                  onClick={() => {
                    sfx('gold');
                    dispatch({ type: 'UPGRADE_CARD', cardId: id });
                  }}
                >
                  Reforge · {cost}g
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
    </div>
  );
}
