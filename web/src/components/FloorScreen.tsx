import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { GATES } from '../engine/data/gates';
import { CONSUMABLES } from '../engine/data/items';
import { getCard } from '../engine/data/cards';
import {
  isOpened,
  isBroken,
  isRevealed,
  litTiles,
  lanternRadius,
  unitAt,
  movFor,
  threatTiles,
  pathToTile,
  reachableTiles,
  TILE,
  type FloorUnit,
} from '../engine/systems/floors';
import { MonsterImage } from '../art/MonsterImage';
import { TileFill, pickTileProp } from '../art/tileArt';
import { Icon } from './Icon';
import { SPRITE_ART, TILE_TEXTURES } from '../art/iconArt';
import { LanternTurn } from './LanternTurn';

// v15: bumped up from 48 — the map felt small and cramped. v17: bumped again
// from 60 now that the controls column no longer eats the row's width (see
// .floor-body in App.css) — the map gets to actually use the freed space
// instead of just sitting next to a mostly-empty sidebar. Single source of
// truth so the background-texture math and tile art stay in sync with the
// CSS .map-cell size (App.css).
const TILE_SIZE = 72;

const TILE_VIEW: Record<string, { emoji: string; icon: string; cls: string }> = {
  [TILE.WALL]: { emoji: '', icon: '', cls: 'wall' },
  [TILE.FLOOR]: { emoji: '', icon: '', cls: 'floor-tile' },
  [TILE.START]: { emoji: '🚪', icon: 'door', cls: 'special stairs' },
  [TILE.STAIRS]: { emoji: '🕳️', icon: 'stairs', cls: 'special stairs' },
  [TILE.BOSS]: { emoji: '💀', icon: 'boss', cls: 'special boss' },
  [TILE.MINIBOSS]: { emoji: '', icon: '', cls: 'floor-tile' },
  [TILE.ENEMY]: { emoji: '', icon: '', cls: 'floor-tile' },
  [TILE.TAMER]: { emoji: '', icon: '', cls: 'floor-tile' },
  [TILE.MERCHANT]: { emoji: '', icon: '', cls: 'floor-tile' },
  [TILE.BREAKABLE]: { emoji: '🛢️', icon: 'barrel', cls: 'special breakable' },
  [TILE.CHEST]: { emoji: '🎁', icon: 'chest', cls: 'special chest' },
  [TILE.SHRINE]: { emoji: '⛲', icon: 'shrine', cls: 'special shrine' },
  [TILE.EVENT]: { emoji: '❓', icon: 'event', cls: 'special event-tile' },
  [TILE.SECRET]: { emoji: '', icon: '', cls: 'floor-tile' },
};

