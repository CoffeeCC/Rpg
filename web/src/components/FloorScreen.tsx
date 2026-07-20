import { useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { CONSUMABLES } from '../engine/data/items';
import { isOpened, TILE } from '../engine/systems/floors';

const TILE_VIEW: Record<string, { emoji: string; cls: string }> = {
  [TILE.WALL]: { emoji: '', cls: 'wall' },
  [TILE.FLOOR]: { emoji: '', cls: 'floor-tile' },
  [TILE.START]: { emoji: '', cls: 'floor-tile' },
  [TILE.STAIRS]: { emoji: '🕳️', cls: 'special stairs' },
  [TILE.BOSS]: { emoji: '💀', cls: 'special boss' },
  [TILE.CHEST]: { emoji: '🎁', cls: 'special chest' },
  [TILE.SHRINE]: { emoji: '⛲', cls: 'special shrine' },
  [TILE.EVENT]: { emoji: '❓', cls: 'special event-tile' },
};

export function FloorScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [showItems, setShowItems] = useState(false);
  const exp = state.expedition;
  const player = state.player;
  if (!exp || !player) return null;
  const gate = GATES[exp.gateId];
  const floor = gate.floors[exp.floorIndex];

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
                      🧝
                    </span>
                  );
                }
                let tile = ch;
                if (isOpened(exp, x, y) && (ch === TILE.CHEST || ch === TILE.SHRINE || ch === TILE.EVENT || ch === TILE.BOSS)) {
                  tile = TILE.FLOOR;
                }
                if (tile === TILE.BOSS && state.defeatedBosses.includes(exp.gateId)) tile = TILE.FLOOR;
                const view = TILE_VIEW[tile] ?? { emoji: tile, cls: 'floor-tile' };
                return (
                  <span key={x} className={`map-cell ${view.cls}`}>
                    {view.emoji}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <div>
          <div className="dpad">
            <span />
            <button className="btn" onClick={() => dispatch({ type: 'MOVE', dir: 'north' })}>
              ⬆️
            </button>
            <span />
            <button className="btn" onClick={() => dispatch({ type: 'MOVE', dir: 'west' })}>
              ⬅️
            </button>
            <span />
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
            🎁 chest · ⛲ shrine · ❓ event · 🕳️ stairs · 💀 warden
          </p>
        </div>
      </div>

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
