import { useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { getCard } from '../engine/data/cards';
import { CardView } from './CardView';
import { useNavScope } from '../nav';
import { play as sfx } from '../platform/sfx';
import '../sheets.css';

// v17 (PLAN7 C9): cards keep their 300px reading size; each boon now sits on
// a breathing rarity glow, and the pick flashes gold as it's taken.
// Presentation only; the CHOOSE_REWARD dispatches are unchanged.

export function CardRewardScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player;
  // Hooks before the early return: this screen unmounts the moment a boon is
  // taken, and a conditional hook would be a different component each render.
  const root = useRef<HTMLDivElement>(null);
  // No `onCancel`. B is deliberately dead here — one stray press must never
  // discard a legendary. "Take nothing" is a control the player has to choose.
  useNavScope(root, { id: 'cardReward' });
  if (!player || !state.pendingReward) return null;
  return (
    <div className="panel center-text reward-screen" ref={root}>
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
              className={`reward-card reward-rarity-${card.rarity}`}
              onClick={() => {
                sfx('gold');
                dispatch({ type: 'CHOOSE_REWARD', cardId });
              }}
            >
              <CardView card={card} hero={player} width={300} />
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
