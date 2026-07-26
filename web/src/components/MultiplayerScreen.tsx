import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import type { CardDef, CardInstance } from '../engine/types';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { buildDeck } from '../engine/systems/cardBattle';
import { getCard, TAME_CARD_ID } from '../engine/data/cards';
import { DUEL_PARTY_MAX, isFairMatch, rivalById, rivalsForLevel, type RivalTamer } from '../engine/data/duelParty';
import {
  DUEL_FOE_HERO_UID,
  LocalTransport,
  beastContributesCards,
  duelCardAction,
  localizeDuelFx,
  makeMirrorSide,
  makeRivalSide,
  validateDuelSide,
  type DuelSetupSide,
  type DuelTransport,
  type DuelView,
} from '../engine/systems/duel';
import { BattleStage, type BattleView } from './BattleScreen';
import { CardView } from './CardView';
import { MonsterImage, HeroImage } from '../art/MonsterImage';
import { PAINTED_TOWN } from '../art/painted';
import { Icon } from './Icon';
import { useNavScope, useRefocusOn } from '../nav';
import { play as sfx } from '../platform/sfx';
import '../duel.css';

// ---------------------------------------------------------------------------
// The Duelling Ring — PRE-MATCH and POST-MATCH only.
//
// v20: this screen no longer draws a fight. Paul, on v19: "why is the duel
// screen so different from our regular battle screen? its just like fighting
// in a menu?" — he was right, and the honest fix was not to redress this file
// but to delete its board entirely. A duel IS a battle, so it renders in
// BattleStage (components/BattleScreen.tsx), the same renderer the gates use:
// painted backdrop, top/bottom rows, portrait chips, candle rail, MTG-scale
// piles, lantern end-turn, hand fan, staggered FX with actor banners.
//
// What is left here is everything that is NOT the fight: mode select, rival
// select, party/deck terms, and the verdict. Plus the ADAPTER — the function
// that turns a redacted `DuelView` into a `BattleView` and routes player
// intent back through `transport.submitAction(...)`. This file still talks to
// a DuelTransport and nothing else: it never calls the duel reducer, never
// touches a BattleState, and never sees the opponent's hand.
// ---------------------------------------------------------------------------

type Phase = 'menu' | 'setup' | 'duel';
const MIRROR_ID = 'mirror';

function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

/**
 * How long BattleStage will take to play an fx batch out. Must match the
 * pacing in BattleScreen.tsx: beats clamp to 500–800ms with a 900ms tail.
 *
 * The AI opponent is paced against this. Without it, LocalTransport's next
 * action lands mid-playback, the stage sees a new fx array, cancels its
 * remaining timers and the player watches half a turn — the numbers are all
 * correct, the fight just becomes unreadable. So the transport's scheduler
 * waits for the stage instead of racing it.
 */
function fxPlaybackMs(count: number): number {
  if (count === 0) return 0;
  return count * Math.min(800, Math.max(500, 12000 / count)) + 900;
}

