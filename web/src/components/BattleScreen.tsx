import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LightLayer } from './LightLayer';
import type { GameAction, GameState } from '../engine/game';
import type { CardDef, CardInstance, FxEvent, GateId, Intent } from '../engine/types';
import type { Character } from '../engine/entities/Character';
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
import { useNavScope, useNavInputMode, useRefocusOn, navItem, focusFirstIn, getInputMode } from '../nav';
import { DrillCoach } from './DrillCoach';

// ===========================================================================
// THE ONE BATTLEFIELD.
//
// v20: there is exactly ONE renderer for a fight in this game — `BattleStage`
// below. It used to read `GameState` directly, which is why v19's duels ended
// up with a second, parallel combat UI (a fight "in a menu"). It now renders
// from a `BattleView` view-model plus a `BattleCommands` command interface,
// and there are two adapters:
//
//   * `useSoloBattleView` (this file) — GameState in, GameAction dispatches out.
//     `BattleScreen` is the single-player entry point and its behaviour is
//     unchanged: same dispatches, same FX pacing, same aim flow, same keys.
//   * the duel adapter (MultiplayerScreen.tsx) — a redacted `DuelView` in,
//     `transport.submitAction(...)` out.
//
// WHERE A MODE LACKS A FEATURE, THE ADAPTER OMITS THE COMMAND AND THIS FILE
// HIDES THE CONTROL. It must never grow a `if (duel)` branch around a row, a
// figure, or a plate — that is the fork this refactor exists to delete. The
// only mode-aware dressing allowed is `variant`, and only for chrome that has
// no single-player counterpart at all (the round line, the rival's face-down
// hand).
// ===========================================================================

/** The face of the opposition, in the top portrait chip. */
export type BattlePortrait =
  /** Solo: the boss, else the pack leader. `boss` folds in the boss bar. */
  | { kind: 'beast'; unit: MonsterInstance; boss: boolean }
  /** Duel: the rival tamer, with their redacted hand SIZE (never contents). */
  | { kind: 'tamer'; uid: string; hero: Character; name: string; handCount: number };

/**
 * Everything the battlefield can do. An absent command is an unavailable
 * feature: the control for it is not rendered. That is the whole mechanism —
 * no capability flags to keep in sync, no branches in the markup.
 */
export interface BattleCommands {
  playCard(handIndex: number, targetUid?: string): void;
  endTurn(): void;
  /** Absent where there is no pouch to reach into (a duel takes nothing in). */
  useItem?(name: string, targetUid?: string): void;
  /** The way out: "Flee" in the gates, "Concede" in the ring. */
  retreat?: { label: string; title: string; run(): void };
  /** The mercy verdict. Wild beasts beg; a rival's beasts do not. */
  mercySpare?(): void;
  mercyFinish?(): void;
}

/** Everything the battlefield draws. Entities are live objects, read at render. */
export interface BattleView {
  variant: 'solo' | 'duel';
  hero: Character;
  party: MonsterInstance[];
  enemies: MonsterInstance[];
  intents: Record<string, Intent | undefined>;
  enemyBlock: Record<string, number>;
  heroBlock: number;
  hand: CardInstance[];
  energy: number;
  maxEnergy: number;
  drawPile: CardInstance[];
  discardPile: CardInstance[];
  exhaustPile: CardInstance[];
  /** Remount key for the hand fan, so a new turn re-deals it. */
  handKey: number;
  /** The painted scene behind the fight, or null for the bare stage. */
  backdrop: ReactNode | null;
  portrait: BattlePortrait | null;
  /** Line across the top of the stage (the rival's name, a tamer's whistle). */
  banner: string | null;
  /** Duel only: "Round 3 · your move". */
  roundLabel: string | null;
  /** A beaten beast is begging. Wild encounters only. */
  mercy: boolean;
  /** False locks every control — a duel's off-turn, in practice. */
  yourTurn: boolean;
  /** Taming is impossible in a duel, so the odds badge has nothing to say. */
  showTameOdds: boolean;
  log: string[];
  allyNames: string[];
  /** Already addressed in THIS player's uid space (see localizeDuelFx). */
  fx: FxEvent[];
  /** Actor-banner name for an fx uid. */
  nameForUid(uid: string): string;
  commands: BattleCommands;
}

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

// ---------------------------------------------------------------------------
// Adapter (a): the single-player game. GameState in, GameAction out.
// ---------------------------------------------------------------------------

/**
 * Projects `GameState` onto the battlefield. Every field is a direct reference
 * or a verbatim copy of the expression the v19 BattleScreen inlined, and every
 * command is the exact dispatch it used to make — a duel must not be able to
 * move a single number in a wild fight.
 *
 * Memoised on the reducer state itself: `cloneCore` builds a fresh state (and
 * fresh combatants) for every battle action, so state identity is precisely as
 * fresh as reading `state.battle.energy` inline was, while staying stable
 * across re-renders that changed nothing.
 */
