import type { GameAction, GameState } from '../engine/game';
import { TownBackdrop } from '../art/backdrops';

export function TownScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  return (
    <div className="panel town-panel">
      <div className="stage-backdrop">
        <TownBackdrop />
      </div>
      <div className="town-content">
      <h1 className="title">🌳 Everdusk</h1>
      <p className="subtitle">The Last Lantern burns low over the square. {4 - state.orbs.length > 0 ? `${4 - state.orbs.length} orb(s) still missing.` : 'The Abyss awaits.'}</p>
      <div className="menu-grid">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'gateSelect' })}>
          🚪 The Gates
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'REST' })}>
          🛏️ Rest (free)
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'shopItems' })}>
          🧪 Item Shop
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'shopGear' })}>
          ⚒️ Gear Shop
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'stable' })}>
          🐴 Stable
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'breeding' })}>
          🥚 Breeding Lab
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'questBoard' })}>
          📜 Quest Board
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'tavern' })}>
          🕯️ Tavern
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'deck' })}>
          🃏 Deck
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'smith' })}>
          🔥 Smith{state.player && state.player.upgradedCards.length > 0 ? ` (${state.player.upgradedCards.length})` : ''}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'chronicle' })}>
          📖 Chronicle
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'characterSheet' })}>
          🧝 Character{state.player && state.player.attributePoints > 0 ? ` (${state.player.attributePoints})` : ''}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
          🎒 Equipment{state.player && state.player.items.length > 0 ? ` (${state.player.items.length})` : ''}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'saveLoad' })}>
          💾 Save / Load
        </button>
      </div>
      </div>
    </div>
  );
}