export function MultiplayerScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player!;
  const roster = useMemo(() => [...state.party, ...state.stable], [state.party, state.stable]);

  const [phase, setPhase] = useState<Phase>('menu');
  const [pickedUids, setPickedUids] = useState<string[]>(() => state.party.slice(0, DUEL_PARTY_MAX).map((m) => m.uid));
  const [opponentId, setOpponentId] = useState<string>(() => rivalsForLevel(player.level)[0]?.id ?? MIRROR_ID);
  const [peekCardId, setPeekCardId] = useState<string | null>(null);
  const [seed, setSeed] = useState<number>(freshSeed);
  const [matchKey, setMatchKey] = useState(0);
  const [view, setView] = useState<DuelView | null>(null);
  const [confirmConcede, setConfirmConcede] = useState(false);

  const transportRef = useRef<DuelTransport | null>(null);
  const reportedRef = useRef<number>(-1);
  const setupRef = useRef<{ mine: DuelSetupSide; foe: DuelSetupSide } | null>(null);
  /** Wall-clock instant the battlefield finishes showing what it was just sent. */
  const stageBusyUntil = useRef<number>(0);

  const party = useMemo(
    () => pickedUids.map((uid) => roster.find((m) => m.uid === uid)).filter((m): m is MonsterInstance => !!m),
    [pickedUids, roster],
  );
  const rival: RivalTamer | null = opponentId === MIRROR_ID ? null : rivalById(opponentId) ?? null;

  // --- Deck preview (the same builder the duel itself uses) ----------------
  const deck = useMemo(() => {
    if (party.length === 0) return [] as CardInstance[];
    return buildDeck(player, party, []).filter((c) => c.cardId !== TAME_CARD_ID);
  }, [player, party]);

  const deckGroups = useMemo(() => {
    const groups = new Map<string, { card: CardDef; count: number; upgraded: boolean; source?: string }>();
    for (const inst of deck) {
      const card = getCard(inst.cardId);
      if (!card) continue;
      const key = `${inst.cardId}${inst.upgraded ? '+' : ''}${inst.sourceMonsterUid ?? ''}`;
      const existing = groups.get(key);
      if (existing) existing.count++;
      else {
        groups.set(key, {
          card,
          count: 1,
          upgraded: !!inst.upgraded,
          source: party.find((m) => m.uid === inst.sourceMonsterUid)?.nickname,
        });
      }
    }
    return [...groups.values()].sort((a, b) => a.card.cost - b.card.cost || a.card.name.localeCompare(b.card.name));
  }, [deck, party]);

  // Only the challenger's half is checked here — the opponent is generated,
  // and createDuel validates the finished pair before a single card is dealt.
  const validation = useMemo(() => {
    const errors = validateDuelSide({ name: player.name, title: '', controller: 'human', hero: player, party }, 'You');
    return { ok: errors.length === 0, errors };
  }, [player, party]);

  // --- Match lifecycle -----------------------------------------------------
  useEffect(() => {
    if (phase !== 'duel') return;
    const built = setupRef.current;
    if (!built) return;
    stageBusyUntil.current = 0;
    // ⇩ THE SEAM. A networked duel replaces exactly this line with
    //   `new WebSocketTransport(url, matchId, token)`. Everything below —
    //   subscription, the adapter, submitAction — is transport-agnostic.
    const transport: DuelTransport = new LocalTransport(
      { seed, matchId: `local-${seed.toString(36)}-${matchKey}`, a: built.mine, b: built.foe },
      {
        aiDelayMs: 720,
        // The opponent moves when the battlefield has finished showing the
        // last move — see fxPlaybackMs. A server would pace itself the same
        // way (or the client would buffer); either way the seam is unchanged.
        schedule: (fn, ms) => setTimeout(fn, Math.max(ms, stageBusyUntil.current - Date.now())),
      },
    );
    transportRef.current = transport;
    const off = transport.onState((next) => {
      stageBusyUntil.current = Date.now() + fxPlaybackMs(next.fx.length);
      setView(next);
    });
    return () => {
      off();
      transport.dispose();
      transportRef.current = null;
    };
  }, [phase, matchKey, seed]);

  // Report the verdict to the single-player state exactly once per match.
  useEffect(() => {
    if (!view || view.outcome.kind === 'ongoing') return;
    if (reportedRef.current === matchKey) return;
    reportedRef.current = matchKey;
    const local = transportRef.current?.localSide ?? 'a';
    const result = view.outcome.kind === 'draw' ? 'draw' : view.outcome.winner === local ? 'win' : 'loss';
    sfx(result === 'loss' ? 'defeat' : 'victory');
    dispatch({ type: 'DUEL_RESULT', result, opponent: view.foe.name });
  }, [view, matchKey, dispatch]);

  function startMatch(nextSeed = freshSeed()) {
    const mine: DuelSetupSide = {
      name: player.name,
      title: `${player.race} ${player.className}, Lv ${player.level}`,
      controller: 'human',
      hero: player,
      party,
    };
    const foe = rival
      ? makeRivalSide(rival, player.level, nextSeed ^ 0x9e3779b9, party.length)
      : makeMirrorSide(player, party, nextSeed ^ 0x9e3779b9);
    setupRef.current = { mine, foe };
    setSeed(nextSeed);
    setView(null);
    setConfirmConcede(false);
    setMatchKey((k) => k + 1);
    setPhase('duel');
  }

  function toggleBeast(uid: string) {
    sfx('uiClick');
    setPickedUids((current) =>
      current.includes(uid) ? current.filter((u) => u !== uid) : current.length >= DUEL_PARTY_MAX ? current : [...current, uid],
    );
  }

  // ==========================================================================
  // THE ADAPTER — a redacted DuelView in, a BattleView out.
  //
  // Everything the battlefield draws comes from `view`; everything the player
  // does goes back out through `transport.submitAction`. Note what is NOT
  // here: no items (a duel takes nothing in from the pouch), no taming (you do
  // not take a rival's beast), no mercy (a rival's beasts do not beg), and
  // Flee is replaced by Concede. Each of those is an ABSENT COMMAND, and
  // BattleStage hides the control for it — the renderer never forks.
  //
  // The opponent's hand crosses this boundary as a COUNT (`foe.handCount`).
  // There is nowhere in this function it could be anything else: `viewFor`
  // does not put their cards in the view. See duel.test.ts.
  // ==========================================================================
  // Memoised on the view so the fx ARRAY IDENTITY is stable across re-renders:
  // BattleStage keys "have I already played this batch?" on it. `you.id` is the
  // seat this snapshot was redacted for, which is the seat we are.
  const localFx = useMemo(
    () => (view ? localizeDuelFx(view.fx, view.fxFrom, view.you.id) : []),
    [view],
  );

  const submit = useCallback(
    (handIndex: number, targetUid?: string) => {
      const transport = transportRef.current;
      if (!transport) return;
      transport.submitAction(duelCardAction(transport.localSide, handIndex, targetUid));
    },
    [],
  );

  const battleView: BattleView | null = useMemo(() => {
    if (!view || view.outcome.kind !== 'ongoing') return null;
    const you = view.you;
    const foe = view.foe;
    const nameOf = (uid: string): string => {
      if (uid === 'hero') return you.hero.name;
      if (uid === DUEL_FOE_HERO_UID) return foe.name;
      return (
        you.party.find((m) => m.uid === uid)?.nickname ??
        foe.party.find((m) => m.uid === uid)?.nickname ??
        ''
      );
    };
    return {
      variant: 'duel',
      hero: you.hero,
      party: you.party,
      enemies: foe.party,
      intents: foe.intents,
      enemyBlock: foe.beastBlock,
      heroBlock: you.block,
      hand: you.hand,
      energy: you.energy,
      maxEnergy: you.maxEnergy,
      // A DUEL IS THE FIGHT WHERE BOTH SIDES SPEND. `viewFor` publishes the
      // foe's energy — it is public information, unlike their hand — so the
      // board can burn a second candle rail on the right and the symmetry
      // means something: this opponent plays by your rules.
      enemyEnergy: foe.energy,
      enemyMaxEnergy: foe.maxEnergy,
      drawPile: you.drawPile,
      discardPile: you.discardPile,
      exhaustPile: you.exhaustPile,
      handKey: you.turn,
      // The ring is chalked in Everdusk, not in the gates — the town's own
      // painting stands in for a gate backdrop.
      //
      // DATA, not a `ReactNode`, since ENGINE_PLAN §8 item 6: "must become
      // data, and BOTH adapters have to change together." `BattleStage` builds
      // the same `<img className="painted-scene">` from it, and the lantern
      // renderer can stand the same painting up behind the ring. `gateId` is
      // null because a duel is not in a gate — which is the honest answer, and
      // the renderer reads it as "no gate stone to lay the floor with".
      backdrop: { painted: PAINTED_TOWN, gateId: null },
      portrait: {
        kind: 'tamer',
        uid: DUEL_FOE_HERO_UID,
        hero: foe.hero,
        name: foe.name,
        handCount: foe.handCount,
      },
      banner: `⚔️ ${foe.name}${foe.title ? ` — ${foe.title}` : ''}`,
      roundLabel: `Round ${view.round} · ${view.yourTurn ? 'your move' : 'their move'}`,
      mercy: false,
      yourTurn: view.yourTurn,
      showTameOdds: false,
      log: view.log,
      allyNames: [you.name, ...you.party.map((m) => m.nickname)],
      fx: localFx,
      nameForUid: nameOf,
      commands: {
        playCard: submit,
        endTurn: () => {
          const transport = transportRef.current;
          if (!transport) return;
          transport.submitAction({ kind: 'endTurn', side: transport.localSide });
        },
        // No useItem: a duel is fought with cards and beasts, nothing else.
        // No mercy verdict: a rival's beasts fight to the last and walk home.
        retreat: {
          label: 'Concede',
          title: 'Yield the ring',
          run: () => setConfirmConcede(true),
        },
      },
    };
  }, [view, localFx, submit]);

  // ==========================================================================
  // Navigation. Four phases, and each is a completely different focus surface
  // — `setPhase` replaces the whole DOM, so a pad player's cursor was dropped
  // on every transition. One scope covers all the PANEL phases (menu, setup,
  // chalking, verdict): they render the same element in the same position, so
  // React keeps one DOM node under the ref and the scope survives the swap.
  //
  // The fight itself is not one of them. It is `BattleStage`, which brings its
  // own scope — this screen must not put a second one over the battlefield.
  //
  // `cardCodex` aside, this is the other screen with no HUD back chip (it is
  // not in App.tsx's `backable` list), so B is the only non-mouse way out and
  // it has to be phase-aware.
  // ==========================================================================
  const inRing = phase === 'duel' && !!view && view.outcome.kind === 'ongoing';
  const panelRef = useRef<HTMLDivElement>(null);
  useNavScope(panelRef, {
    id: 'multiplayer',
    enabled: !inRing,
    onCancel: () => {
      if (phase === 'setup') {
        setPhase('menu');
        return true;
      }
      if (phase === 'duel') {
        // The verdict card. Leaving is the safe reading of B here: "Again"
        // starts a whole new match and must be asked for.
        setView(null);
        dispatch({ type: 'GOTO', screen: 'town' });
        return true;
      }
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });
  useRefocusOn([phase, view?.outcome.kind, inRing]);

  // ==========================================================================
  // Menu — the shell a server browser will grow into
  // ==========================================================================
  if (phase === 'menu') {
    const record = state.duelRecord;
    return (
      <div className="panel duel-panel" ref={panelRef}>
        <h1 className="title">⚔️ The Duelling Ring</h1>
        <p className="subtitle">
          No orbs, no spoils, no graves. Two tamers, a chalk circle, and whatever their beasts think of each other.
        </p>
        {record && (
          <p className="duel-record">
            Duels — {record.wins} won · {record.losses} lost{record.draws ? ` · ${record.draws} drawn` : ''}
          </p>
        )}

        <div className="duel-modes">
          <button className="duel-mode" onClick={() => { sfx('uiClick'); setPhase('setup'); }}>
            <span className="duel-mode-title">
              Duel <span className="duel-pill good">Open now</span>
            </span>
            <span className="duel-mode-sub">Trial of Beasts · versus the house</span>
            <p className="duel-mode-desc">
              Pick your beasts and take a rival tamer's challenge — or your own reflection's. Fought on the same
              battlefield as the dark below: the same cards, the same statuses, the same rules. It costs nothing but
              the afternoon.
            </p>
          </button>

          <button className="duel-mode" disabled title="The relay has not been lit.">
            <span className="duel-mode-title">
              Versus <span className="duel-pill soon">Coming soon</span>
            </span>
            <span className="duel-mode-sub">Open contests · tamer against tamer</span>
            <p className="duel-mode-desc">
              Someone else's hand, on someone else's machine. Lobby codes first, then an open board of contests you can
              walk up to. The ring is already built for it — only the road between two rings is missing.
            </p>
            <div className="duel-browser" aria-hidden="true">
              <div className="duel-browser-head">
                <span>Contest</span>
                <span>Host</span>
                <span>Band</span>
                <span>Beasts</span>
              </div>
              <div className="duel-browser-empty">No contests are being fought. The relay has not been lit.</div>
            </div>
          </button>
        </div>

        <div className="btn-row">
          <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
            Back to Everdusk
          </button>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Setup — your side, their side, and the deck it all adds up to
  // ==========================================================================
  if (phase === 'setup') {
    const peek = peekCardId ? deckGroups.find((g) => g.card.id === peekCardId) : deckGroups[0];
    const overmatched = rival ? !isFairMatch(rival, player.level) : false;
    return (
      <div className="panel duel-panel" ref={panelRef}>
        <h1 className="title">⚔️ Terms of the Duel</h1>
        <p className="subtitle">
          Up to {DUEL_PARTY_MAX} beasts a side, matched numbers, no taming and no killing blows that carry home.
        </p>

        <div className="duel-setup">
          <div className="duel-col">
            <span className="duel-col-head">Your side</span>
            <div className="duel-hero-card">
              <HeroImage className={player.className} size={54} />
              <div>
                <div className="duel-hero-name">{player.name}</div>
                <div className="duel-hero-sub">
                  Lv {player.level} · {player.race} {player.className} · {player.maxHp} HP
                </div>
              </div>
            </div>
            <span className="duel-col-head">
              Beasts entered ({party.length}/{DUEL_PARTY_MAX})
            </span>
            {roster.length === 0 ? (
              <p className="duel-note">
                You have no beasts to enter. Tame something in the gates first — a tamer without a beast is just a
                person standing in a circle.
              </p>
            ) : (
              <div className="duel-beast-grid">
                {roster.map((m) => {
                  const picked = pickedUids.includes(m.uid);
                  const full = !picked && pickedUids.length >= DUEL_PARTY_MAX;
                  const noCards = !beastContributesCards(m);
                  return (
                    <button
                      key={m.uid}
                      className={`duel-beast${picked ? ' picked' : ''}`}
                      disabled={full}
                      onClick={() => toggleBeast(m.uid)}
                      title={noCards ? 'This beast lends no cards to your deck.' : m.personality?.instinctText}
                      // The "lends no cards" warning was `title`-only, which on
                      // a Deck never fires. (` · no cards` is also inline below,
                      // so this is belt to that braces — but the instinct text
                      // had no other home at all.)
                      aria-label={`${m.nickname}, level ${m.level} ${m.species.name}${
                        noCards ? '. Lends no cards to your deck.' : m.personality?.instinctText ? `. ${m.personality.instinctText}` : ''
                      }${picked ? '. Entered.' : ''}`}
                    >
                      <MonsterImage speciesId={m.speciesId} size={38} rarity={m.rarity} />
                      <span>
                        <span className="duel-beast-name">{m.nickname}</span>
                        <br />
                        <span className="duel-beast-sub">
                          Lv {m.level} {m.species.name}
                          {noCards ? ' · no cards' : ''}
                        </span>
                      </span>
                      {picked && <span className="duel-beast-slot">✦</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="duel-col">
            <span className="duel-col-head">Across the circle</span>
            <div className="duel-rivals">
              <button
                className={`duel-rival${opponentId === MIRROR_ID ? ' picked' : ''}`}
                onClick={() => { sfx('uiClick'); setOpponentId(MIRROR_ID); }}
              >
                <span className="duel-rival-name">
                  Your Reflection <span className="duel-pill good">Even</span>
                </span>
                <span className="duel-rival-title">wearing your face</span>
                <p className="duel-rival-blurb">
                  Your build, your beasts, your gear — dealt a different hand and given different tempers. The only
                  honest measure of how you play.
                </p>
                <span className="duel-rival-lineup">
                  {party.length > 0 ? party.map((m) => m.nickname).join(', ') : 'enter beasts to see the lineup'}
                </span>
              </button>

              {rivalsForLevel(player.level).map((t) => {
                const fair = isFairMatch(t, player.level);
                return (
                  <button
                    key={t.id}
                    className={`duel-rival${opponentId === t.id ? ' picked' : ''}`}
                    onClick={() => { sfx('uiClick'); setOpponentId(t.id); }}
                  >
                    <span className="duel-rival-name">
                      {t.name}
                      {fair ? (
                        <span className="duel-pill good">Even band</span>
                      ) : t.band > player.level ? (
                        <span className="duel-pill danger">Beyond you</span>
                      ) : (
                        <span className="duel-pill">Below you</span>
                      )}
                    </span>
                    <span className="duel-rival-title">{t.title}</span>
                    <p className="duel-rival-blurb">{t.blurb}</p>
                    <span className="duel-rival-lineup">
                      Band Lv {t.band} · {t.beasts.map((b) => b.nickname).join(', ')}
                    </span>
                  </button>
                );
              })}
            </div>
            {overmatched && rival && (
              <p className="duel-note">
                {rival.name} fights around level {rival.band}. They will meet you at your own level — but their beasts
                are what they are.
              </p>
            )}
          </div>
        </div>

        <div className="duel-deck">
          <div>
            <span className="duel-col-head">
              The deck you will carry in ({deck.length} cards, Reach Out left at the gate)
            </span>
            <div className="duel-deck-list">
              {deckGroups.length === 0 && <p className="duel-note">Enter a beast to see your deck.</p>}
              {deckGroups.map((g) => (
                <button
                  key={`${g.card.id}-${g.source ?? ''}`}
                  className={`duel-chip${peek?.card.id === g.card.id ? ' picked' : ''}`}
                  onMouseEnter={() => setPeekCardId(g.card.id)}
                  // The preview was hover-driven with a click fallback, which
                  // meant a pad player had to PRESS every chip to see what it
                  // was. On focus it just reads, exactly as it does for a mouse.
                  onFocus={() => setPeekCardId(g.card.id)}
                  onClick={() => setPeekCardId(g.card.id)}
                >
                  <span className="duel-chip-cost">{g.card.cost}</span>
                  {g.card.name}
                  {g.upgraded ? '+' : ''}
                  {g.count > 1 && <span className="duel-chip-count">×{g.count}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="duel-deck-peek">
            {peek && (
              <CardView
                card={peek.card}
                hero={player}
                sourceMonster={party.find((m) => m.nickname === peek.source)}
                width={158}
                upgraded={peek.upgraded}
              />
            )}
          </div>
        </div>

        <div className="btn-row">
          <button className="btn" onClick={() => { sfx('uiClick'); setPhase('menu'); }}>
            Back
          </button>
          <button
            className="btn primary"
            disabled={!validation.ok}
            title={validation.ok ? 'Step into the circle' : validation.errors.join(' ')}
            onClick={() => { sfx('uiClick'); startMatch(); }}
          >
            <Icon name="duel" emoji="⚔️" size={20} /> Enter the ring
          </button>
          {!validation.ok && <span className="duel-hint">{validation.errors[0]}</span>}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // Chalking the circle — the transport has not pushed its first view yet
  // ==========================================================================
  if (!view) {
    return (
      <div className="panel duel-panel" ref={panelRef}>
        <h1 className="title">⚔️ The Duelling Ring</h1>
        <p className="subtitle">Chalking the circle…</p>
      </div>
    );
  }

  // ==========================================================================
  // The verdict
  // ==========================================================================
  if (view.outcome.kind !== 'ongoing') {
    const local = transportRef.current?.localSide ?? 'a';
    const won = view.outcome.kind === 'win' && view.outcome.winner === local;
    const drew = view.outcome.kind === 'draw';
    const quote = rival ? (won ? rival.defeatLine : drew ? rival.taunt : rival.victoryLine) : won ? '"Of course you did. I am you."' : '"I am you. Remember that."';
    return (
      <div className="panel duel-panel" ref={panelRef}>
        <h1 className="title">⚔️ The Duelling Ring</h1>
        <div className="duel-result">
          <div className={`duel-verdict${won ? '' : drew ? ' draw' : ' loss'}`}>{drew ? 'Drawn' : won ? 'The Ring Is Yours' : 'The Ring Is Theirs'}</div>
          <p className="duel-quote">
            {view.foe.name}: {quote}
          </p>
          <p className="duel-note">
            Round {view.round} · every beast walks out of the circle. Duels take nothing that lasts.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => { sfx('uiClick'); startMatch(); }}>
              Again
            </button>
            <button className="btn" onClick={() => { sfx('uiClick'); setView(null); setPhase('setup'); }}>
              Change the terms
            </button>
            <button className="btn" onClick={() => { sfx('uiClick'); dispatch({ type: 'GOTO', screen: 'town' }); }}>
              Leave the ring
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // The fight — rendered by the ONE battlefield. The confirm is a fixed
  // overlay sibling so the stage below it stays the untouched renderer.
  // ==========================================================================
  return (
    <>
      <BattleStage key={matchKey} view={battleView} />
      {confirmConcede && (
        <ConcedeConfirm
          foeName={view.foe.name}
          onFightOn={() => {
            sfx('uiClick');
            setConfirmConcede(false);
          }}
          onYield={() => {
            const transport = transportRef.current;
            setConfirmConcede(false);
            if (!transport) return;
            sfx('uiClick');
            transport.submitAction({ kind: 'concede', side: transport.localSide });
          }}
        />
      )}
    </>
  );
}

/**
 * The concede confirm, over the battlefield.
 *
 * It was a `position: fixed` box with no Escape handler, no trap and no
 * gamepad path at all — the pad's B went to the battle scope underneath and
 * deselected a card while a yes/no question sat on screen. Its own trapping
 * scope at layer 10 puts it above BattleStage's, so B answers the question
 * (with "Fight on", the safe half) and the D-pad cannot walk off it.
 */
function ConcedeConfirm({ foeName, onYield, onFightOn }: { foeName: string; onYield: () => void; onFightOn: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useNavScope(ref, {
    id: 'duel.concede',
    layer: 10,
    trap: true,
    onCancel: () => {
      onFightOn();
      return true;
    },
  });
  return (
    <div className="duel-yield" ref={ref}>
      <div className="duel-yield-box">
        <p className="duel-yield-text">Yield the ring to {foeName}?</p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <button className="btn danger" onClick={onYield}>
            Yield
          </button>
          {/* The cursor opens on the safe answer. */}
          <button className="btn" data-nav-initial="" onClick={onFightOn}>
            Fight on
          </button>
        </div>
      </div>
    </div>
  );
}
