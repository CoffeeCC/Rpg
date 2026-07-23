import type { GameAction, GameState } from '../engine/game';
import { CONSUMABLES } from '../engine/data/items';
import { ItemLine } from './ItemLine';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';

export function ShopItemsScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  return (
    <div className="panel">
      <h1 className="title title-with-icon"><Icon name="itemshop" size={26} emoji="" /> Found Things</h1>
      <NpcHost npcId="maribel" state={state} />
      <p className="subtitle gold">You have {player.gold}g</p>
      <div className="option-list">
        {Object.values(CONSUMABLES).map((def) => {
          const owned = player.inventory.filter((n) => n === def.name).length;
          return (
            <div className="item-row" key={def.name}>
              <div className="item-desc">
                <Icon name={`item_${def.name.toLowerCase()}`} emoji={def.emoji} size={16} /> <b>{def.name}</b> — {def.price}g{' '}
                {owned > 0 && <span className="pill">own ×{owned}</span>}
                <div className="affix-line">{def.description}</div>
              </div>
              <button className="btn small" disabled={player.gold < def.price} onClick={() => dispatch({ type: 'SHOP_BUY_CONSUMABLE', name: def.name })}>
                Buy
              </button>
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

export function ShopGearScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  return (
    <div className="panel">
      <h1 className="title title-with-icon"><Icon name="gearshop" size={26} emoji="" /> The Gear Stall</h1>
      <NpcHost npcId="grude" state={state} />
      <p className="subtitle">
        <span className="gold">You have {player.gold}g.</span> Stock rotates when you Rest.
      </p>
      <div className="option-list">
        {state.gearStock.length === 0 && <p className="subtitle">Sold out! Rest to restock.</p>}
        {state.gearStock.map((item, i) => (
          <div className="item-row" key={item.uid}>
            <div className="item-desc">
              <ItemLine item={item} />
            </div>
            <span className="gold">{item.value}g</span>
            <button className="btn small" disabled={player.gold < item.value} onClick={() => dispatch({ type: 'SHOP_BUY_GEAR', index: i })}>
              Buy
            </button>
          </div>
        ))}
      </div>

      <h1 className="title" style={{ marginTop: 14 }}>
        Sell from bag
      </h1>
      <div className="option-list">
        {player.items.length === 0 && <p className="subtitle">Your bag is empty.</p>}
        {player.items.map((item) => (
          <div className="item-row" key={item.uid}>
            <div className="item-desc">
              <ItemLine item={item} />
            </div>
            <button className="btn small" onClick={() => dispatch({ type: 'SELL_GEAR', uid: item.uid })}>
              Sell ({Math.max(1, Math.floor(item.value / 2))}g)
            </button>
          </div>
        ))}
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
    </div>
  );
}