function useSoloBattleView(state: GameState, dispatch: (a: GameAction) => void): BattleView | null {
  const drilling = !!state.drill && state.drill.outcome === 'running';
  return useMemo((): BattleView | null => {
    const player = state.player;
    const battle = state.battle;
    if (!player || !battle) return null;

    const living = battle.enemies.filter((e) => e.isAlive());
    const boss = battle.isBossFight ? battle.enemies[0] : null;
    // The face of the opposition for the top portrait: the boss, else the pack leader.
    const leadEnemy = boss ?? living[0] ?? battle.enemies[0];
    const gateId: GateId | null = battle.gateId;

    return {
      variant: 'solo',
      hero: player,
      party: state.party,
      enemies: battle.enemies,
      intents: battle.intents,
      enemyBlock: battle.enemyBlock,
      heroBlock: battle.heroBlock,
      hand: battle.hand,
      energy: battle.energy,
      maxEnergy: battle.maxEnergy,
      drawPile: battle.drawPile,
      discardPile: battle.discardPile,
      exhaustPile: battle.exhaustPile,
      handKey: battle.turn ?? battle.drawPile.length + battle.discardPile.length,
      backdrop: gateId
        ? PAINTED_BACKDROPS[gateId]
          ? <img className="painted-scene" src={PAINTED_BACKDROPS[gateId]} alt="" />
          : <BattleBackdrop gateId={gateId} />
        : null,
      portrait: leadEnemy ? { kind: 'beast', unit: leadEnemy, boss: !!boss } : null,
      banner: battle.tamerName ? `⚔️ ${battle.tamerName} — a rival's beasts answer the whistle` : null,
      roundLabel: null,
      mercy: !!battle.mercy,
      yourTurn: true,
      // Not in the yard. `beginDrill` pulls Reach Out from the recruit's deck,
      // so a tame percentage on the Exhibit advertises an action they have no
      // card for — and Bram's own line is that the article is already on the
      // inventory and may not be tamed.
      showTameOdds: !drilling,
      log: state.log,
      allyNames: [player.name, ...state.party.map((m) => m.nickname)],
      fx: state.lastFx,
      nameForUid: (uid) =>
        uid === 'hero'
          ? state.player?.name ?? 'You'
          : state.party.find((m) => m.uid === uid)?.nickname ??
            state.battle?.enemies.find((e) => e.uid === uid)?.displayName() ??
            '',
      commands: {
        playCard: (handIndex, targetUid) => dispatch({ type: 'PLAY_CARD', handIndex, targetUid }),
        endTurn: () => dispatch({ type: 'END_TURN' }),
        useItem: (name, targetUid) => dispatch({ type: 'BATTLE_ITEM', name, targetUid }),
        // The drill's exit is a door, not a dice roll: "Flee" implies a risk
        // of failing to, and failing to leave a TUTORIAL is not a thing that
        // should be able to happen. Expressed through the existing retreat
        // command rather than a new control, so the stage is unchanged.
        retreat: drilling
          ? { label: 'Leave the yard', title: 'End the drill. Nothing is recorded.', run: () => dispatch({ type: 'DRILL_LEAVE' }) }
          : { label: 'Flee', title: 'Attempt to flee', run: () => dispatch({ type: 'FLEE_BATTLE' }) },
        mercySpare: () => dispatch({ type: 'MERCY_SPARE' }),
        mercyFinish: () => dispatch({ type: 'MERCY_FINISH' }),
      },
    };
  }, [state, dispatch, drilling]);
}

/**
 * Single-player entry point. App.tsx renders this; it renders the one stage.
 *
 * The drill hangs Bram's rail BESIDE the stage rather than inside it. That is
 * the whole integration: no battle variant, no second renderer, no `if (drill)`
 * anywhere in `BattleStage`. The fight underneath is an ordinary solo battle
 * and the view-model it is built from has no idea a captain is watching.
 */
export function BattleScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const view = useSoloBattleView(state, dispatch);
  const drill = state.drill;
  return (
    <>
      <BattleStage view={view} />
      {drill && state.battle && <DrillCoach drill={drill} />}
    </>
  );
}

/**
 * The mercy verdict, as a real modal.
 *
 * It is the one moment in a fight with no wrong answer and no way out, so the
 * scope traps focus and offers NO cancel — B must not dismiss a decision the
 * game is waiting on. Focus lands on "Spare it": the merciful default is the
 * one that should be reachable without looking.
 */
