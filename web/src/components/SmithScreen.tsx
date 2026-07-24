import type { GameAction, GameState } from '../engine/game';
import { CLASS_DECKS, RACE_CARDS, TAME_CARD_ID, getCard } from '../engine/data/cards';
import { BALANCE } from '../engine/data/balance';
import { CardView } from './CardView';
import { play as sfx } from '../platform/sfx';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import '../services.css';

export function SmithScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const all = [...CLASS_DECKS[player.className], ...RACE_CARDS[player.race], TAME_CARD_ID];
  const ids = [...new Set(all)];
  const charmCost = 90 + player.level * 10;
  const trinketCost = 110 + player.level * 12;

  return (
    <div className="panel">
      <h1 className="title title-with-icon"><Icon name="smith" size={26} emoji="" /> The Forge</h1>
      <NpcHost npcId="grude" state={state} />
      <div className="svc-stock-head">
        <span className="svc-stock-title">Grude's anvil</span>
        <span className="price-chip svc-purse" title="Your purse">☉ {player.gold}g</span>
      </div>

      <h2 className="svc-section">Accessories</h2>
      <div className="forge-plates">
        <div className={`forge-plate${player.gold < charmCost ? ' cant' : ''}`}>
          <span className="svc-plate">🧿</span>
          <div className="forge-plate-body">
            <div className="forge-plate-name">Forge a charm</div>
            <div className="affix-line">A trinket for a monster to wear. Two blessings, minimum. No refunds, no promises.</div>
          </div>
          <div className="svc-buy">
            <span className="price-chip">☉ {charmCost}g</span>
            <button
              className="btn small primary"
              disabled={player.gold < charmCost}
              onClick={() => {
                sfx('gold');
                dispatch({ type: 'FORGE_CHARM' });
              }}
            >
              Forge
            </button>
          </div>
        </div>

        <div className={`forge-plate${player.gold < trinketCost ? ' cant' : ''}`}>
          <span className="svc-plate">🧿</span>
          <div className="forge-plate-body">
            <div className="forge-plate-name">Forge a trinket</div>
            <div className="affix-line">A monster's second accessory. Two blessings or three, if the metal is willing.</div>
          </div>
          <div className="svc-buy">
            <span className="price-chip">☉ {trinketCost}g</span>
            <button
              className="btn small primary"
              disabled={player.gold < trinketCost}
              onClick={() => {
                sfx('gold');
                dispatch({ type: 'FORGE_TRINKET' });
              }}
            >
              Forge
            </button>
          </div>
        </div>
      </div>

      <h2 className="svc-section">Reforge</h2>
      <p className="subtitle" style={{ margin: '0 0 10px' }}>
        Reforging improves ONE copy of a card at a time. Monster cards sharpen with their monster instead.
      </p>
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
