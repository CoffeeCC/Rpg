import type { GameAction, GameState } from '../engine/game';
import { getCard } from '../engine/data/cards';
import { CardView } from './CardView';
import { play as sfx } from '../platform/sfx';

export function CardRewardScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player;
  if (!player || !state.pendingReward) return null;
  return (
    <div className="panel center-text reward-screen">
      <h1 className="title">Choose Thy Boon</h1>
      <p className="subtitle">One card may join your deck — until you leave the gate, or fall.</p>
      <div className="reward-row">
        {state.pendingReward.map((cardId) => {
          const card = getCard(cardId);
          if (!card) return null;
          return (
            <button
              type="button"
              key={cardId}
              className="reward-card"
              onClick={() => {
                sfx('gold');
                dispatch({ type: 'CHOOSE_REWARD', cardId });
              }}
            >
              <CardView card={card} hero={player} width={170} />
            </button>
          );
        })}
      </div>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button className="btn" onClick={() => dispatch({ type: 'CHOOSE_REWARD', cardId: null })}>
          Take nothing
        </button>
      </div>
    </div>
  );
}
