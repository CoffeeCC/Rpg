import { useEffect, useRef, useState } from 'react';
import { LightLayer } from './LightLayer';
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
  floorOf,
  unitAt,
  movFor,
  threatTiles,
  leavingSpots,
  pathToTile,
  reachableTiles,
  TILE,
  type FloorUnit,
} from '../engine/systems/floors';
import { MonsterImage } from '../art/MonsterImage';
import { TileFill, pickTileProp, TilePropArt } from '../art/tileArt';
import { Icon } from './Icon';
import { SPRITE_ART, TILE_TEXTURES } from '../art/iconArt';
import { LanternTurn } from './LanternTurn';
import { useNavScope, navItem, focusFirstIn } from '../nav';
import '../floor.css';

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

// v19 #6: intrinsic art sizes are the war-table sizes now (the old 34-44px
// numbers were sized for 48px cells). CSS in floor.css §1 still has the final
// word — every one of these rides calc(var(--cell) * n) — but the attributes
// have to be in the same league so the element boxes are sane pre-layout and
// so MonsterImage picks its PAINTED branch (it falls back to the procedural
// silhouette under 40px).
const ART = { unit: 72, player: 76, object: 64, prop: 64, crown: 26 } as const;

function UnitToken({ unit }: { unit: FloorUnit }) {
  if (unit.kind === 'merchant') {
    return (
      <span className="unit-token merchant" title={unit.label}>
        {SPRITE_ART.merchant ? (
          <img src={SPRITE_ART.merchant} width={ART.unit} height={ART.unit} className="ui-icon" alt="" />
        ) : (
          '🏮'
        )}
      </span>
    );
  }
  if (unit.kind === 'tamer') {
    return (
      <span className="unit-token tamer" title={`${unit.label} (Lv${unit.level})`}>
        {SPRITE_ART.tamer ? <img src={SPRITE_ART.tamer} width={ART.unit} height={ART.unit} className="ui-icon" alt="" /> : '⚔️'}
      </span>
    );
  }
  return (
    <span className={`unit-token ${unit.kind}`} title={`${unit.label} (Lv${unit.level})`}>
      {unit.speciesId && (
        <MonsterImage speciesId={unit.speciesId} size={ART.unit} rarity={unit.kind === 'miniboss' ? 'Rare' : 'Common'} />
      )}
      {unit.kind === 'miniboss' && (
        <span className="unit-crown">
          <Icon name="crown" emoji="👑" size={ART.crown} />
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
  // The mat is modal in every way that matters: while it is up, the D-pad must
  // buy things, not walk the hero around behind it. A trapping scope one layer
  // above the floor's guarantees that without the floor needing to know.
  const matRef = useRef<HTMLDivElement>(null);
  useNavScope(matRef, {
    id: 'floor.merchant',
    layer: 10,
    trap: true,
    onCancel: () => {
      dispatch({ type: 'MERCHANT_CLOSE' });
      return true;
    },
  });
  return (
    <div className="merchant-mat" ref={matRef}>
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
                <Icon name={`item_${name.toLowerCase()}`} emoji={def.emoji} size={16} /> {def.name} — {def.description}
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

const NAV_MOVE = {
  up: 'north',
  down: 'south',
  left: 'west',
  right: 'east',
} as const;

export function FloorScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [showItems, setShowItems] = useState(false);
  const merchantOpen = !!state.pendingMerchant;
  // v12: guards a click-to-move walk so overlapping clicks don't stack paths.
  const walkingRef = useRef(false);

  // PLAN5 #56: keyboard drives the floor.
  //
  // v21: the ARROW keys moved out of here and into the nav layer, which routes
  // them through the same path as the D-pad and the left stick (see the nav
  // scope below). WASD stays local and stays unconditional — it is muscle
  // memory, it can never be ambiguous with menu navigation, and keeping it
  // here means a keyboard player's movement does not depend on where focus is.
  // Everything Escape and SPACE used to do here is now the nav layer's
  // `cancel` and `confirm` — leaving them bound in both places fired
  // END_MAP_TURN twice per press, because both listeners are on `window` and
  // this one never checked `defaultPrevented`. If you add a key here, check
  // it against §1 of CONTROLLER.md first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (merchantOpen) return; // the mat's own nav scope owns input while it is up
      const dirs: Record<string, 'north' | 'south' | 'east' | 'west'> = {
        w: 'north',
        s: 'south',
        a: 'west',
        d: 'east',
      };
      const dir = dirs[e.key];
      if (dir) {
        e.preventDefault();
        dispatch({ type: 'MOVE', dir });
      } else if (e.key === 'h' || e.key === 'H') {
        e.preventDefault();
        dispatch({ type: 'END_MAP_TURN' });
      } else if (e.key === 'i' || e.key === 'I') {
        setShowItems((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispatch, merchantOpen]);

  // --- Controller / focus navigation -------------------------------------
  //
  // The map is a WIDGET: one focusable cell that swallows directions while it
  // holds the cursor, so the D-pad walks the hero instead of hopping between
  // buttons. B (or LB/RB) hands the cursor to the toolbar and back — that
  // hand-off is the only thing a pad player has to learn here.
  const panelRef = useRef<HTMLDivElement>(null);
  const topbarRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const onMap = (el: HTMLElement | null) => !el || el.hasAttribute('data-nav-widget');
  const toMap = () => {
    const el = mapRef.current;
    if (!el) return false;
    el.focus({ preventScroll: true });
    return true;
  };

  useNavScope(panelRef, {
    id: 'floor',
    onDirection: (dir, meta) => {
      // Focus on the map (or nowhere at all) means "walk". Anywhere else, the
      // default spatial focus movement is what the player wants.
      if (!onMap(meta.target)) return false;
      const move = NAV_MOVE[dir];
      if (!move) return false;
      dispatch({ type: 'MOVE', dir: move });
      return true;
    },
    onButton: (button, meta) => {
      switch (button) {
        case 'confirm':
          // A on the map holds ground — the v20 pad behaviour, preserved. On a
          // real control it falls through and presses that control.
          if (!onMap(meta.target)) return false;
          dispatch({ type: 'END_MAP_TURN' });
          return true;
        case 'alt':
          setShowItems((v) => !v);
          return true;
        case 'start':
          dispatch({ type: 'END_MAP_TURN' });
          return true;
        case 'prevTab':
        case 'nextTab':
          return onMap(meta.target) ? focusFirstIn(topbarRef.current) : toMap();
        default:
          return false;
      }
    },
    onCancel: () => {
      if (showItems) {
        setShowItems(false);
        return true;
      }
      // B toggles the cursor between the map and the toolbar.
      const active = document.activeElement as HTMLElement | null;
      return onMap(active) ? focusFirstIn(topbarRef.current) : toMap();
    },
  });

  const exp = state.expedition;
  const player = state.player;

  // Camera-follow: keep the player's tile in view as they move, since taller
  // floors scroll internally now instead of stretching past the viewport
  // (needed for tap-to-move to reach tiles that start out off-screen).
  // v15: scroll ONLY the map-grid itself — scrollIntoView walked every
  // scrollable ancestor, dragging the whole page side to side on its own.
  const playerCellRef = useRef<HTMLSpanElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current;
    const cell = playerCellRef.current;
    if (!grid || !cell) return;
    if (grid.scrollWidth <= grid.clientWidth && grid.scrollHeight <= grid.clientHeight) return;
    grid.scrollTo({
      left: cell.offsetLeft - grid.clientWidth / 2 + cell.offsetWidth / 2,
      top: cell.offsetTop - grid.clientHeight / 2 + cell.offsetHeight / 2,
      behavior: 'smooth',
    });
  }, [exp?.gateId, exp?.floorIndex, exp?.x, exp?.y]);

  if (!exp || !player) return null;

  // v18 #7: a fogged tile orthogonally adjacent to any REVEALED tile is
  // tappable — room exits sit exactly one step into the dark, and the old
  // hard fog guard made them unclickable. The path still resolves through
  // known ground; the Lantern reveals the tile the moment you arrive.
  const fogBordersKnown = (x: number, y: number) =>
    isRevealed(exp, x - 1, y) || isRevealed(exp, x + 1, y) || isRevealed(exp, x, y - 1) || isRevealed(exp, x, y + 1);

  // v12 click-to-move: click ANY reachable tile and the hero walks there,
  // one real MOVE step at a time (so pickups/stairs/enemy-phase all still fire
  // per step). Clicking a unit within reach walks up and bumps it (→ battle).
  // This replaces the old adjacent-only tap that made the map a chore.
  const handleTileTap = (x: number, y: number) => {
    if (merchantOpen || walkingRef.current) return;
    if (x === exp.x && y === exp.y) return;
    // v15 fog: you can't walk to a tile the Lantern has never revealed —
    // v18 #7: unless it borders revealed ground (see fogBordersKnown).
    if (!isRevealed(exp, x, y) && !fogBordersKnown(x, y)) return;
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
  const floor = floorOf(exp); // wild expeditions generate floors past the gate's charted ones
  const mov = movFor(player);
  const threat = threatTiles(exp);
  const leavings = leavingSpots(exp);
  const lit = litTiles(exp, lanternRadius(player));
  // v12 click-to-move: tiles you can walk to this turn, and units you can reach
  // and bump (adjacent to you or to a reachable tile).
  const reachable = reachableTiles(exp, exp.movLeft);
  const canReachUnit = (ux: number, uy: number) =>
    (Math.abs(ux - exp.x) + Math.abs(uy - exp.y) === 1) ||
    [`${ux - 1},${uy}`, `${ux + 1},${uy}`, `${ux},${uy - 1}`, `${ux},${uy + 1}`].some((k) => reachable.has(k));
  const hostiles = exp.units.filter((u) => u.kind !== 'merchant');
  const witchwicks = state.player ? state.player.inventory.filter((n) => n === 'Witchwick').length : 0;
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
  // v17: the cell size lives in CSS as --cell — v19 #6 raised the war-table
  // sizes (92px roomy desktop / 84px desktop, 48px base, 24px landscape
  // phones — see floor.css §1). The wall sampling math rides that same token
  // via calc(), so --cell stays the SINGLE source of truth and the texture
  // window stays pixel-aligned with the tiles at every breakpoint. Never
  // hard-code a tile size here again.
  const wallStyle = (x: number, y: number) =>
    tex
      ? {
          backgroundImage: `url(${tex.wall})`,
          backgroundSize: `calc(var(--cell, 48px) * ${cols}) calc(var(--cell, 48px) * ${rows})`,
          backgroundPosition: `calc(var(--cell, 48px) * ${-x}) calc(var(--cell, 48px) * ${-y})`,
        }
      : undefined;

  // v17: soft fog edges — a lit cell bordering fog gets per-side gradient
  // fringes so the darkness rolls over the terrain instead of stopping on a
  // hard grid line. Purely decorative: pointer-transparent, aria-hidden.
  const fogFringe = (x: number, y: number) => {
    const sides = [
      !isRevealed(exp, x, y - 1) && 'n',
      !isRevealed(exp, x, y + 1) && 's',
      !isRevealed(exp, x - 1, y) && 'w',
      !isRevealed(exp, x + 1, y) && 'e',
    ].filter(Boolean) as string[];
    return sides.map((s) => <span key={s} className={`fog-fringe ${s}`} aria-hidden="true" />);
  };

  return (
    <div className="panel floor-panel" ref={panelRef}>
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

      <div className="floor-layout">
        {/* v18 #10: every control lives in a compact TOP bar flush with the
            map viewport's top edge — the old side column (and its d-pad) is
            gone; click-to-move + WASD + gamepad cover movement. */}
        <div className="floor-topbar" ref={topbarRef}>
          <div className="btn-row floor-actions">
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
              disabled={witchwicks === 0}
              title={witchwicks > 0 ? `Burn a Witchwick to walk home (${witchwicks} left)` : 'No Witchwick — walk back to the door you came in by, or buy one from Maribel'}
            >
              <Icon name="door" emoji="🕯️" size={18} /> Witchwick home ({witchwicks})
            </button>
          </div>
          <div className="mov-bar" title="Movement left this turn. When it runs out, the floor moves.">
            <span className="mov-label">MOV</span>
            <span className="mov-gems">
              {Array.from({ length: mov }, (_, i) => (
                <span key={i} className={`mov-pip ${i < exp.movLeft ? 'full' : 'spent'}`} />
              ))}
            </span>
            <span className="mov-count">
              <b>{exp.movLeft}</b>/{mov}
            </span>
          </div>
          {miniboss && (
            <p className="map-warning" title={miniboss.label}>
              <Icon name="crown" emoji="👑" size={16} /> {miniboss.label} guards the stairs.
            </p>
          )}
        </div>

        {/* The war table is one nav cell: focused, it eats the D-pad and walks
            the hero (see the nav scope above). It announces as a group, not a
            button — pressing A on it holds ground, it does not "activate". */}
        <div
          className="map-frame"
          ref={mapRef}
          {...navItem({
            widget: true,
            initial: true,
            role: 'group',
            key: 'floor-map',
            label: 'Expedition map — arrows or D-pad to walk, A to hold ground, B for the toolbar',
          })}
        >
          <i className="map-corner tl" aria-hidden="true" />
          <i className="map-corner tr" aria-hidden="true" />
          <i className="map-corner bl" aria-hidden="true" />
          <i className="map-corner br" aria-hidden="true" />
          <div
            className={`map-grid ${tex ? 'textured' : ''}`}
            ref={gridRef}
            style={tex ? { backgroundImage: `url(${tex.ground})`, backgroundSize: 'cover' } : undefined}
          >
            {floor.grid.map((row, y) => (
              <div className="map-row" key={y}>
                {row.split('').map((ch, x) => {
                  // v15 fog of war: tiles the Lantern has never revealed are
                  // darkness — no icons, no units, no hints. v18 #7: fog that
                  // borders revealed ground takes clicks (room exits), with a
                  // hover affordance but no content — the dark stays dark.
                  if (!isRevealed(exp, x, y)) {
                    const tappable = fogBordersKnown(x, y);
                    return (
                      <span
                        key={x}
                        className={`map-cell fog${tappable ? ' fog-tappable' : ''}`}
                        aria-hidden={tappable ? undefined : 'true'}
                        title={tappable ? 'Step into the dark' : undefined}
                        onClick={tappable ? () => handleTileTap(x, y) : undefined}
                      />
                    );
                  }
                  if (x === exp.x && y === exp.y) {
                    return (
                      <span key={x} ref={playerCellRef} className="map-cell player hero-here">
                        {!tex && <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={96} />}
                        {fogFringe(x, y)}
                        <span className="hero-ring" aria-hidden="true" />
                        <span className="cell-top">
                          {SPRITE_ART.player ? (
                            <img src={SPRITE_ART.player} width={ART.player} height={ART.player} className="ui-icon" alt="" />
                          ) : (
                            '🧝'
                          )}
                        </span>
                      </span>
                    );
                  }
                  // v18 #8: units render on any REVEALED tile — v16 hid them
                  // outside the CURRENT light and Paul lost all threat read.
                  // Light still matters: a unit standing beyond the lantern's
                  // reach draws dimmed + desaturated (.unit-unlit) instead of
                  // vanishing. Never-revealed fog still hides everything.
                  const unit = unitAt(exp, x, y);
                  if (unit) {
                    const litHere = lit.has(`${x},${y}`);
                    const engage = unit.kind !== 'merchant' && canReachUnit(x, y);
                    const reach = unit.kind === 'merchant' && canReachUnit(x, y);
                    return (
                      <span
                        key={x}
                        className={`map-cell floor-tile unit-cell ${engage ? 'engageable' : ''} ${reach ? 'reachable-unit' : ''}${litHere ? '' : ' unit-unlit'}`}
                        title={engage ? `${unit.label} — click to engage` : unit.label}
                        onClick={() => handleTileTap(x, y)}
                      >
                        {!tex && <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={96} />}
                        {fogFringe(x, y)}
                        <UnitToken unit={unit} />
                      </span>
                    );
                  }
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
                        {!tex && <TileFill gateId={exp.gateId} tile="." vx={x} vy={y} size={96} />}
                        {fogFringe(x, y)}
                        <span className="cell-top">
                          <Icon name="secret" emoji="✨" size={ART.object} />
                        </span>
                      </span>
                    );
                  }
                  if (tile === TILE.BOSS && state.defeatedBosses.includes(exp.gateId)) tile = TILE.FLOOR;
                  if ((tile === TILE.ENEMY || tile === TILE.MINIBOSS || tile === TILE.TAMER || tile === TILE.MERCHANT) && !unit) tile = TILE.FLOOR;
                  const view = TILE_VIEW[tile] ?? { emoji: '', cls: 'floor-tile' };
                  // Threat is live tactical read (where a hostile could step
                  // next turn). v18 #8: shown on any REVEALED tile — gating it
                  // to the current light hid the exact warning it exists for.
                  const danger = tile !== TILE.WALL && threat.has(`${x},${y}`);
                  const prop = tile === TILE.FLOOR ? pickTileProp(x, y, exp.gateId) : null;
                  // A leaving sits on ordinary floor and is marked rather than
                  // tiled, because it is a thing lying there, not a feature of
                  // the room. Once read it stops being marked — the paragraph
                  // is the reward and there is nothing to come back for.
                  const hasLeaving = tile === TILE.FLOOR && leavings.has(`${x},${y}`) && !isOpened(exp, x, y);
                  return (
                    <span
                      key={x}
                      className={`map-cell ${view.cls}${danger ? ' threat' : ''}${isReachable ? ' reachable' : ''}`}
                      style={ch === '#' ? wallStyle(x, y) : undefined}
                      title={danger ? 'A hostile can reach this tile next turn' : isReachable ? 'Click to move here' : undefined}
                      onClick={() => handleTileTap(x, y)}
                    >
                      {!tex && <TileFill gateId={exp.gateId} tile={ch} vx={x} vy={y} size={96} />}
                      {fogFringe(x, y)}
                      {view.emoji && (
                        <span className="cell-top">
                          <Icon name={view.icon} emoji={view.emoji} size={ART.object} />
                        </span>
                      )}
                      {hasLeaving && (
                        <span className="cell-top leaving-mark" title="Somebody was here">
                          <Icon name="event_abandonedCamp" emoji="🎒" size={ART.prop} />
                        </span>
                      )}
                      {/* v19 #5: decorative ground clutter only — TilePropArt
                          owns the whole rotation, and nothing in it may share a
                          silhouette with an interactive tile above. */}
                      {prop && (
                        <span className="cell-top tile-prop" aria-hidden="true">
                          <TilePropArt prop={prop} size={ART.prop} />
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            ))}
          </div>
          {/* The Last Lantern, computed. The hero carries the only light down
              here, so this is the screen the engine was actually worth writing
              for: the walls around them are the occluders, and the shadows are
              cast from the real grid rather than painted per cell.

              `version` is the hero's position — the source MOVES on this
              screen, which is the one thing the layer cannot observe for
              itself (a walking hero is a class change on a different cell, not
              a DOM mutation). No `lamp`: the hero token IS the lantern here,
              and §5 of lighting.css already draws it. */}
          <LightLayer
            occluderSelector=".map-grid .map-cell.wall"
            anchorSelector=".map-grid .map-cell.player"
            reach={430}
            intensity={0.72}
            flameSize={22}
            ambient={0.18}
            version={`${exp.gateId}:${exp.floorIndex}:${exp.x},${exp.y}`}
          />
        </div>

        {/* v18 #10: legend chips dock along the map viewport's BOTTOM edge. */}
        <div className="map-legend legend-chips">
          <span className="legend-chip threat-chip">
            ⚔️ {hostiles.length} hostile{hostiles.length === 1 ? '' : 's'} on this floor
          </span>
          <span className="legend-chip">
            <Icon name="chest" emoji="🎁" size={16} /> chest
          </span>
          <span className="legend-chip">
            <Icon name="shrine" emoji="⛲" size={16} /> shrine
          </span>
          <span className="legend-chip">
            <Icon name="event_abandonedCamp" emoji="🎒" size={16} /> a leaving
          </span>
          <span className="legend-chip">
            <Icon name="event" emoji="❓" size={16} /> event
          </span>
          <span className="legend-chip">
            <Icon name="barrel" emoji="🛢️" size={16} /> smashable
          </span>
          <span className="legend-chip">
            <Icon name="stairs" emoji="🕳️" size={16} /> stairs
          </span>
          <span className="legend-chip">
            <Icon name="door" emoji="🚪" size={16} /> way back
          </span>
          <span className="legend-chip">
            <Icon name="crown" emoji="👑" size={16} /> stair-warden
          </span>
          <span className="legend-chip">
            <Icon name="merchant" emoji="🏮" size={16} /> merchant
          </span>
          <span className="legend-chip">
            <Icon name="boss" emoji="💀" size={16} /> gate warden
          </span>
        </div>
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
                <Icon name={`item_${name.toLowerCase()}`} emoji={CONSUMABLES[name].emoji} size={16} /> {name} — {CONSUMABLES[name].description}
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
