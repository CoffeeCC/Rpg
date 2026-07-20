import type { GameAction, GameState } from '../engine/game';
import { availableQuests } from '../engine/game';
import { PAINTED_TOWN } from '../art/painted';

export function TownScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const questsNew = availableQuests(state).length > state.seen.questCount;
  const questsClaimable = state.questLog.some((q) => q.complete && !q.claimed);
  const tavernNew = state.storyChapter > state.seen.tavernChapter;
  return (
    <div className="panel town-panel">
      <div className="stage-backdrop">
        <img className="painted-scene" src={PAINTED_TOWN} alt="" />
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
          {(questsNew || questsClaimable) && <span className="badge-dot" title={questsClaimable ? 'Rewards to claim' : 'New requests posted'} />}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'tavern' })}>
          🕯️ Tavern
          {tavernNew && <span className="badge-dot" title="People have new things to say" />}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'deck' })}>
          🃏 Deck
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'smith' })}>
          🔥 Smith
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
