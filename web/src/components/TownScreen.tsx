import type { GameAction, GameState } from '../engine/game';
import { availableQuests } from '../engine/game';
import { Icon } from './Icon';
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
          <Icon name="gates" emoji="🚪" size={22} /> The Gates
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'REST' })}>
          <Icon name="rest" emoji="🛏️" size={22} /> Rest (free)
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'shopItems' })}>
          <Icon name="itemshop" emoji="🧪" size={22} /> Item Shop
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'shopGear' })}>
          <Icon name="gearshop" emoji="⚒️" size={22} /> Gear Shop
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'stable' })}>
          <Icon name="stable" emoji="🐴" size={22} /> Stable
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'breeding' })}>
          <Icon name="breeding" emoji="🥚" size={22} /> Breeding Lab
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'questBoard' })}>
          <Icon name="quests" emoji="📜" size={22} /> Quest Board
          {(questsNew || questsClaimable) && <span className="badge-dot" title={questsClaimable ? 'Rewards to claim' : 'New requests posted'} />}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'tavern' })}>
          <Icon name="tavern" emoji="🕯️" size={22} /> Tavern
          {tavernNew && <span className="badge-dot" title="People have new things to say" />}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'deck' })}>
          <Icon name="deck" emoji="🃏" size={22} /> Deck
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'smith' })}>
          <Icon name="smith" emoji="🔥" size={22} /> Smith
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'chronicle' })}>
          <Icon name="chronicle" emoji="📖" size={22} /> Chronicle
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'characterSheet' })}>
          <Icon name="character" emoji="🧝" size={22} /> Character{state.player && state.player.attributePoints > 0 ? ` (${state.player.attributePoints})` : ''}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
          <Icon name="equipment" emoji="🎒" size={22} /> Equipment{state.player && state.player.items.length > 0 ? ` (${state.player.items.length})` : ''}
        </button>
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'saveLoad' })}>
          <Icon name="save" emoji="💾" size={22} /> Save / Load
        </button>
      </div>
      </div>
    </div>
  );
}
