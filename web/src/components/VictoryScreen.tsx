import type { GameAction, GameState } from '../engine/game';

export function VictoryScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player;
  return (
    <div className="panel center-text">
      <h1 className="title">🌅 Dawn over Everdusk</h1>
      <p className="story-paragraph">
        The Hollow Sovereign is unmade. The Great Tree blazes like a green sun, and the town that hired a nobody has a hero to argue about statues for.
      </p>
      {player && (
        <p className="subtitle">
          {player.name} · Level {player.level} · {state.party.length + state.stable.length} monsters befriended · {state.orbs.length}/4 orbs returned
        </p>
      )}
      <p className="subtitle">The gates stand open. The world behind them is just a world now - keep exploring, taming, and breeding as long as you like.</p>
      <div className="btn-row" style={{ justifyContent: 'center' }}>
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Keep playing
        </button>
        <button className="btn danger" onClick={() => dispatch({ type: 'RESTART' })}>
          New game
        </button>
      </div>
    </div>
  );
}