function MercyPrompt({ onSpare, onFinish }: { onSpare(): void; onFinish(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useNavScope(ref, { id: 'battle.mercy', layer: 10, trap: true });
  return (
    <div className="mercy-overlay" ref={ref}>
      <div className="mercy-box">
        <p className="mercy-text">
          It stops fighting. It lowers its head, bares its neck, and waits — for the blow, or for your hand.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn primary" data-nav-initial="" onClick={onSpare}>
            🤲 Spare it
          </button>
          <button className="btn danger" onClick={onFinish}>
            🗡️ Finish it
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The battlefield itself.
// ---------------------------------------------------------------------------

export function BattleStage({ view }: { view: BattleView | null }) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [targetIdx, setTargetIdx] = useState(0);
  const [showItems, setShowItems] = useState(false);
  const [pileView, setPileView] = useState<PileId | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [flashing, setFlashing] = useState<Record<string, string>>({});
  const [impactFx, setImpactFx] = useState<Record<string, ImpactKind>>({});
  const [shaking, setShaking] = useState(false);
  const [fxLock, setFxLock] = useState(false);
  // v15 readability: whose action is resolving right now (banner + figure glow).
  const [actorBanner, setActorBanner] = useState<{ name: string; label: string; side: 'ally' | 'enemy' } | null>(null);
  const [actingUid, setActingUid] = useState<string | null>(null);
  // v18: pre-attack telegraph — whoever the CURRENT actor's next effect will
  // land on gets a highlight ring for the beat between banner and impact.
  const [preTargetUid, setPreTargetUid] = useState<string | null>(null);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);
  const [hoveredEnemyUid, setHoveredEnemyUid] = useState<string | null>(null);
  // Retro-RPG encounter transition (flash + iris wipe) — BattleStage mounts fresh
  // each time a fight starts, so a mount-only effect fires exactly once per encounter.
  const [entering, setEntering] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setEntering(false), 700);
    return () => clearTimeout(t);
  }, []);
  const inputMode = useNavInputMode();
  const processedFx = useRef<FxEvent[] | null>(null);
  const enemyRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const slotRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const stageRef = useRef<HTMLDivElement>(null);

  // Locked = the fight is resolving, OR (in a duel) it is not your turn. Both
  // mean "hands off", and every control already keys off this one flag.
  const locked = fxLock || (view ? !view.yourTurn : false);
  const fx = view?.fx;

  const livingEnemies = useMemo(() => (view ? view.enemies.filter((e) => e.isAlive()) : []), [view]);

  const selectedCard: CardDef | null = useMemo(() => {
    if (!view || selectedIdx === null) return null;
    const inst = view.hand[selectedIdx];
    return inst ? getCard(inst.cardId) ?? null : null;
  }, [view, selectedIdx]);

  const needsTarget = selectedCard?.target === 'enemy';
  // v11: self-heal cards can be aimed at a wounded party monster instead.
  const allyAimable = !!selectedCard && selectedCard.target === 'self' && selectedCard.effects.some((e) => e.kind === 'heal');
  // The hand card's damage number updates live to the actual (elemental-adjusted)
  // amount once you're aiming at a specific enemy, rather than always showing
  // the untargeted base value — only while hoveredEnemyUid is live, not just selected.
  const previewTarget = needsTarget && hoveredEnemyUid ? livingEnemies.find((e) => e.uid === hoveredEnemyUid) : undefined;

  // --- FX consumption: STAGGERED playback so the fight reads sequentially ---
  useEffect(() => {
    if (!fx || !fx.length || processedFx.current === fx) return;
    processedFx.current = fx;
    const fxList = fx;
    // v18 pacing: v15's ~½s beats still read as a blur in live play. Beats now
    // clamp to 500–800ms — a normal round runs at the full 800ms a beat, and
    // only very long rounds compress toward the 500ms floor (~12s budget).
    const step = Math.min(800, Math.max(500, 12000 / fxList.length));
    // The +900 tail lets the last actor banner HOLD on screen instead of
    // vanishing the instant its final number lands.
    const total = fxList.length * step + 900;
    setFxLock(true);
    const timers: ReturnType<typeof setTimeout>[] = [];

    fxList.forEach((ev, i) => {
      timers.push(
        setTimeout(() => {
          if (ev.fx === 'actor') {
            // Banner whose turn this is; the figure lights up with it.
            setActorBanner({ name: nameOf(ev.uid), label: ev.label, side: ev.side });
            setActingUid(ev.uid);
            // v18 pre-attack beat: ring the unit the NEXT effect will land on,
            // so "what's about to happen" reads before the number does. Pure
            // presentation — derived from the fx order the engine already emits.
            const upcoming = fxList.slice(i + 1).find((f) => f.fx !== 'actor' && f.fx !== 'shake');
            setPreTargetUid(upcoming && 'targetUid' in upcoming ? upcoming.targetUid : null);
            return;
          }
          const sound = fxSound(ev);
          if (sound) sfx(sound);
          if (ev.fx === 'shake') {
            setShaking(true);
            setTimeout(() => setShaking(false), 400);
            return;
          }
          // The telegraph ring comes off the moment its promised hit lands.
          if ('targetUid' in ev) setPreTargetUid((cur) => (cur === ev.targetUid ? null : cur));
          let popup: Popup | null = null;
          if (ev.fx === 'status') popup = { id: ++popupSeq, targetUid: ev.targetUid, text: ev.label, kind: 'status' };
          else if (ev.fx === 'tameTry')
            popup = { id: ++popupSeq, targetUid: ev.targetUid, text: ev.success ? 'TAMED' : 'refused', kind: ev.success ? 'heal' : 'status' };
          else if (ev.fx === 'block') popup = { id: ++popupSeq, targetUid: ev.targetUid, text: `+${ev.amount}`, kind: 'block' };
          else if (ev.fx === 'heal') popup = { id: ++popupSeq, targetUid: ev.targetUid, text: `+${ev.amount}`, kind: 'heal' };
          else if (ev.fx !== 'ko')
            popup = { id: ++popupSeq, targetUid: ev.targetUid, text: `${ev.amount ?? ''}${ev.crit ? '!' : ''}`, kind: ev.crit ? 'crit' : 'damage' };
          if (popup) {
            const p = popup;
            setPopups((prev) => [...prev, p]);
            setTimeout(() => setPopups((prev) => prev.filter((x) => x.id !== p.id)), 1250);
          }
          const flashClass = ev.fx === 'ko' ? 'flash-ko' : ev.fx === 'status' ? '' : `flash-${ev.fx}`;
          if (flashClass) {
            setFlashing((prev) => ({ ...prev, [ev.targetUid]: flashClass }));
            setTimeout(() => setFlashing((prev) => {
              const next = { ...prev };
              delete next[ev.targetUid];
              return next;
            }), 360);
          }
          if (IMPACT_KINDS.has(ev.fx)) {
            const kind = ev.fx as ImpactKind;
            setImpactFx((prev) => ({ ...prev, [ev.targetUid]: kind }));
            setTimeout(() => setImpactFx((prev) => {
              const next = { ...prev };
              if (next[ev.targetUid] === kind) delete next[ev.targetUid];
              return next;
            }), 450);
          }
        }, i * step)
      );
    });

    timers.push(
      setTimeout(() => {
        setFxLock(false);
        setActorBanner(null);
        setActingUid(null);
        setPreTargetUid(null);
      }, total)
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- names resolve from the same update that produced the fx
  }, [fx]);

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
      if (!view || locked || selectedIdx === null || !selectedCard) return;
      const enemyTarget = selectedCard.target === 'enemy' ? (unitUid ?? livingEnemies[targetIdx]?.uid) : undefined;
      // v11: an ally uid aims a self-heal at that party monster; no uid = hero, as ever.
      const allyTarget = selectedCard.target === 'self' && unitUid && unitUid !== 'hero' ? unitUid : undefined;
      sfx('cardPlay');
      flyGhost(selectedIdx, selectedCard, enemyTarget);
      view.commands.playCard(selectedIdx, enemyTarget ?? allyTarget);
      setSelectedIdx(null);
      setShowItems(false);
    },
    [view, locked, selectedIdx, selectedCard, livingEnemies, targetIdx, flyGhost]
  );

  const selectCard = useCallback(
    (idx: number) => {
      if (!view || locked) return;
      if (selectedIdx === idx) {
        const card = getCard(view.hand[idx]?.cardId ?? '');
        if (card && card.target !== 'enemy') playSelected();
        return;
      }
      sfx('uiClick');
      setSelectedIdx(idx);
    },
    [view, locked, selectedIdx, playSelected]
  );

  const discardHandGhosts = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || !view) return;
    const stageRect = stage.getBoundingClientRect();
    const pileEl = stage.querySelector('.pile-discard');
    const pileRect = pileEl ? pileEl.getBoundingClientRect() : stageRect;
    view.hand.forEach((inst, i) => {
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
  }, [view]);

  const endTurn = useCallback(() => {
    if (!view || locked) return;
    sfx('endTurn');
    setSelectedIdx(null);
    setShowItems(false);
    setPileView(null);
    discardHandGhosts();
    view.commands.endTurn();
  }, [view, locked, discardHandGhosts]);

  // --- Keyboard: only the shortcuts that are genuinely this screen's own ---
  //
  // v21: Enter / arrows / Escape moved OUT of here and into the nav scope
  // below, so a key and the equivalent pad button now run one code path
  // instead of two that drifted. The number row, E and I stay — they have no
  // controller counterpart and no meaning anywhere else.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!view) return;
      if (e.key >= '1' && e.key <= '9') {
        const idx = parseInt(e.key, 10) - 1;
        if (idx < view.hand.length) selectCard(idx);
      } else if (e.key === 'e' || e.key === 'E') {
        endTurn();
      } else if (e.key === 'i' || e.key === 'I') {
        if (view.commands.useItem) setShowItems((s) => !s);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [view, selectCard, endTurn]);

  // --- Controller / focus navigation -------------------------------------
  //
  // Combat is two modes and the scope handler is where they are spelled out:
  //
  //   BROWSING — no card picked. Directions move the real focus cursor across
  //     the hand, the piles, Items/Flee and the Lantern. A presses whatever is
  //     under it. Nothing is consumed; the nav layer's default does it all.
  //
  //   AIMING — a card that wants a foe is picked. Directions are CONSUMED and
  //     steer `targetIdx` instead, exactly as the arrow keys did before, while
  //     the cursor stays parked on the card being thrown. The aimed foe is lit
  //     by `.kb-target`, which battle.css has styled since v11.
  //
  // Cycling targets deliberately does NOT move DOM focus onto the enemies:
  // aim is a mode with its own indicator, and hopping the ring up to a monster
  // and back would read as the cursor getting lost.
  const cycleTarget = useCallback(
    (delta: 1 | -1) => {
      const n = Math.max(1, livingEnemies.length);
      setTargetIdx((t) => (t + (delta === 1 ? 1 : n - 1)) % n);
    },
    [livingEnemies.length],
  );

  const aiming = selectedIdx !== null && needsTarget && !locked;

  useNavScope(stageRef, {
    id: 'battle',
    // A duel adapter can render before its view arrives; register only once
    // there is a stage to navigate.
    enabled: !!view,
    onDirection: (dir, meta) => {
      if (!aiming) return false;
      // Left/right is the documented aim gesture; up/down is folded in because
      // the v20 pad build cycled targets on D-pad up and muscle memory is
      // cheaper to honour than to retrain.
      cycleTarget(dir === 'right' || dir === 'down' ? 1 : -1);
      void meta;
      return true;
    },
    onButton: (button, meta) => {
      if (!view) return false;
      switch (button) {
        case 'confirm': {
          // Throw the picked card — but ONLY when the cursor is on the card
          // that is actually picked. Two ways this must not fire: with the
          // ring on Flee, A means Flee; with the ring moved onto a DIFFERENT
          // card, A means "pick that one up instead", which is what falling
          // through to the slot's own onClick already does.
          if (selectedIdx === null) return false;
          if (!meta.target) {
            playSelected();
            return true;
          }
          if (meta.target.closest('.hand-slot')?.classList.contains('sel')) {
            playSelected();
            return true;
          }
          return false;
        }
        case 'alt':
          if (view.commands.useItem) setShowItems((s) => !s);
          return true;
        case 'prevTab':
          // LB cycled the target in the v20 pad build. Kept.
          if (aiming) cycleTarget(1);
          return true;
        case 'nextTab':
        case 'start':
          endTurn();
          return true;
        case 'info':
          setPileView((v) => (v === 'discard' ? null : 'discard'));
          return true;
        default:
          return false;
      }
    },
    onCancel: () => {
      // Same three things Escape has always cleared, in one place.
      setSelectedIdx(null);
      setShowItems(false);
      setPileView(null);
      return true;
    },
  });

  // Two ways combat destroys the element the cursor is sitting on: the hand
  // fan remounts wholesale on `handKey` each turn, and playing a card unmounts
  // that one slot. Both drop focus to <body>, which for a pad player means the
  // ring simply disappears. Re-seat it whenever the hand changes shape or the
  // FX lock lifts.
  useRefocusOn([view?.handKey, view?.hand.length, locked]);

  // Opening the pouch with X should put the cursor in it — otherwise the tray
  // appears and the ring is still down on the hand, which reads as "nothing
  // happened".
  const itemsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (showItems && getInputMode() !== 'pointer') focusFirstIn(itemsRef.current);
  }, [showItems]);

  function nameOf(uid: string): string {
    return view ? view.nameForUid(uid) : '';
  }

  if (!view) return null;

  const hero = view.hero;
  const portrait = view.portrait;
  const boss = portrait?.kind === 'beast' && portrait.boss ? portrait.unit : null;
  const popupsFor = (uid: string) => popups.filter((p) => p.targetUid === uid);

  // MTG-style portrait HP ring.
  const RING_C = 2 * Math.PI * 30;
  const hpRing = (frac: number) => (
    <svg className="bf-ring-svg" viewBox="0 0 68 68" aria-hidden="true">
      <circle className="bf-ring-track" cx="34" cy="34" r="30" />
      <circle
        className="bf-ring-fill"
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
    pile === 'draw' ? view.drawPile : pile === 'discard' ? view.discardPile : view.exhaustPile;

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
  const lineStyle = CLASS_LINE_STYLE[hero.className];
  let targetLine: { path: string; snapped: boolean } | null = null;
  if (needsTarget && !locked && selectedIdx !== null && stageRef.current) {
    const stageRect = stageRef.current.getBoundingClientRect();
    const fromEl = slotRefs.current.get(selectedIdx);
    const hoveredEl = hoveredEnemyUid ? enemyRefs.current.get(hoveredEnemyUid) : null;
    // v21: the aim line is the signature read of this fight, and a controller
    // has no cursor to draw it toward — so when the last input came from a pad
    // or a key it anchors on the foe `targetIdx` is sitting on instead. Purely
    // additive: with a pointer, `hoveredEl`/`mousePos` still decide everything,
    // exactly as before.
    const padAimEl =
      !hoveredEl && inputMode !== 'pointer' ? enemyRefs.current.get(livingEnemies[targetIdx]?.uid ?? '') ?? null : null;
    const snapEl = hoveredEl ?? padAimEl;
    if (fromEl && (snapEl || mousePos)) {
      const fromRect = fromEl.getBoundingClientRect();
      const x1 = fromRect.left - stageRect.left + fromRect.width / 2;
      const y1 = fromRect.top - stageRect.top;
      const x2 = snapEl ? snapEl.getBoundingClientRect().left - stageRect.left + snapEl.getBoundingClientRect().width / 2 : mousePos!.x;
      const y2 = snapEl ? snapEl.getBoundingClientRect().top - stageRect.top + snapEl.getBoundingClientRect().height / 2 : mousePos!.y;
      targetLine = { path: buildTargetLinePath(lineStyle, x1, y1, x2, y2), snapped: !!snapEl };
    }
  }

  return (
    <div
      className={`panel battle-stage ${view.variant === 'duel' ? 'bf-duel' : ''} ${shaking ? 'stage-shake' : ''} ${entering ? 'stage-entering' : ''}`}
      ref={stageRef}
      style={{ cursor: raceCursor(hero.race) }}
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
      {/* THE VIGOR CANDLES, FINALLY CASTING.
          lighting.css §7 already argued this screen's case: there are literal
          lit candles on the rail, they gutter and smoke, and they "cast
          NOTHING — a light source that is drawn but not modelled". §7 got as
          close as CSS can, scaling a painted blob off `:has()`. This is the
          modelled version: the light is AT the rail, the combatants standing
          in the room are what block it, and the intensity is the vigor you
          have left. Spend down to one candle and the room genuinely goes dark
          around you; the shadows the fighters throw lengthen as it does. */}
      <LightLayer
        occluderSelector=".battle-stage .bf-figure"
        anchorSelector=".battle-stage .vigor-candles"
        reach={760}
        intensity={0.2 + 0.5 * (view.maxEnergy ? view.energy / view.maxEnergy : 1)}
        flameSize={18}
        ambient={0.24}
        version={`${view.energy}/${view.maxEnergy}`}
      />

      {/* v19: the iris wipe that used to sit here is gone. App.tsx's "Seal"
          encounter transition (obsidian blades peeling back, z-index 88) now
          owns the dark-edge motion; a second dark ring opening underneath it
          was doing the same job twice. The flash survives — its tail bleeds
          through the dissolve and reads as light beyond the seal — and so
          does .stage-entering's stagePunchIn, which lands as the camera
          settling once the seal is open. */}
      {entering && <div className="battle-enter-flash" />}
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
      {view.backdrop && <div className="stage-backdrop">{view.backdrop}</div>}
      {view.banner && (
        <div className="tamer-banner">
          {view.banner}
          {view.roundLabel && <span className="bf-round">{view.roundLabel}</span>}
        </div>
      )}

      {view.mercy && view.commands.mercySpare && view.commands.mercyFinish && !locked && (
        <MercyPrompt onSpare={view.commands.mercySpare} onFinish={view.commands.mercyFinish} />
      )}

      {/* ===== MTG-Arena battlefield: enemies in the TOP row, party in the BOTTOM row.
           Each combatant is a battlefield unit — figure, corner badges, nameplate,
           HP groove — replacing the old ff-box strip entirely. ===== */}
      <div className={`battlefield ${view.variant === 'duel' ? 'bf-duel' : ''}`}>
        {/* Vigor: a rail of candles down the LEFT edge. One candle per max vigor;
            spending a card snuffs one (flame gutters, smoke curls, wax dims). */}
        <div className="vigor-rail" title={`Vigor — ${view.energy} of ${view.maxEnergy} left to spend on cards`}>
          <div className="vigor-candles">
            {Array.from({ length: view.maxEnergy }, (_, i) => (
              <span key={i} className={`candle ${i < view.energy ? 'lit' : 'out'}`}>
                <span className="candle-smoke" aria-hidden="true" />
                <span className="candle-flame" aria-hidden="true" />
                <span className="candle-wick" aria-hidden="true" />
                <span className="candle-wax" aria-hidden="true" />
              </span>
            ))}
          </div>
          <span className="vigor-count">
            <b>{view.energy}</b>
            <span>/{view.maxEnergy}</span>
          </span>
          <span className="vigor-word">vigor</span>
        </div>

        {/* v18: the combat log rides a RIGHT-side rail, opposite the candles.
            The app shell's bottom .game-log is hidden in battle (battle.css);
            the strip it vacated is where the hand now lives. */}
        <aside className="battle-log-rail" aria-label="Combat log">
          <div className="battle-log-title">Chronicle</div>
          <LogPanel lines={view.log} allyNames={view.allyNames} />
        </aside>

        {/* Enemy portrait chip, top-center. Boss fights fold the boss bar in
            here; a duel folds in the rival's face and their face-down hand. */}
        {portrait && (
          <div
            className={`bf-portrait bf-top ${boss ? 'bf-boss' : ''} ${portrait.kind === 'tamer' ? flashing[portrait.uid] ?? '' : ''}`}
          >
            <div className="bf-ring">
              {hpRing(
                portrait.kind === 'beast'
                  ? portrait.unit.hp / portrait.unit.maxHp
                  : portrait.hero.hp / portrait.hero.maxHp
              )}
              <span className="bf-art">
                {portrait.kind === 'beast' ? (
                  <MonsterImage speciesId={portrait.unit.speciesId} size={78} rarity={portrait.unit.rarity} />
                ) : (
                  <HeroImage className={portrait.hero.className} size={78} />
                )}
              </span>
              {/* The rival tamer has no row of their own — their numbers and
                  their impacts land on the chip that carries their face. */}
              {portrait.kind === 'tamer' && renderPopups(portrait.uid)}
              {portrait.kind === 'tamer' && renderImpact(portrait.uid)}
            </div>
            {boss ? (
              <div className="boss-bar">
                <div className="boss-name" title={boss.displayName()}>
                  {boss.displayName()}
                </div>
                <div className="boss-track">
                  <div className="boss-fill" style={{ width: `${(boss.hp / boss.maxHp) * 100}%` }} />
                </div>
              </div>
            ) : portrait.kind === 'beast' ? (
              <span className="bf-hp">
                {portrait.unit.hp}/{portrait.unit.maxHp}
              </span>
            ) : (
              <>
                <span className="bf-hp" title={`${portrait.name} — the rival tamer`}>
                  {portrait.hero.hp}/{portrait.hero.maxHp}
                </span>
                <span className="bf-foe-name" title={portrait.name}>
                  {portrait.name}
                </span>
                {/* Their hand, face down. The view model carries a COUNT and
                    nothing else — `viewFor` never hands the UI their cards. */}
                <span
                  className="bf-foe-hand"
                  title={`${portrait.name} holds ${portrait.handCount} card${portrait.handCount === 1 ? '' : 's'}`}
                >
                  {Array.from({ length: portrait.handCount }, (_, i) => (
                    <span key={i} className="bf-foe-card" style={{ ['--i' as string]: i }}>
                      <CardBack width={22} />
                    </span>
                  ))}
                  {portrait.handCount === 0 && <span className="bf-foe-empty">empty-handed</span>}
                </span>
              </>
            )}
          </div>
        )}

        <div className="bf-row enemy-row">
          {view.enemies.map((enemy) => {
            const intent = view.intents[enemy.uid];
            const staggered = enemy.hasStatus('Stunned') || enemy.hasStatus('Frozen');
            // 'STAGGERED' is a word, not a number: it rides the telegraph's
            // second line (like a move name) so it can't stretch the plate's
            // number slot out past the unit it belongs to.
            const iv = staggered
              ? { icon: '💫', label: '', title: 'Staggered — it will lose its turn', move: 'Staggered' }
              : intentView(intent);
            const targetable = needsTarget && enemy.isAlive() && !locked;
            const isTarget = targetable && livingEnemies[targetIdx]?.uid === enemy.uid;
            const block = view.enemyBlock[enemy.uid] ?? 0;
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
                    {iv.move && (
                      <span className="intent-move" title={iv.move}>
                        {iv.move}
                      </span>
                    )}
                  </div>
                )}
                <div className="bf-figure">
                  <MonsterImage speciesId={enemy.speciesId} size={enemy.isBoss ? 250 : 150} rarity={enemy.rarity} boss={enemy.isBoss} />
                  {block > 0 && <span className="bf-badge badge-block">🛡 {block}</span>}
                  <span className="bf-badge badge-lv">Lv{enemy.level}</span>
                  {view.showTameOdds && !enemy.isBoss && enemy.isAlive() && (
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
                        <span key={st.name} className="status-tag" title={st.name}>
                          {st.name}
                        </span>
                      ))}
                      {enemy.activeMods.map((m, i) => (
                        <span
                          key={i}
                          className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}
                          title={`${m.stat} ${m.amount > 0 ? '+' : ''}${m.amount}`}
                        >
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
                  <div className="bf-name" title={enemy.displayName()}>
                    {enemy.displayName()}
                  </div>
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
            className={`bf-unit combatant-figure hero-fig ${flashing['hero'] ?? ''} ${actingUid === 'hero' ? 'acting' : ''} ${preTargetUid === 'hero' ? 'pre-target' : ''} ${allyAimable && !locked ? 'ally-aimable' : ''} ${hero.hp <= hero.maxHp * 0.25 ? 'hp-danger' : ''}`}
            // Only a cursor stop while it is actually a choice. A mending card
            // aimed at an ally was mouse-only before this — nothing consumes
            // directions in that mode, so plain spatial focus reaches the row.
            {...(allyAimable && !locked ? navItem({ key: 'ally-hero', label: `Mend ${hero.name}` }) : {})}
            onClick={() => allyAimable && !locked && playSelected('hero')}
            title={allyAimable ? 'Aim the mending here' : undefined}
          >
            <div className="bf-figure">
              <HeroImage className={hero.className} size={132} />
              {view.heroBlock > 0 && <span className="bf-badge badge-block">🛡 {view.heroBlock}</span>}
              {(hero.statusEffects.length > 0 || hero.activeMods.length > 0) && (
                <span className="bf-badge-stack">
                  {hero.statusEffects.map((st) => (
                    <span key={st.name} className="status-tag" title={st.name}>
                      {st.name}
                    </span>
                  ))}
                  {hero.activeMods.map((m, i) => (
                    <span
                      key={i}
                      className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}
                      title={`${m.stat} ${m.amount > 0 ? '+' : ''}${m.amount}`}
                    >
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
              <div className="bf-name" title={hero.name}>
                {hero.name}
              </div>
              <div className="souls-track hp">
                <div className="souls-fill" style={{ width: `${(hero.hp / hero.maxHp) * 100}%` }} />
              </div>
              <div className="bf-hp-row">
                <span>HP</span>
                <span>
                  {hero.hp}/{hero.maxHp}
                </span>
              </div>
            </div>
          </div>
          {view.party.map((m: MonsterInstance) => (
            <div
              key={m.uid}
              className={`bf-unit combatant-figure ally-fig ${m.isAlive() ? '' : 'felled'} ${flashing[m.uid] ?? ''} ${actingUid === m.uid ? 'acting' : ''} ${preTargetUid === m.uid ? 'pre-target' : ''} ${allyAimable && !locked && m.isAlive() ? 'ally-aimable' : ''} ${m.isAlive() && m.hp <= m.maxHp * 0.25 ? 'hp-danger' : ''}`}
              {...(allyAimable && !locked && m.isAlive()
                ? navItem({ key: `ally-${m.uid}`, label: `Mend ${m.nickname}, ${m.hp} of ${m.maxHp}` })
                : {})}
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
                <div className="bf-name" title={m.nickname}>
                  {m.nickname}
                </div>
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

        {/* Player portrait chip, bottom-center, mirroring the enemy's. */}
        <div className="bf-portrait bf-bottom">
          <div className="bf-ring">
            {hpRing(hero.hp / hero.maxHp)}
            <span className="bf-art">
              <HeroImage className={hero.className} size={78} />
            </span>
          </div>
          <span className="bf-hp">
            {hero.hp}/{hero.maxHp}
          </span>
          {/* v18: the hero's block + statuses + stat mods (STR↑ …) pinned to
              the portrait itself, where the eye already lives. */}
          {(view.heroBlock > 0 || hero.statusEffects.length > 0 || hero.activeMods.length > 0) && (
            <span className="bf-status-row">
              {view.heroBlock > 0 && (
                <span className="status-tag block-tag" title={`Block — absorbs ${view.heroBlock} damage`}>
                  🛡 {view.heroBlock}
                </span>
              )}
              {hero.statusEffects.map((st) => (
                <span key={st.name} className="status-tag" title={st.name}>
                  {st.name}
                </span>
              ))}
              {hero.activeMods.map((m, i) => (
                <span
                  key={i}
                  className={`status-tag ${m.amount > 0 ? 'buff' : 'debuff'}`}
                  title={`${m.stat} ${m.amount > 0 ? '+' : ''}${m.amount}`}
                >
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
        Choose a target — click a foe, or ◀ ▶ / D-pad, then Enter or Ⓐ
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

      {showItems && view.commands.useItem && (
        <div className="battle-items" ref={itemsRef}>
          {[...new Set(hero.inventory)].map((name) => {
            const def = CONSUMABLES[name];
            if (!def) return null;
            const count = hero.inventory.filter((n) => n === name).length;
            // Not named `useItem*` on purpose — the hooks lint reads any local
            // starting with "use" as a React hook call.
            const reachForIt = view.commands.useItem!;
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
                      reachForIt(name, enemy.uid);
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
                  reachForIt(name);
                }}
              >
                <Icon name={`item_${name.toLowerCase()}`} emoji={def.emoji} size={16} /> {name} ×{count}
              </button>
            );
          })}
          {hero.inventory.length === 0 && <span className="subtitle">Nothing in the pouch.</span>}
        </div>
      )}

      <div className="hand-zone">
        <div className="hand-left">{pileWidget('draw')}</div>

        <div className="hand-fan" key={view.handKey} style={{ ['--n' as string]: view.hand.length }}>
          {view.hand.map((inst, i) => {
            const card = getCard(inst.cardId);
            if (!card) return null;
            const source = inst.sourceMonsterUid ? view.party.find((m) => m.uid === inst.sourceMonsterUid) : undefined;
            const playable = card.cost <= view.energy && !locked;
            return (
              <div
                key={inst.uid}
                ref={(el) => {
                  if (el) slotRefs.current.set(i, el);
                }}
                className={`hand-slot ${selectedIdx === i ? 'sel' : ''}`}
                style={{ ['--i' as string]: i }}
                // The slot is the nav cell, not the card inside it: battle.css
                // has lifted `.hand-slot:focus-within` since the Tab-only days,
                // so focusing the slot reuses the exact hover gesture. Cards
                // you cannot afford stay focusable on purpose — you still want
                // to be able to read them.
                {...navItem({ key: `hand-${inst.uid}`, initial: i === 0, label: `${card.name}, ${card.cost} vigor` })}
                onMouseEnter={() => sfx('cardHover')}
                onClick={() => playable && selectCard(i)}
                onTouchStart={() => playable && selectCard(i)}
              >
                <CardView
                  card={card}
                  hero={hero}
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
          {view.hand.length === 0 && (
            <div className="subtitle center-text" style={{ alignSelf: 'center' }}>
              No cards in hand.
            </div>
          )}
        </div>

        <div className="hand-right">
          <div className="hand-right-col">
            <div className="hand-right-row">
              {/* v18: real labeled buttons instead of bare emoji glyphs. */}
              {view.commands.useItem && (
                <button className="btn small cmd-btn" onClick={() => setShowItems((s) => !s)} disabled={locked} title="Items (I)">
                  Items{hero.inventory.length > 0 ? ` · ${hero.inventory.length}` : ''}
                </button>
              )}
              {view.commands.retreat && (
                <button
                  className="btn small danger cmd-btn"
                  disabled={locked}
                  onClick={() => {
                    sfx('uiClick');
                    view.commands.retreat!.run();
                  }}
                  title={view.commands.retreat.title}
                >
                  {view.commands.retreat.label}
                </button>
              )}
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
