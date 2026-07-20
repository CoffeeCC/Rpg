import type { GameAction, GameState } from '../engine/game';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, getCard } from '../engine/data/cards';
import { BALANCE } from '../engine/data/balance';
import { CardView } from './CardView';
import { play as sfx } from '../platform/sfx';

export function SmithScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const all = [...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID];
  const ids = [...new Set(all)];
  const charmCost = 90 + player.level * 10;

  return (
    <div className="panel">
      <h1 className="title">⚒️ The Smith</h1>
      <p className="subtitle">
        <span className="gold">☉ {player.gold}</span> · Reforging improves ONE copy of a card at a time. Monster cards sharpen with their monster
        instead.
      </p>

      <div className="item-row" style={{ marginBottom: 12 }}>
        <div className="item-desc">
          🧿 <b>Forge a charm</b> — a trinket for a monster to wear. Two blessings, minimum. No refunds, no promises.
        </div>
        <button
          className="btn small primary"
          disabled={player.gold < charmCost}
          onClick={() => {
            sfx('gold');
            dispatch({ type: 'FORGE_CHARM' });
          }}
        >
          {charmCost}g
        </button>
      </div>

      <div className="deck-grid">
        {ids.map((id) => {
          const card = getCard(id);
          if (!card) return null;
          const copies = all.filter((x) => x === id).length;
          const done = player.upgradedCounts[id] ?? 0;
          const cost = BALANCE.upgradeCosts[card.rarity] ?? 100;
          return (
            <div key={id} className="deck-cell">
              <CardView card={card} hero={player} width={128} upgraded={done > 0} />
              <span className="pill">
                {done}/{copies} reforged
              </span>
              {done < copies && (
                <button
                  className="btn small"
                  disabled={player.gold < cost}
                  onClick={() => {
                    sfx('gold');
                    dispatch({ type: 'UPGRADE_CARD', cardId: id });
                  }}
                >
                  Reforge one · {cost}g
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
