import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import type { CardDef, CardInstance, FxEvent, Intent } from '../engine/types';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { getCard } from '../engine/data/cards';
import { CONSUMABLES } from '../engine/data/items';
import { CARD_ART } from '../art/cardArt';
import { MonsterImage, HeroImage } from '../art/MonsterImage';
import { ELEMENT_ICON } from '../art/elementIcons';
import { familyWeakness } from '../engine/data/species';
import { BattleBackdrop, CardBack } from '../art/backdrops';
import { PAINTED_BACKDROPS } from '../art/painted';
import { CLASS_LINE_STYLE, buildTargetLinePath, raceCursor } from '../art/classCursors';
import { ImpactEffect, type ImpactKind } from '../art/impactFx';
import { CardView } from './CardView';
import { LanternTurn } from './LanternTurn';
import { LogPanel } from './LogPanel';
import { Icon } from './Icon';
import { play as sfx, type SfxName } from '../platform/sfx';

interface Popup {
  id: number;
  targetUid: string;
  text: string;
  kind: 'damage' | 'crit' | 'heal' | 'block' | 'status';
}

interface Ghost {
  id: number;
  card: CardDef;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

let popupSeq = 0;
let ghostSeq = 0;
const IMPACT_KINDS = new Set(['slash', 'pierce', 'fire', 'frost', 'bolt', 'dark', 'holy', 'hit']);

type PileId = 'draw' | 'discard' | 'exhaust';

const PILE_LABEL: Record<PileId, string> = { draw: 'Deck', discard: 'Embers', exhaust: 'Ashes' };

function intentView(intent: Intent | undefined): { icon: string; label: string; title: string; move?: string } {
  // v11: kit moves carry a telegraph name ("The Bell Tolls") shown under the number.
  const move = intent?.label;
  if (!intent) return { icon: '…', label: '', title: 'Unknown' };
  switch (intent.kind) {
    case 'attack': {
      const heavy = intent.drain ? '🩸' : '⚔️';
      return {
        icon: heavy,
        label: intent.times && intent.times > 1 ? `${intent.amount}×${intent.times}` : `${intent.amount}`,
        title: move ? `${move} — incoming attack${intent.drain ? ' that feeds on the wound' : ''}` : 'Intends to attack',
        move,
      };
    }
    case 'defend':
      return { icon: '🛡️', label: `${intent.amount ?? ''}`, title: move ? `${move} — it will ward itself` : 'Intends to ward itself', move };
    case 'heal':
      return { icon: '✚', label: `${intent.amount ?? ''}`, title: 'Intends to heal', move };
    case 'buff':
    case 'howl':
      return { icon: '↑', label: '', title: move ? `${move} — gathering strength` : 'Gathering strength', move };
    case 'debuff':
      return { icon: '↓', label: '', title: move ? `${move} — it means to weaken you` : 'Intends to weaken you', move };
  }
}

function fxSound(fx: FxEvent): SfxName | null {
  switch (fx.fx) {
    case 'slash':
    case 'pierce':
    case 'fire':
    case 'frost':
    case 'bolt':
    case 'dark':
    case 'holy':
      return fx.fx;
    case 'hit':
      return fx.targetUid === 'hero' ? 'hurt' : 'hit';
    case 'block':
      return 'block';
    case 'heal':
      return 'heal';
    case 'ko':
      return 'ko';
    case 'tameTry':
      return fx.success ? 'tameSuccess' : 'tameFail';
    case 'status':
    case 'shake':
    case 'actor':
      return null;
  }
}

export function BattleScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [targetIdx, setTargetIdx] = useState(0);
  const [showItems, setShowItems] = useState(false);
  const [pileView, setPileView] = useState<PileId | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flashing, setFlashing] = useState<Record<string, string>>({});
  const [impactFx, setImpactFx] = useState<Record<string, ImpactKind>>({});
  const [shaking, setShaking] = useState(false);
  const [locked, setLocked] = useState(false);
  // v15 readability: whose action is resolving right now (banner + figure glow).
  const [actorBanner, setActorBanner] = useState<{ name: string; label: string; side: 'ally' | 'enemy' } | null>(null);
  const [actingUid, setActingUid] = useState<string | null>(null);
  // v18: pre-attack telegraph — whoever the CURRENT actor's next effect will
  // land on gets a highlight ring for the beat between banner and impact.
  const [preTargetUid, setPreTargetUid] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredEnemyUid, setHoveredEnemyUid] = useState<string | null>(null);
  // Retro-RPG encounter transition (flash + iris wipe) — BattleScreen mounts fresh
  // each time a fight starts, so a mount-only effect fires exactly once per encounter.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 700);
    return () => clearTimeout(t);
  }, []);
  const processedFx = useRef<FxEvent[] | null>(null);
  const enemyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);

  const player = state.player;
  const battle = state.battle;

  const livingEnemies = useMemo(() => (battle ? battle.enemies.filter((e) => e.isAlive()) : []), [battle]);

  const selectedCard: CardDef | null = useMemo(() => {
    if (!battle || selectedIdx === null) return null;
    const inst = battle.hand[selectedIdx];
    return inst ? getCard(inst.cardId) ?? null : null;
  }, [battle, selectedIdx]);

  const needsTarget = selectedCard?.target === 'enemy';
  // v11: self-heal cards can be aimed at a wounded party monster instead.
  const allyAimable = !!selectedCard && selectedCard.target === 'self' && selectedCard.effects.some((e) => e.kind === 'heal');
  // The hand card's damage number updates live to the actual (elemental-adjusted)
  // amount once you're aiming at a specific enemy, rather than always showing
  // the untargeted base value — only while hoveredEnemyUid is live, not just selected.
  const previewTarget = needsTarget && hoveredEnemyUid ? livingEnemies.find((e) => e.uid === hoveredEnemyUid) : undefined;

  // --- FX consumption: STAGGERED playback so the fight reads sequentially ---
  useEffect(() => {
    if (!state.lastFx.length || processedFx.current === state.lastFx) return;
    processedFx.current = state.lastFx;
    const fxList = state.lastFx;
    // v18 pacing: v15's ~½s beats still read as a blur in live play. Beats now
    // clamp to 500–800ms — a normal round runs at the full 800ms a beat, and
    // only very long rounds compress toward the 500ms floor (~12s budget).
    const step = Math.min(800, Math.max(500, 12000 / fxList.length));
    // The +900 tail lets the last actor banner HOLD on screen instead of
    // vanishing the instant its final number lands.
    const total = fxList.length * step + 900;
    setLocked(true);
    const timers: ReturnType<typeof setTimeout>[] = [];

    fxList.forEach((fx, i) => {
      timers.push(
        setTimeout(() => {
          if (fx.fx === 'actor') {
            // Banner whose turn this is; the figure lights up with it.
            const name =
              fx.uid === 'hero'
                ? state.player?.name ?? 'You'
                : state.party.find((m) => m.uid === fx.uid)?.nickname ??
                  state.battle?.enemies.find((e) => e.uid === fx.uid)?.displayName() ??
                  '';
            setActorBanner({ name, label: fx.label, side: fx.side });
            setActingUid(fx.uid);
            // v18 pre-attack beat: ring the unit the NEXT effect will land on,
            // so "what's about to happen" reads before the number does. Pure
            // presentation — derived from the fx order the engine already emits.
            const upcoming = fxList.slice(i + 1).find((f) => f.fx !== 'actor' && f.fx !== 'shake');
            setPreTargetUid(upcoming && 'targetUid' in upcoming ? upcoming.targetUid : null);
            return;
          }
          const sound = fxSound(fx);
          if (sound) sfx(sound);
          if (fx.fx === 'shake') {
            setShaking(true);
            setTimeout(() => setShaking(false), 400);
            return;
          }
          // The telegraph ring comes off the moment its promised hit lands.
          if ('targetUid' in fx) setPreTargetUid((cur) => (cur === fx.targetUid ? null : cur));
          let popup: Popup | null = null;
          if (fx.fx === 'status') popup = { id: ++popupSeq, targetUid: fx.targetUid, text: fx.label, kind: 'status' };
          else if (fx.fx === 'tameTry')
            popup = { id: ++popupSeq, targetUid: fx.targetUid, text: fx.success ? 'TAMED' : 'refused', kind: fx.success ? 'heal' : 'status' };
          else if (fx.fx === 'block') popup = { id: ++popupSeq, targetUid: fx.targetUid, text: `+${fx.amount}`, kind: 'block' };
          else if (fx.fx === 'heal') popup = { id: ++popupSeq, targetUid: fx.targetUid, text: `+${fx.amount}`, kind: 'heal' };
          else if (fx.fx !== 'ko')
            popup = { id: ++popupSeq, targetUid: fx.targetUid, text: `${fx.amount ?? ''}${fx.crit ? '!' : ''}`, kind: fx.crit ? 'crit' : 'damage' };
          if (popup) {
            const p = popup;
            setPopups((prev) => [...prev, p]);
            setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== p.id)), 1250);
          }
          const flashClass = fx.fx === 'ko' ? 'flash-ko' : fx.fx === 'status' ? '' : `flash-${fx.fx}`;
          if (flashClass) {
            setFlashing((prev) => ({ ...prev, [fx.targetUid]: flashClass }));
            setTimeout(() => setFlashing((prev) => {
              const next = { ...prev };
              delete next[fx.targetUid];
              return next;
            }), 360);
          }
          if (IMPACT_KINDS.has(fx.fx)) {
            const kind = fx.fx as ImpactKind;
            setImpactFx((prev) => ({ ...prev, [fx.targetUid]: kind }));
            setTimeout(() => setImpactFx((prev) => {
              const next = { ...prev };
              if (next[fx.targetUid] === kind) delete next[fx.targetUid];
              return next;
            }), 450);
          }
        }, i * step)
      );
    });

    timers.push(
      setTimeout(() => {
        setLocked(false);
        setActorBanner(null);
        setActingUid(null);
        setPreTargetUid(null);
      }, total)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names resolve from the same dispatch that produced the fx
  }, [state.lastFx]);

  useEffect(() => {
    if (targetIdx >= livingEnemies.length) setTargetIdx(Math.max(0, livingEnemies.length - 1));
  }, [livingEnemies.length, targetIdx]);

  const flyGhost = useCallback((handIdx: number, card: CardDef, enemyUid?: string) => {
    const fromEl = slotRefs.current.get(handIdx);
    const stage = stageRef.current;
    if (!fromEl || !stage) return;
    const stageRect = stage.getBoundingClientRect();
    const fromRect = fromEl.getBoundingClientRect();
    const toEl = enemyUid ? enemyRefs.current.get(enemyUid) : null;
    const toRect = toEl ? toEl.getBoundingClientRect() : stageRect;
    const ghost: Ghost = {
      id: ++ghostSeq,
      card,
      from: { x: fromRect.left - stageRect.left + fromRect.width / 2, y: fromRect.top - stageRect.top },
      to: {
        x: toRect.left - stageRect.left + toRect.width / 2,
        y: toRect.top - stageRect.top + (toEl ? toRect.height / 2 : stageRect.height * 0.3),
      },
    };
    setGhosts((prev) => [...prev, ghost]);
    setTimeout(() => setGhosts((prev) => prev.filter((g) => g.id !== ghost.id)), 400);
  }, []);

  const playSelected = useCallback(
    (unitUid?: string) => {
      if (!battle || locked || selectedIdx === null || !selectedCard) return;
      const enemyTarget = selectedCard.target === 'enemy' ? (unitUid ?? livingEnemies[targetIdx]?.uid) : undefined;
      // v11: an ally uid aims a self-heal at that party monster; no uid = hero, as ever.
      const allyTarget = selectedCard.target === 'self' && unitUid && unitUid !== 'hero' ? unitUid : undefined;
      sfx('cardPlay');
      flyGhost(selectedIdx, selectedCard, enemyTarget);
      dispatch({ type: 'PLAY_CARD', handIndex: selectedIdx, targetUid: enemyTarget ?? allyTarget });
      setSelectedIdx(null);
      setShowItems(false);
    },
    [battle, locked, selectedIdx, selectedCard, livingEnemies, targetIdx, dispatch, flyGhost]
  );

  const selectCard = useCallback(
    (idx: number) => {
      if (!battle || locked) return;
      if (selectedIdx === idx) {
        const card = getCard(battle.hand[idx]?.cardId ?? '');
        if (card && card.target !== 'enemy') playSelected();
        return;
      }
      sfx('uiClick');
      setSelectedIdx(idx);
    },
    [battle, locked, selectedIdx, playSelected]
  );

  const discardHandGhosts = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !battle) return;
    const stageRect = stage.getBoundingClientRect();
    const pileEl = stage.querySelector('.pile-discard');
    const pileRect = pileEl ? pileEl.getBoundingClientRect() : stageRect;
    battle.hand.forEach((inst, i) => {
      const el = slotRefs.current.get(i);
      const card = getCard(inst.cardId);
      if (!el || !card) return;
      const r = el.getBoundingClientRect();
      const ghost: Ghost = {
        id: ++ghostSeq,
        card,
        from: { x: r.left - stageRect.left + r.width / 2, y: r.top - stageRect.top },
        to: { x: pileRect.left - stageRect.left + pileRect.width / 2, y: pileRect.top - stageRect.top },
      };
      setGhosts((prev) => [...prev, ghost]);
      setTimeout(() => setGhosts((prev) => prev.filter((g) => g.id !== ghost.id)), 400);
    });
  }, [battle]);

  const endTurn = useCallback(() => {
    if (locked) return;
    sfx('endTurn');
    setSelectedIdx(null);
    setShowItems(false);
    setPileView(null);
    discardHandGhosts();
    dispatch({ type: 'END_TURN' });
  }, [dispatch, locked, discardHandGhosts]);

  // --- Keyboard ---
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!battle) return;
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < battle.hand.length) selectCard(idx);
      } else if (e.key === 'Enter' && selectedIdx !== null) {
        playSelected();
      } else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && needsTarget) {
        e.preventDefault();
        setTargetIdx((t) => (t + (e.key === 'ArrowRight' ? 1 : livingEnemies.length - 1)) % Math.max(1, livingEnemies.length));
      } else if (e.key === 'e' || e.key === 'E') {
        endTurn();
      } else if (e.key === 'i' || e.key === 'I') {
        setShowItems((s) => !s);
      } else if (e.key === 'Escape') {
        setSelectedIdx(null);
        setShowItems(false);
        setPileView(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [battle, selectedIdx, needsTarget, livingEnemies.length, selectCard, playSelected, endTurn]);

  // --- Basic gamepad support ---
  const padPrev = useRef<boolean[]>([]);
  useEffect(() => {
    let raf = 0;
    const poll = () => {
      raf = requestAnimationFrame(poll);
      const pad = navigator.getGamepads?.()[0];
      if (!pad || !battle) return;
      const pressed = pad.buttons.map((b) => b.pressed);
      const was = padPrev.current;
      const edge = (i: number) => pressed[i] && !was[i];
      if (edge(14)) setSelectedIdx((s) => Math.max(0, (s ?? 0) - 1));
      if (edge(15)) setSelectedIdx((s) => Math.min(battle.hand.length - 1, (s ?? -1) + 1));
      if (edge(4) || edge(12)) setTargetIdx((t) => (t + 1) % Math.max(1, livingEnemies.length));
      if (edge(0) && selectedIdx !== null) playSelected();
      if (edge(1)) setSelectedIdx(null);
      if (edge(5) || edge(9)) endTurn();
      padPrev.current = pressed;
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [battle, selectedIdx, livingEnemies.length, playSelected, endTurn]);

  if (!player || !battle) return null;

  const boss = battle.isBossFight ? battle.enemies[0] : null;
  // The face of the opposition for the top duel portrait: the boss, else the pack leader.
  const leadEnemy = boss ?? livingEnemies[0] ?? battle.enemies[0];
  const popupsFor = (uid: string) => popups.filter((p) => p.targetUid === uid);

  // MTG-style duel portrait HP ring.
  const RING_C = 2 * Math.PI * 30;
  const hpRing = (frac: number) => (
    <svg className="duel-ring-svg" viewBox="0 0 68 68" aria-hidden="true">
      <circle className="duel-ring-track" cx="34" cy="34" r="30" />
      <circle
        className="duel-ring-fill"
        cx="34"
        cy="34"
        r="30"
        strokeDasharray={RING_C}
        strokeDashoffset={RING_C * (1 - Math.max(0, Math.min(1, frac)))}
      />
    </svg>
  );

  const renderPopups = (uid: string) => (
    <div className="popup-layer">
      {popupsFor(uid).map((p) => (
        <span key={p.id} className={`dmg-popup popup-${p.kind}`}>
          {p.text}
        </span>
      ))}
    </div>
  );

  const renderImpact = (uid: string) => impactFx[uid] && <ImpactEffect kind={impactFx[uid]} />;

  const pileContents = (pile: PileId): CardInstance[] =>
    pile === 'draw' ? battle.drawPile : pile === 'discard' ? battle.discardPile : battle.exhaustPile;

  const pileWidget = (pile: PileId) => {
    const cards = pileContents(pile);
    return (
      <button
        type="button"
        className={`pile-widget pile-${pile}`}
        title={`${PILE_LABEL[pile]} — ${cards.length} cards. Click to inspect.`}
        onClick={() => {
          sfx('uiClick');
          setPileView((v) => (v === pile ? null : pile));
        }}
      >
        <span className="pile-cardback">
          <CardBack width={84} />
        </span>
        <span className="pile-count-num">{cards.length}</span>
        <span className="pile-name">{PILE_LABEL[pile]}</span>
      </button>
    );
  };

  // --- Targeting line: from the selected card to the cursor, snapping onto a hovered target.
  // Path shape, color, and arrowhead are keyed off the hero's class — a mage's line arcs high
  // and sparkles, a thief's cuts straight and thin, etc. See src/art/classCursors.ts.
  const lineStyle = CLASS_LINE_STYLE[player.className];
  let targetLine: { path: string; snapped: boolean } | null = null;
  if (needsTarget && !locked && selectedIdx !== null && stageRef.current) {
    const stageRect = stageRef.current.getBoundingClientRect();
    const fromEl = slotRefs.current.get(selectedIdx);
    const hoveredEl = hoveredEnemyUid ? enemyRefs.current.get(hoveredEnemyUid) : null;
    if (fromEl && (hoveredEl || mousePos)) {
      const fromRect = fromEl.getBoundingClientRect();
      const x1 = fromRect.left - stageRect.left + fromRect.width / 2;
      const y1 = fromRect.top - stageRect.top;
      const x2 = hoveredEl ? hoveredEl.getBoundingClientRect().left - stageRect.left + hoveredEl.getBoundingClientRect().width / 2 : mousePos!.x;
      const y2 = hoveredEl ? hoveredEl.getBoundingClientRect().top - stageRect.top + hoveredEl.getBoundingClientRect().height / 2 : mousePos!.y;
      targetLine = { path: buildTargetLinePath(lineStyle, x1, y1, x2, y2), snapped: !!hoveredEl };
    }
  }

  return (
    <div
      className={`panel battle-stage ${shaking ? 'stage-shake' : ''} ${entering ? 'stage-entering' : ''}`}
      ref={stageRef}
      style={{ cursor: raceCursor(player.race) }}
      onMouseMove={(e) => {
        if (!needsTarget) return;
        const r = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: e.clientX - r.left, y: e.clientY - r.top });
      }}
      onMouseLeave={() => setMousePos(null)}
      onTouchMove={(e) => {
        if (!needsTarget) return;
        const touch = e.touches[0];
        const r = e.currentTarget.getBoundingClientRect();
        setMousePos({ x: touch.clientX - r.left, y: touch.clientY - r.top });
        const el = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-enemy-uid]');
        setHoveredEnemyUid(el?.dataset.enemyUid ?? null);
      }}
      onTouchEnd={(e) => {
        if (!needsTarget) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY)?.closest<HTMLElement>('[data-enemy-uid]');
        const uid = el?.dataset.enemyUid;
        if (uid && livingEnemies.some((en) => en.uid === uid)) playSelected(uid);
        setMousePos(null);
        setHoveredEnemyUid(null);
      }}
    >
      {entering && (
        <>
          <div className="battle-enter-flash" />
          <div className="battle-enter-iris" />
        </>
      )}
      {targetLine && (
        <svg className="target-line-layer">
          <defs>
            <marker id="target-arrowhead" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
              <path d={lineStyle.marker} fill={targetLine.snapped ? lineStyle.snapColor : lineStyle.color} />
            </marker>
          </defs>
          <path
            d={targetLine.path}
            fill="none"
            stroke={targetLine.snapped ? lineStyle.snapColor : lineStyle.color}
            strokeWidth={targetLine.snapped ? lineStyle.width + 0.75 : lineStyle.width}
            strokeDasharray={lineStyle.dash}
            className="target-line"
            style={{ color: targetLine.snapped ? lineStyle.snapColor : lineStyle.color }}
            markerEnd="url(#target-arrowhead)"
          />
        </svg>
      )}
      {battle.gateId && (
        <div className="stage-backdrop">
          {PAINTED_BACKDROPS[battle.gateId] ? (
            <img className="painted-scene" src={PAINTED_BACKDROPS[battle.gateId]} alt="" />
          ) : (
            <BattleBackdrop gateId={battle.gateId} />
          )}
        </div>
      )}
      {battle.tamerName && <div className="tamer-banner">⚔️ {battle.tamerName} — a rival's beasts answer the whistle</div>}

      {battle.mercy && !locked && (
        <div className="mercy-overlay">
          <div className="mercy-box">
            <p className="mercy-text">
              It stops fighting. It lowers its head, bares its neck, and waits — for the blow, or for your hand.
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <button className="btn primary" onClick={() => dispatch({ type: 'MERCY_SPARE' })}>
                🤲 Spare it
              </button>
              <button className="btn danger" onClick={() => dispatch({ type: 'MERCY_FINISH' })}>
                🗡️ Finish it
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MTG-Arena battlefield: enemies in the TOP row, party in the BOTTOM row.
           Each combatant is a battlefield unit — figure, corner badges, nameplate,
           HP groove — replacing the old ff-box strip entirely. ===== */}
      <div className="battlefield">
        {/* Vigor: a rail of candles down the LEFT edge. One candle per max vigor;
            spending a card snuffs one (flame gutters, smoke curls, wax dims). */}
        <div className="vigor-rail" title={`Vigor — ${battle.energy} of ${battle.maxEnergy} left to spend on cards`}>
          <div className="vigor-candles">
            {Array.from({ length: battle.maxEnergy }, (_, i) => (
              <span key={i} className={`candle ${i < battle.energy ? 'lit' : 'out'}`}>
                <span className="candle-smoke" aria-hidden="true" />
                <span className="candle-flame" aria-hidden="true" />
                <span className="candle-wick" aria-hidden="true" />
                <span className="candle-wax" aria-hidden="true" />
              </span>
            ))}
          </div>
          <span className="vigor-count">
            <b>{battle.energy}</b>
            <span>/{battle.maxEnergy}</span>
          </span>
          <span className="vigor-word">vigor</span>
        </div>

        {/* v18: the combat log rides a RIGHT-side rail, opposite the candles.
            The app shell's bottom .game-log is hidden in battle (battle.css);
            the strip it vacated is where the hand now lives. */}
        <aside className="battle-log-rail" aria-label="Combat log">
          <div className="battle-log-title">Chronicle</div>
          <LogPanel lines={state.log} allyNames={[player.name, ...state.party.map((m) => m.nickname)]} />
        </aside>

        {/* Enemy duel portrait, top-center. Boss fights fold the boss bar in here. */}
        {leadEnemy && (
          <div className={`duel-chip duel-top ${boss ? 'duel-boss' : ''}`}>
            <div className="duel-ring">
              {hpRing(leadEnemy.hp / leadEnemy.maxHp)}
              <span className="duel-art">
                <MonsterImage speciesId={leadEnemy.speciesId} size={78} rarity={leadEnemy.rarity} />
              </span>
            </div>
            {boss ? (
              <div className="boss-bar">
                <div className="boss-name">{boss.displayName()}</div>
                <div className="boss-track">
                  <div className="boss-fill" style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
                </div>
              </div>
            ) : (
              <span className="duel-hp">
                {leadEnemy.hp}/{leadEnemy.maxHp}
              </span>
            )}
          </div>
        )}

        <div className="bf-row enemy-row">
          {battle.enemies.map((enemy) => {
            const intent = battle.intents[enemy.uid];
            const staggered = enemy.hasStatus('Stunned') || enemy.hasStatus('Frozen');
            const iv = staggered
              ? { icon: '💫', label: 'STAGGERED', title: 'Staggered — it will lose its turn' }
              : intentView(intent);
            const targetable = needsTarget && enemy.isAlive() && !locked;
            const isTarget = targetable && livingEnemies[targetIdx]?.uid === enemy.uid;
            const block = battle.enemyBlock[enemy.uid] ?? 0;
            const weakTo = familyWeakness(enemy.family);
            return (
              <div
                key={enemy.uid}
                ref={(el) => {
                  if (el) enemyRefs.current.set(enemy.uid, el);
                }}
                className={`bf-unit enemy-slot ${enemy.isBoss ? 'boss' : ''} ${enemy.isAlive() ? '' : 'felled'} ${targetable ? 'targetable' : ''} ${isTarget ? 'kb-target' : ''} ${actingUid === enemy.uid ? 'acting' : ''} ${preTargetUid === enemy.uid ? 'pre-target' : ''} ${flashing[enemy.uid] ?? ''}`}
                data-enemy-uid={enemy.isAlive() ? enemy.uid : undefined}
                title={enemy.aspect ? `${enemy.aspect.name} — ${enemy.aspect.blurb}` : undefined}
                onClick={() => targetable && playSelected(enemy.uid)}
                onMouseEnter={() => {
                  if (targetable) {
                    const li = livingEnemies.findIndex((e) => e.uid === enemy.uid);
                    if (li >= 0) setTargetIdx(li);
                    setHoveredEnemyUid(enemy.uid);
                  }
                }}
                onMouseLeave={() => setHoveredEnemyUid((cur) => (cur === enemy.uid ? null : cur))}
              >
                {enemy.isAlive() && (
                  <div className="intent" title={iv.title}>
                    <span className="intent-icon">{iv.icon}</span>
                    {iv.label && <span className="intent-num">{iv.label}</span>}
                    {iv.move && <span className="intent-move">{iv.move}</span>}
                  </div>
                )}
                <div className="bf-figure">
                  <MonsterImage speciesId={enemy.speciesId} size={enemy.isBoss ? 250 : 150} rarity={enemy.rarity} boss={enemy.isBoss} />
                  {block > 0 && <span className="bf-badge badge-block">🛡 {block}</span>}
                  <span className="bf-badge badge-lv">Lv{enemy.level}</span>
                  {!enemy.isBoss && enemy.isAlive() && (
                    <span className="bf-badge badge-tame">tame {enemy.tameChancePercent()}%</span>
                  )}
                  {enemy.isAlive() && weakTo && (
                    <span className="weak-badge" title={`Weak to ${weakTo}`}>
                      {ELEMENT_ICON[weakTo]}
                    </span>
                  )}
                  {(enemy.statusEffects.length > 0 || enemy.activeMods.length > 0) && (
                    <span className="bf-badge-stack">
                      {enemy.statusEffects.map((st) => (
                        <span key={st.name} className="status-tag">
                          {st.name}
                        </span>
                      ))}
                      {enemy.activeMods.map((m, i) => (
                        <span key={i} className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}>
                          {m.stat}
                          {m.amount > 0 ? '↑' : '↓'}
                        </span>
                      ))}
                    </span>
                  )}
                  {renderPopups(enemy.uid)}
                  {renderImpact(enemy.uid)}
                </div>
                <div className="bf-plate">
                  <div className="bf-name">{enemy.displayName()}</div>
                  {!enemy.isBoss && (
                    <div className="souls-track hp">
                      <div className="souls-fill" style={{ width: `${(enemy.hp / enemy.maxHp) * 100}%` }} />
                    </div>
                  )}
                  <div className="bf-hp-row">
                    <span>
                      {enemy.hp}/{enemy.maxHp}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* The banner gap between the rows — whose action is resolving. */}
        <div className="bf-gap">
          {locked && !actorBanner && <div className="phase-indicator">the dark moves…</div>}
          {actorBanner && (
            <div className={`action-banner action-${actorBanner.side}`}>
              <span className="action-name">{actorBanner.name}</span>
              <span className="action-label">{actorBanner.label}</span>
            </div>
          )}
        </div>

        <div className="bf-row party-row">
          <div
            className={`bf-unit combatant-figure hero-fig ${flashing['hero'] ?? ''} ${actingUid === 'hero' ? 'acting' : ''} ${preTargetUid === 'hero' ? 'pre-target' : ''} ${allyAimable && !locked ? 'ally-aimable' : ''} ${player.hp <= player.maxHp * 0.25 ? 'hp-danger' : ''}`}
            onClick={() => allyAimable && !locked && playSelected('hero')}
            title={allyAimable ? 'Aim the mending here' : undefined}
          >
            <div className="bf-figure">
              <HeroImage className={player.className} size={132} />
              {battle.heroBlock > 0 && <span className="bf-badge badge-block">🛡 {battle.heroBlock}</span>}
              {(player.statusEffects.length > 0 || player.activeMods.length > 0) && (
                <span className="bf-badge-stack">
                  {player.statusEffects.map((st) => (
                    <span key={st.name} className="status-tag">
                      {st.name}
                    </span>
                  ))}
                  {player.activeMods.map((m, i) => (
                    <span key={i} className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}>
                      {m.stat}
                      {m.amount > 0 ? '↑' : '↓'}
                    </span>
                  ))}
                </span>
              )}
              {renderPopups('hero')}
              {renderImpact('hero')}
            </div>
            <div className="bf-plate">
              <div className="bf-name">{player.name}</div>
              <div className="souls-track hp">
                <div className="souls-fill" style={{ width: `${(player.hp / player.maxHp) * 100}%` }} />
              </div>
              <div className="bf-hp-row">
                <span>HP</span>
                <span>
                  {player.hp}/{player.maxHp}
                </span>
              </div>
            </div>
          </div>
          {state.party.map((m: MonsterInstance) => (
            <div
              key={m.uid}
              className={`bf-unit combatant-figure ally-fig ${m.isAlive() ? '' : 'felled'} ${flashing[m.uid] ?? ''} ${actingUid === m.uid ? 'acting' : ''} ${preTargetUid === m.uid ? 'pre-target' : ''} ${allyAimable && !locked && m.isAlive() ? 'ally-aimable' : ''} ${m.isAlive() && m.hp <= m.maxHp * 0.25 ? 'hp-danger' : ''}`}
              onClick={() => allyAimable && !locked && m.isAlive() && playSelected(m.uid)}
              title={
                allyAimable && m.isAlive()
                  ? `Aim the mending at ${m.nickname} (${m.hp}/${m.maxHp})`
                  : m.aspect
                    ? `${m.aspect.name} — ${m.aspect.blurb}`
                    : undefined
              }
            >
              <div className="bf-figure">
                <MonsterImage speciesId={m.speciesId} size={124} facing="right" />
                {!m.isAlive() && <span className="ko-label">FALLEN</span>}
                {renderPopups(m.uid)}
                {renderImpact(m.uid)}
              </div>
              <div className="bf-plate">
                <div className="bf-name">{m.nickname}</div>
                <div className="souls-track hp">
                  <div className="souls-fill" style={{ width: `${(m.hp / m.maxHp) * 100}%` }} />
                </div>
                <div className="bf-hp-row">
                  <span>{m.isAlive() ? 'HP' : 'FALLEN'}</span>
                  <span>
                    {m.hp}/{m.maxHp}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Player duel portrait, bottom-center, mirroring the enemy's. */}
        <div className="duel-chip duel-bottom">
          <div className="duel-ring">
            {hpRing(player.hp / player.maxHp)}
            <span className="duel-art">
              <HeroImage className={player.className} size={78} />
            </span>
          </div>
          <span className="duel-hp">
            {player.hp}/{player.maxHp}
          </span>
          {/* v18: the hero's block + statuses + stat mods (STR↑ …) pinned to
              the portrait itself, where the eye already lives. */}
          {(battle.heroBlock > 0 || player.statusEffects.length > 0 || player.activeMods.length > 0) && (
            <span className="duel-status-row">
              {battle.heroBlock > 0 && <span className="status-tag block-tag">🛡 {battle.heroBlock}</span>}
              {player.statusEffects.map((st) => (
                <span key={st.name} className="status-tag">
                  {st.name}
                </span>
              ))}
              {player.activeMods.map((m, i) => (
                <span key={i} className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}>
                  {m.stat}
                  {m.amount > 0 ? '↑' : '↓'}
                </span>
              ))}
            </span>
          )}
        </div>
      </div>

      {/* Always rendered with fixed height so entering aim mode never reflows the stage. */}
      <p className={`target-hint ${needsTarget && !locked ? 'on' : ''}`} aria-hidden={!(needsTarget && !locked)}>
        Choose a target — click a foe, or ◀ ▶ then Enter
      </p>

      {pileView && (
        <div className="pile-inspect">
          <div className="pile-inspect-head">
            <b>{PILE_LABEL[pileView]}</b> · {pileContents(pileView).length} cards
            <button className="btn small" onClick={() => setPileView(null)}>
              Close
            </button>
          </div>
          <div className="pile-inspect-list">
            {[...pileContents(pileView)]
              .map((inst) => ({ inst, card: getCard(inst.cardId) }))
              .filter((x) => x.card)
              .sort((a, b) => a.card!.name.localeCompare(b.card!.name))
              .map(({ inst, card }) => (
                <span key={inst.uid} className={`pile-chip type-chip-${card!.type}`}>
                  {card!.name}
                  {inst.upgraded ? ' +' : ''}
                </span>
              ))}
            {pileContents(pileView).length === 0 && <span className="subtitle">Empty.</span>}
          </div>
        </div>
      )}

      {showItems && (
        <div className="battle-items">
          {[...new Set(player.inventory)].map((name) => {
            const def = CONSUMABLES[name];
            if (!def) return null;
            const count = player.inventory.filter((n) => n === name).length;
            if (def.effect.type === 'bait') {
              return livingEnemies
                .filter((e) => !e.isBoss)
                .map((enemy) => (
                  <button
                    key={`${name}-${enemy.uid}`}
                    className="btn small"
                    disabled={locked}
                    onClick={() => {
                      sfx('uiClick');
                      dispatch({ type: 'BATTLE_ITEM', name, targetUid: enemy.uid });
                    }}
                  >
                    <Icon name={`item_${name.toLowerCase()}`} emoji={def.emoji} size={16} /> {name} ×{count} → {enemy.nickname}
                  </button>
                ));
            }
            return (
              <button
                key={name}
                className="btn small"
                disabled={locked}
                onClick={() => {
                  sfx('uiClick');
                  dispatch({ type: 'BATTLE_ITEM', name });
                }}
              >
                <Icon name={`item_${name.toLowerCase()}`} emoji={def.emoji} size={16} /> {name} ×{count}
              </button>
            );
          })}
          {player.inventory.length === 0 && <span className="subtitle">Nothing in the pouch.</span>}
        </div>
      )}

      <div className="hand-zone">
        <div className="hand-left">{pileWidget('draw')}</div>

        <div className="hand-fan" key={battle.turn ?? battle.drawPile.length + battle.discardPile.length} style={{ ['--n' as string]: battle.hand.length }}>
          {battle.hand.map((inst, i) => {
            const card = getCard(inst.cardId);
            if (!card) return null;
            const source = inst.sourceMonsterUid ? state.party.find((m) => m.uid === inst.sourceMonsterUid) : undefined;
            const playable = card.cost <= battle.energy && !locked;
            return (
              <div
                key={inst.uid}
                ref={(el) => {
                  if (el) slotRefs.current.set(i, el);
                }}
                className={`hand-slot ${selectedIdx === i ? 'sel' : ''}`}
                style={{ ['--i' as string]: i }}
                onMouseEnter={() => sfx('cardHover')}
                onClick={() => playable && selectCard(i)}
                onTouchStart={() => playable && selectCard(i)}
              >
                <CardView
                  card={card}
                  hero={player}
                  sourceMonster={source}
                  width={200}
                  playable={playable}
                  selected={selectedIdx === i}
                  upgraded={!!inst.upgraded}
                  previewTarget={selectedIdx === i ? previewTarget : undefined}
                />
                <span className="hand-key">{i + 1}</span>
              </div>
            );
          })}
          {battle.hand.length === 0 && (
            <div className="subtitle center-text" style={{ alignSelf: 'center' }}>
              No cards in hand.
            </div>
          )}
        </div>

        <div className="hand-right">
          <div className="hand-right-col">
            <div className="hand-right-row">
              {/* v18: real labeled buttons instead of bare emoji glyphs. */}
              <button className="btn small cmd-btn" onClick={() => setShowItems((s) => !s)} disabled={locked} title="Items (I)">
                Items{player.inventory.length > 0 ? ` · ${player.inventory.length}` : ''}
              </button>
              <button
                className="btn small danger cmd-btn"
                disabled={locked}
                onClick={() => {
                  sfx('uiClick');
                  dispatch({ type: 'FLEE_BATTLE' });
                }}
                title="Attempt to flee"
              >
                Flee
              </button>
            </div>
            <div className="hand-right-piles">
              {pileWidget('discard')}
              {pileWidget('exhaust')}
            </div>
          </div>
          <LanternTurn yours={!locked} onEndTurn={endTurn} />
        </div>
      </div>

      {ghosts.map((g) => (
        <div
          key={g.id}
          className="card-ghost"
          style={{
            ['--fx' as string]: `${g.from.x}px`,
            ['--fy' as string]: `${g.from.y}px`,
            ['--tx' as string]: `${g.to.x}px`,
            ['--ty' as string]: `${g.to.y}px`,
          }}
        >
          {CARD_ART[g.card.id] ? (
            <img src={CARD_ART[g.card.id]} alt="" className="card-ghost-img" draggable={false} />
          ) : (
            g.card.emoji
          )}
        </div>
      ))}
    </div>
  );
}
