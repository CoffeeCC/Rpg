import { useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { CONSUMABLES } from '../engine/data/items';
import { ItemLine } from './ItemLine';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';
import { useNavScope } from '../nav';
import '../services.css';

export function ShopItemsScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  // A column of Buy buttons. Rows the player cannot afford are `disabled`, so
  // the cursor steps over them and lands on the first thing actually for sale.
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'shopItems',
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  return (
    <div className="panel" ref={root}>
      <h1 className="title title-with-icon"><Icon name="itemshop" size={26} emoji="" /> Found Things</h1>
      <NpcHost npcId="maribel" state={state} />
      <div className="svc-stock-head">
        <span className="svc-stock-title">Curiosities &amp; remedies</span>
        <span className="price-chip svc-purse" title="Your purse">☉ {player.gold}g</span>
      </div>
      <div className="option-list">
        {Object.values(CONSUMABLES).map((def) => {
          const owned = player.inventory.filter((n) => n === def.name).length;
          const afford = player.gold >= def.price;
          return (
            <div className={`item-row svc-shop-row${afford ? '' : ' cant'}`} key={def.name}>
              <span className="svc-plate">{def.emoji}</span>
              <div className="item-desc">
                <Icon name={`item_${def.name.toLowerCase()}`} emoji={def.emoji} size={16} /> <b>{def.name}</b>{' '}
                {owned > 0 && <span className="pill">own ×{owned}</span>}
                <div className="affix-line">{def.description}</div>
              </div>
              <div className="svc-buy">
                <span className="price-chip">☉ {def.price}g</span>
                <button className="btn small" disabled={player.gold < def.price} onClick={() => dispatch({ type: 'SHOP_BUY_CONSUMABLE', name: def.name })}>
                  Buy
                </button>
              </div>
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
  // Two stacked unbounded lists (stock, then the whole bag). The bag can run to
  // thirty rows, so this is one of the screens where LT/RT paging and the right
  // stick earn their keep — both work off `.game-main` with no code here.
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'shopGear',
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  return (
    <div className="panel" ref={root}>
      <h1 className="title title-with-icon"><Icon name="gearshop" size={26} emoji="" /> The Gear Stall</h1>
      <NpcHost npcId="grude" state={state} />
      <div className="svc-stock-head">
        <span className="svc-stock-title">Today's stock</span>
        <span className="svc-hint">↻ Stock rotates when you Rest</span>
        <span className="price-chip svc-purse" title="Your purse">☉ {player.gold}g</span>
      </div>
      <div className="option-list">
        {state.gearStock.length === 0 && (
          <div className="empty-state">
            <span className="empty-glyph">⚒️</span>
            <span>Sold out! Rest to restock.</span>
          </div>
        )}
        {state.gearStock.map((item, i) => {
          const afford = player.gold >= item.value;
          return (
            <div className={`item-row svc-shop-row${afford ? '' : ' cant'}`} key={item.uid}>
              <div className="item-desc">
                <ItemLine item={item} iconSize={56} />
              </div>
              <div className="svc-buy">
                <span className="price-chip">☉ {item.value}g</span>
                <button className="btn small" disabled={player.gold < item.value} onClick={() => dispatch({ type: 'SHOP_BUY_GEAR', index: i })}>
                  Buy
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="svc-section">Sell from bag</h2>
      <div className="option-list">
        {player.items.length === 0 && (
          <div className="empty-state">
            <span className="empty-glyph">🎒</span>
            <span>Your bag is empty — the gates are generous to the bold.</span>
          </div>
        )}
        {player.items.map((item) => (
          <div className="item-row svc-shop-row" key={item.uid}>
            <div className="item-desc">
              <ItemLine item={item} iconSize={56} />
            </div>
            <div className="svc-buy">
              <span className="price-chip">☉ {Math.max(1, Math.floor(item.value / 2))}g</span>
              <button className="btn small" onClick={() => dispatch({ type: 'SELL_GEAR', uid: item.uid })}>
                Sell
              </button>
            </div>
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
