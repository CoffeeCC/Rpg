import { useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { CONSUMABLES } from '../engine/data/items';
import { getCard } from '../engine/data/cards';
import { isOpened, isBroken, unitAt, movFor, threatTiles, TILE, type FloorUnit } from '../engine/systems/floors';
import { MonsterArt } from '../art/monsterArt';
import { TileFill } from '../art/tileArt';

const TILE_VIEW: Record<string, { emoji: string; cls: string }> = {
  [TILE.WALL]: { emoji: '', cls: 'wall' },
  [TILE.FLOOR]: { emoji: '', cls: 'floor-tile' },
  [TILE.START]: { emoji: '🚪', cls: 'special stairs' },
  [TILE.STAIRS]: { emoji: '🕳️', cls: 'special stairs' },
  [TILE.BOSS]: { emoji: '💀', cls: 'special boss' },
  [TILE.MINIBOSS]: { emoji: '', cls: 'floor-tile' },
  [TILE.ENEMY]: { emoji: '', cls: 'floor-tile' },
  [TILE.TAMER]: { emoji: '', cls: 'floor-tile' },
  [TILE.MERCHANT]: { emoji: '', cls: 'floor-tile' },
  [TILE.BREAKABLE]: { emoji: '🛢️', cls: 'special breakable' },
  [TILE.CHEST]: { emoji: '🎁', cls: 'special chest' },
  [TILE.SHRINE]: { emoji: '⛲', cls: 'special shrine' },
  [TILE.EVENT]: { emoji: '❓', cls: 'special event-tile' },
  [TILE.SECRET]: { emoji: '', cls: 'floor-tile' },
};

function UnitToken({ unit }: { unit: FloorUnit }) {
  if (unit.kind === 'merchant') {
    return (
      <span className="unit-token merchant" title={unit.label}>
        🏮
      </span>
    );
  }
  if (unit.kind === 'tamer') {
    return (
      <span className="unit-token tamer" title={`${unit.label} (Lv${unit.level})`}>
        ⚔️
      </span>
    );
  }
  return (
    <span className={`unit-token ${unit.kind}`} title={`${unit.label} (Lv${unit.level})`}>
      {unit.speciesId && <MonsterArt speciesId={unit.speciesId} size={22} rarity={unit.kind === 'miniboss' ? 'Rare' : 'Common'} />}
      {unit.kind === 'miniboss' && <span className="unit-crown">👑</span>}
    </span>
  );
}

function MerchantMat({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const mat = state.pendingMerchant!;
  const player = state.player!;
  const discount = player.traits.shopDiscount;
  const card = mat.cardId ? getCard(mat.cardId) : null;
  return (
    <div className="merchant-mat">
      <div className="merchant-head">
        <span className="merchant-title">🏮 Traveling Merchant</span>
        <span className="pill">💰 {player.gold}g</span>
        <button className="btn small" onClick={() => dispatch({ type: 'MERCHANT_CLOSE' })}>
          Walk away
        </button>
      </div>
      <div className="option-list">
        {mat.consumables.map((name, i) => {
          const def = CONSUMABLES[name];
          if (!def) return null;
          const price = Math.max(1, Math.ceil(def.price * 1.25 * discount));
          return (
            <div className="item-row" key={`${name}-${i}`}>
              <div className="item-desc">
                {def.emoji} {def.name} — {def.description}
              </div>
              <button className="btn small" disabled={player.gold < price} onClick={() => dispatch({ type: 'MERCHANT_BUY', what: 'consumable', index: i })}>
                {price}g
              </button>
            </div>
          );
        })}
        {mat.gear && (
          <div className="item-row">
            <div className="item-desc">
              🗡️ {mat.gear.name} <span className="pill">{mat.gear.rarity}</span>
            </div>
            <button
              className="btn small"
              disabled={player.gold < Math.ceil(mat.gear.value * 1.25 * discount)}
              onClick={() => dispatch({ type: 'MERCHANT_BUY', what: 'gear', index: 0 })}
            >
              {Math.max(1, Math.ceil(mat.gear.value * 1.25 * discount))}g
            </button>
          </div>
        )}
        {card && (
          <div className="item-row">
            <div className="item-desc">
              🃏 <b>{card.name}</b> — {card.text} <span className="pill">expedition card</span>
            </div>
            <button
              className="btn small primary"
              disabled={player.gold < Math.max(1, Math.ceil(mat.cardPrice * discount))}
              onClick={() => dispatch({ type: 'MERCHANT_BUY', what: 'card', index: 0 })}
            >
              {Math.max(1, Math.ceil(mat.cardPrice * discount))}g
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function FloorScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [showItems, setShowItems] = useState(false);
  const exp = state.expedition;
  const player = state.player;
  if (!exp || !player) return null;
  const gate = GATES[exp.gateId];
  const floor = gate.floors[exp.floorIndex];
  const mov = movFor(player);
  const threat = threatTiles(exp);
  const hostiles = exp.units.filter((u) => u.kind !== 'merchant');
  const miniboss = exp.units.find((u) => u.kind === 'miniboss');

  const usable = player.inventory.filter((name) => {
    const def = CONSUMABLES[name];
    return def && def.effect.type !== 'bait';
  });

  return (
    <div className="panel">
      <h1 className="title">
        {gate.emoji} {gate.name} — Floor {exp.floorIndex + 1}/{gate.floors.length}
      </h1>
      <p className="subtitle">{gate.description}</p>

      <div className="floor-layout">
        <div className="map-grid">
          {floor.grid.map((row, y) => (
            <div className="map-row" key={y}>
              {row.split('').map((ch, x) => {
                if (x === exp.x && y === exp.y) {
                  return (
                    <span key={x} className="map-cell player">
                      <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={36} />
                      <span className="cell-top">🧝</span>
                    </span>
                  );
                }
                const unit = unitAt(exp, x, y);
                if (unit) {
                  return (
                    <span key={x} className="map-cell floor-tile">
                      <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={36} />
                      <UnitToken unit={unit} />
                    </span>
                  );
                }
                let tile = ch;
                if (isOpened(exp, x, y) && (ch === TILE.CHEST || ch === TILE.SHRINE || ch === TILE.EVENT || ch === TILE.BOSS || ch === TILE.SECRET)) {
                  tile = TILE.FLOOR;
                }
                if (ch === TILE.BREAKABLE && isBroken(exp, x, y)) tile = TILE.FLOOR;
                // Secrets stay invisible until you're standing next to them.
                if (tile === TILE.SECRET) {
                  const adjacent = Math.abs(x - exp.x) + Math.abs(y - exp.y) === 1;
                  tile = adjacent ? tile : TILE.FLOOR;
                }
                if (tile === TILE.SECRET) {
                  return (
                    <span key={x} className="map-cell special secret" title="Something behind the stone...">
                      <TileFill gateId={exp.gateId} tile="." vx={x} vy={y} size={36} />
                      <span className="cell-top">✨</span>
                    </span>
                  );
                }
                if (tile === TILE.BOSS && state.defeatedBosses.includes(exp.gateId)) tile = TILE.FLOOR;
                if ((tile === TILE.ENEMY || tile === TILE.MINIBOSS || tile === TILE.TAMER || tile === TILE.MERCHANT) && !unit) tile = TILE.FLOOR;
                const view = TILE_VIEW[tile] ?? { emoji: '', cls: 'floor-tile' };
                const danger = tile !== TILE.WALL && threat.has(`${x},${y}`);
                return (
                  <span key={x} className={`map-cell ${view.cls}${danger ? ' threat' : ''}`} title={danger ? 'A hostile can reach this tile next turn' : undefined}>
                    <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={36} />
                    {view.emoji && <span className="cell-top">{view.emoji}</span>}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <div>
          <div className="mov-bar" title="Movement left this turn. When it runs out, the floor moves.">
            <span className="mov-label">MOV</span>
            {Array.from({ length: mov }, (_, i) => (
              <span key={i} className={`mov-pip ${i < exp.movLeft ? 'full' : 'spent'}`} />
            ))}
          </div>
          {miniboss && (
            <p className="map-warning" title={miniboss.label}>
              👑 {miniboss.label} guards the stairs.
            </p>
          )}
          <div className="dpad">
            <span />
            <button className="btn" onClick={() => dispatch({ type: 'MOVE', dir: 'north' })}>
              ⬆️
            </button>
            <span />
            <button className="btn" onClick={() => dispatch({ type: 'MOVE', dir: 'west' })}>
              ⬅️
            </button>
            <button className="btn" title="Hold your ground — end your movement turn" onClick={() => dispatch({ type: 'END_MAP_TURN' })}>
              🛡️
            </button>
            <button className="btn" onClick={() => dispatch({ type: 'MOVE', dir: 'east' })}>
              ➡️
            </button>
            <span />
            <button className="btn" onClick={() => dispatch({ type: 'MOVE', dir: 'south' })}>
              ⬇️
            </button>
            <span />
          </div>
          <div className="btn-row">
            <button className="btn small" onClick={() => setShowItems((s) => !s)} disabled={usable.length === 0}>
              🧪 Items ({usable.length})
            </button>
            <button className="btn small" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
              🎒 Gear
            </button>
            <button className="btn small" onClick={() => dispatch({ type: 'GOTO', screen: 'saveLoad' })}>
              💾 Save
            </button>
            <button className="btn small danger" onClick={() => dispatch({ type: 'LEAVE_GATE' })}>
              🏠 Leave
            </button>
          </div>
          <p className="map-legend">
            {hostiles.length} hostile{hostiles.length === 1 ? '' : 's'} on this floor · 🎁 chest · ⛲ shrine · ❓ event · 🛢️ smashable · 🕳️ stairs · 🚪 way back · 👑 stair-warden · 🏮 merchant · 💀 gate warden
          </p>
        </div>
      </div>

      {state.pendingMerchant && <MerchantMat state={state} dispatch={dispatch} />}

      {showItems && (
        <div className="option-list" style={{ marginTop: 10 }}>
          {usable.map((name, i) => (
            <div className="item-row" key={`${name}-${i}`}>
              <div className="item-desc">
                {CONSUMABLES[name].emoji} {name} — {CONSUMABLES[name].description}
              </div>
              <button
                className="btn small"
                onClick={() => dispatch({ type: 'USE_ITEM_FIELD', itemName: name, targetUid: 'hero' })}
              >
                Use on {state.player!.name}
              </button>
              {state.party.map((m) => (
                <button
                  key={m.uid}
                  className="btn small"
                  onClick={() => dispatch({ type: 'USE_ITEM_FIELD', itemName: name, targetUid: m.uid })}
                >
                  {m.nickname}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
