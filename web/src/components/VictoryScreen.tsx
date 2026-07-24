import type { GameAction, GameState } from '../engine/game';
import '../sheets.css';

// v17 (PLAN7 C7): the ending as a cinematic — centered block, big display
// type, verse lines fading in one after another (CSS only), one strong CTA.
// Presentation only; both dispatches unchanged.

export function VictoryScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player;
  return (
    <div className="panel center-text cine-screen victory-cine">
      <div className="cine-glow" aria-hidden="true" />
      <div className="cine-block">
        <h1 className="title cine-title">🌅 Dawn over Everdusk</h1>
        <p className="story-paragraph cine-verse">
          The Hollow Sovereign is unmade. The Last Lantern burns tall and unafraid for the first time in living memory, and the town that hired a nobody has a hero to argue about statues for.
        </p>
        {player && (
          <p className="subtitle cine-verse">
            {player.name} · Level {player.level} · {state.party.length + state.stable.length} monsters befriended · {state.orbs.length}/4 orbs returned
          </p>
        )}
        <p className="subtitle cine-verse">The gates stand open. The world behind them is just a world now - keep exploring, taming, and breeding as long as you like.</p>
        <div className="btn-row cine-cta">
          <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
            Keep playing
          </button>
          <button className="btn danger cine-quiet" onClick={() => dispatch({ type: 'RESTART' })}>
            New game
          </button>
        </div>
      </div>
    </div>
  );
}