function UnitToken({ unit }: { unit: FloorUnit }) {
  if (unit.kind === 'merchant') {
    return (
      <span className="unit-token merchant" title={unit.label}>
        {SPRITE_ART.merchant ? <img src={SPRITE_ART.merchant} width={40} height={40} className="ui-icon" alt="" /> : '🏮'}
      </span>
    );
  }
  if (unit.kind === 'tamer') {
    return (
      <span className="unit-token tamer" title={`${unit.label} (Lv${unit.level})`}>
        {SPRITE_ART.tamer ? <img src={SPRITE_ART.tamer} width={40} height={40} className="ui-icon" alt="" /> : '⚔️'}
      </span>
    );
  }
  return (
    <span className={`unit-token ${unit.kind}`} title={`${unit.label} (Lv${unit.level})`}>
      {unit.speciesId && <MonsterImage speciesId={unit.speciesId} size={44} rarity={unit.kind === 'miniboss' ? 'Rare' : 'Common'} />}
      {unit.kind === 'miniboss' && (
        <span className="unit-crown">
          <Icon name="crown" emoji="👑" size={20} />
        </span>
      )}
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
        <span className="merchant-title">
          <Icon name="merchant" emoji="🏮" size={18} /> Traveling Merchant
        </span>
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
  const merchantOpen = !!state.pendingMerchant;
  // v12: guards a click-to-move walk so overlapping clicks don't stack paths.
  const walkingRef = useRef(false);

  // PLAN5 #56: keyboard drives the floor.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (merchantOpen) {
        if (e.key === 'Escape') dispatch({ type: 'MERCHANT_CLOSE' });
        return;
      }
      const dirs: Record<string, 'north' | 'south' | 'east' | 'west'> = {
        ArrowUp: 'north',
        ArrowDown: 'south',
        ArrowLeft: 'west',
        ArrowRight: 'east',
        w: 'north',
        s: 'south',
        a: 'west',
        d: 'east',
      };
      const dir = dirs[e.key];
      if (dir) {
        e.preventDefault();
        dispatch({ type: 'MOVE', dir });
      } else if (e.key === ' ' || e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        dispatch({ type: 'END_MAP_TURN' });
      } else if (e.key === 'i' || e.key === 'I') {
        setShowItems((v) => !v);
      } else if (e.key === 'Escape') {
        setShowItems(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, merchantOpen]);

  // Gamepad: dpad moves, A holds ground.
  const padPrev = useRef<boolean[]>([]);
  useEffect(() => {
    let raf = 0;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pad = navigator.getGamepads?.()[0];
      if (!pad) return;
      const pressed = pad.buttons.map((b) => b.pressed);
      const was = padPrev.current;
      const edge = (i: number) => pressed[i] && !was[i];
      if (edge(12)) dispatch({ type: 'MOVE', dir: 'north' });
      if (edge(13)) dispatch({ type: 'MOVE', dir: 'south' });
      if (edge(14)) dispatch({ type: 'MOVE', dir: 'west' });
      if (edge(15)) dispatch({ type: 'MOVE', dir: 'east' });
      if (edge(0)) dispatch({ type: 'END_MAP_TURN' });
      padPrev.current = pressed;
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [dispatch]);
  const exp = state.expedition;
  const player = state.player;

  // Camera-follow: keep the player's tile in view as they move, since taller
  // floors scroll internally now instead of stretching past the viewport
  // (needed for tap-to-move to reach tiles that start out off-screen).
  const playerCellRef = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    playerCellRef.current?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
  }, [exp?.gateId, exp?.floorIndex, exp?.x, exp?.y]);

  if (!exp || !player) return null;

  // v12 click-to-move: click ANY reachable tile and the hero walks there,
  // one real MOVE step at a time (so pickups/stairs/enemy-phase all still fire
  // per step). Clicking a unit within reach walks up and bumps it (→ battle).
  // This replaces the old adjacent-only tap that made the map a chore.
  const handleTileTap = (x: number, y: number) => {
    if (merchantOpen || walkingRef.current) return;
    if (x === exp.x && y === exp.y) return;
    const path = pathToTile(exp, x, y, exp.movLeft);
    if (!path || path.length === 0) return;
    walkingRef.current = true;
    path.forEach((dir, i) => {
      window.setTimeout(() => {
        dispatch({ type: 'MOVE', dir });
        if (i === path.length - 1) walkingRef.current = false;
      }, i * 95);
    });
  };
  const gate = GATES[exp.gateId];
  const floor = gate.floors[exp.floorIndex];
  const mov = movFor(player);
  const threat = threatTiles(exp);
  const lit = litTiles(exp, lanternRadius(player));
  // v12 click-to-move: tiles you can walk to this turn, and units you can reach
  // and bump (adjacent to you or to a reachable tile).
  const reachable = reachableTiles(exp, exp.movLeft);
  const canReachUnit = (ux: number, uy: number) =>
    (Math.abs(ux - exp.x) + Math.abs(uy - exp.y) === 1) ||
    [`${ux - 1},${uy}`, `${ux + 1},${uy}`, `${ux},${uy - 1}`, `${ux},${uy + 1}`].some((k) => reachable.has(k));
  const hostiles = exp.units.filter((u) => u.kind !== 'merchant');
  const waybrands = state.player ? state.player.inventory.filter((n) => n === 'Waybrand').length : 0;
  const miniboss = exp.units.find((u) => u.kind === 'miniboss');

  const usable = player.inventory.filter((name) => {
    const def = CONSUMABLES[name];
    return def && def.effect.type !== 'bait';
  });

  // v8.1: one continuous painted terrain texture per gate — cells sample it
  // by position, so the "tiles" genuinely flow together with zero seams.
  const tex = TILE_TEXTURES[exp.gateId];
  const cols = Math.max(...floor.grid.map((r) => r.length));
  const rows = floor.grid.length;
  const wallStyle = (x: number, y: number) =>
    tex
      ? {
          backgroundImage: `url(${tex.wall})`,
          backgroundSize: `${cols * TILE_SIZE}px ${rows * TILE_SIZE}px`,
          backgroundPosition: `${-x * TILE_SIZE}px ${-y * TILE_SIZE}px`,
        }
      : undefined;

  return (
    <div className="panel">
      <h1 className="title">
        {exp.wild ? (
          <>🌫️ Unmapped Wilds, beyond the {gate.name} — Depth {exp.floorIndex + 1}</>
        ) : (
          <>
            <Icon name={`gate_${exp.gateId}`} emoji={gate.emoji} size={26} /> {gate.name} — Floor {exp.floorIndex + 1}/{gate.floors.length}
          </>
        )}
      </h1>
      <p className="subtitle">{exp.wild ? 'No cartographer has charted this. Only the Lantern knows what\'s here.' : gate.description}</p>

      <div className="floor-body">
        <div className="floor-status">
          <div className="mov-bar" title="Movement left this turn. When it runs out, the floor moves.">
            <span className="mov-label">MOV</span>
            {Array.from({ length: mov }, (_, i) => (
              <span key={i} className={`mov-pip ${i < exp.movLeft ? 'full' : 'spent'}`} />
            ))}
          </div>
          {miniboss && (
            <p className="map-warning" title={miniboss.label}>
              <Icon name="crown" emoji="👑" size={16} /> {miniboss.label} guards the stairs.
            </p>
          )}
        </div>

        <div className="map-grid" style={tex ? { backgroundImage: `url(${tex.ground})`, backgroundSize: 'cover' } : undefined}>
          {floor.grid.map((row, y) => (
            <div className="map-row" key={y}>
              {row.split('').map((ch, x) => {
                if (x === exp.x && y === exp.y) {
                  return (
                    <span key={x} ref={playerCellRef} className="map-cell player hero-here">
                      {!tex && <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={TILE_SIZE} />}
                      <span className="hero-ring" aria-hidden="true" />
                      <span className="cell-top">
                        {SPRITE_ART.player ? <img src={SPRITE_ART.player} width={Math.round(TILE_SIZE * 0.875)} height={Math.round(TILE_SIZE * 0.875)} className="ui-icon" alt="" /> : '🧝'}
                      </span>
                    </span>
                  );
                }
                const isLit = lit.has(`${x},${y}`);
                // v16: the Lantern doesn't give away what's standing in the
                // dark. A hidden unit still blocks/bumps into normally (see
                // pathToTile) — only the visual is withheld — and once
                // withheld it falls through to the plain-tile branch below,
                // which already renders 'e'/'M'/'t'/'m' as blank floor
                // whenever there's no *shown* unit, so no extra branch needed.
                const unit = unitAt(exp, x, y);
                if (unit && isLit) {
                  const engage = unit.kind !== 'merchant' && canReachUnit(x, y);
                  const reach = unit.kind === 'merchant' && canReachUnit(x, y);
                  return (
                    <span
                      key={x}
                      className={`map-cell floor-tile unit-cell ${engage ? 'engageable' : ''} ${reach ? 'reachable-unit' : ''}`}
                      title={engage ? `${unit.label} — click to engage` : unit.label}
                      onClick={() => handleTileTap(x, y)}
                    >
                      {!tex && <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={TILE_SIZE} />}
                      <UnitToken unit={unit} />
                    </span>
                  );
                }
                const fogCls = isLit ? '' : isRevealed(exp, x, y) ? ' fog-seen' : ' fog-unseen';
                const isReachable = reachable.has(`${x},${y}`);
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
                    <span key={x} className="map-cell special secret" title="Something behind the stone..." onClick={() => handleTileTap(x, y)}>
                      {!tex && <TileFill gateId={exp.gateId} tile="." vx={x} vy={y} size={TILE_SIZE} />}
                      <span className="cell-top">
                        <Icon name="secret" emoji="✨" size={Math.round(TILE_SIZE * 0.708)} />
                      </span>
                    </span>
                  );
                }
                if (tile === TILE.BOSS && state.defeatedBosses.includes(exp.gateId)) tile = TILE.FLOOR;
                if ((tile === TILE.ENEMY || tile === TILE.MINIBOSS || tile === TILE.TAMER || tile === TILE.MERCHANT) && !unit) tile = TILE.FLOOR;
                const view = TILE_VIEW[tile] ?? { emoji: '', cls: 'floor-tile' };
                // Threat is live tactical read (where a hostile could step next turn) —
                // withhold it in the dark same as everything else, not just the sprite.
                const danger = isLit && tile !== TILE.WALL && threat.has(`${x},${y}`);
                const prop = tile === TILE.FLOOR ? pickTileProp(x, y) : null;
                return (
                  <span
                    key={x}
                    className={`map-cell ${view.cls}${danger ? ' threat' : ''}${isReachable ? ' reachable' : ''}${fogCls}`}
                    style={ch === '#' ? wallStyle(x, y) : undefined}
                    title={danger ? 'A hostile can reach this tile next turn' : isReachable ? 'Click to move here' : undefined}
                    onClick={() => handleTileTap(x, y)}
                  >
                    {!tex && <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={TILE_SIZE} />}
                    {view.emoji && (
                      <span className="cell-top">
                        <Icon name={view.icon} emoji={view.emoji} size={Math.round(TILE_SIZE * 0.708)} />
                      </span>
                    )}
                    {prop && (
                      <span className="cell-top tile-prop">
                        <Icon name={prop} emoji="" size={Math.round(TILE_SIZE * 0.92)} />
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </div>

        <div className="floor-actions">
          <div className="btn-row">
            <button className="btn small" onClick={() => setShowItems((s) => !s)} disabled={usable.length === 0}>
              <Icon name="itemshop" emoji="🧪" size={18} /> Items ({usable.length})
            </button>
            <button className="btn small" onClick={() => dispatch({ type: 'GOTO', screen: 'equipment' })}>
              <Icon name="equipment" emoji="🎒" size={18} /> Gear
            </button>
            <button className="btn small" onClick={() => dispatch({ type: 'GOTO', screen: 'saveLoad' })}>
              <Icon name="save" emoji="💾" size={18} /> Save
            </button>
            <button
              className="btn small danger"
              onClick={() => dispatch({ type: 'LEAVE_GATE' })}
              disabled={waybrands === 0}
              title={waybrands > 0 ? `Burn a Waybrand to walk home (${waybrands} left)` : 'No Waybrand — walk back to the door you came in by, or buy one from Maribel'}
            >
              <Icon name="door" emoji="🏮" size={18} /> Waybrand home ({waybrands})
            </button>
          </div>
        </div>

        <p className="map-legend">
          {hostiles.length} hostile{hostiles.length === 1 ? '' : 's'} on this floor ·{' '}
          <Icon name="chest" emoji="🎁" size={14} /> chest · <Icon name="shrine" emoji="⛲" size={14} /> shrine ·{' '}
          <Icon name="event" emoji="❓" size={14} /> event · <Icon name="barrel" emoji="🛢️" size={14} /> smashable ·{' '}
          <Icon name="stairs" emoji="🕳️" size={14} /> stairs · <Icon name="door" emoji="🚪" size={14} /> way back ·{' '}
          <Icon name="crown" emoji="👑" size={14} /> stair-warden · <Icon name="merchant" emoji="🏮" size={14} /> merchant ·{' '}
          <Icon name="boss" emoji="💀" size={14} /> gate warden
        </p>
      </div>

      <div className="floor-lantern-turn">
        <LanternTurn yours onEndTurn={() => dispatch({ type: 'END_MAP_TURN' })} />
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
