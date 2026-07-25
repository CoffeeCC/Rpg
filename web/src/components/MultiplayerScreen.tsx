import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import type { CardDef, CardInstance } from '../engine/types';
import type { Character } from '../engine/entities/Character';
import type { MonsterInstance } from '../engine/entities/MonsterInstance';
import { buildDeck } from '../engine/systems/cardBattle';
import { getCard, TAME_CARD_ID } from '../engine/data/cards';
import { DUEL_PARTY_MAX, isFairMatch, rivalById, rivalsForLevel, type RivalTamer } from '../engine/data/duelParty';
import {
  LocalTransport,
  beastContributesCards,
  makeMirrorSide,
  makeRivalSide,
  validateDuelSide,
  type DuelSetupSide,
  type DuelTransport,
  type DuelView,
} from '../engine/systems/duel';
import { CardView } from './CardView';
import { MonsterImage, HeroImage } from '../art/MonsterImage';
import { Icon } from './Icon';
import { play as sfx } from '../platform/sfx';
import '../duel.css';

// ---------------------------------------------------------------------------
// The Duelling Ring.
//
// This screen talks to a DuelTransport and nothing else. It never calls the
// duel reducer, never touches a BattleState, and never reads the opponent's
// hand — it renders whatever redacted DuelView the transport pushes and sends
// DuelActions back. Swapping LocalTransport for a WebSocketTransport is a
// one-line change in `startMatch` below; not a line of this markup moves.
// ---------------------------------------------------------------------------

type Phase = 'menu' | 'setup' | 'duel';
const MIRROR_ID = 'mirror';

function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
}

const INTENT_VERB: Record<string, string> = {
  attack: 'Strikes',
  defend: 'Hardens',
  heal: 'Mends',
  howl: 'Gathers',
  buff: 'Gathers',
  debuff: 'Curses',
};

/** Cards that ask you to pick a target before they resolve. */
function needsAim(card: CardDef): 'enemy' | 'ally' | null {
  if (card.target === 'enemy') return 'enemy';
  const heals = card.effects.some((e) => e.kind === 'heal');
  const hurts = card.effects.some((e) => e.kind === 'damage' || e.kind === 'drain' || e.kind === 'resolveDamage');
  return heals && !hurts ? 'ally' : null;
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
  const [selected, setSelected] = useState<number | null>(null);
  const [confirmConcede, setConfirmConcede] = useState(false);

  const transportRef = useRef<DuelTransport | null>(null);
  const reportedRef = useRef<number>(-1);
  const setupRef = useRef<{ mine: DuelSetupSide; foe: DuelSetupSide } | null>(null);

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
    // ⇩ THE SEAM. A networked duel replaces exactly this line with
    //   `new WebSocketTransport(url, matchId, token)`. Everything below —
    //   subscription, rendering, submitAction — is transport-agnostic.
    const transport: DuelTransport = new LocalTransport(
      { seed, matchId: `local-${seed.toString(36)}-${matchKey}`, a: built.mine, b: built.foe },
      { aiDelayMs: 720 },
    );
    transportRef.current = transport;
    const off = transport.onState(setView);
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
    setSelected(null);
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

  function submit(handIndex: number, targetUid?: string) {
    const transport = transportRef.current;
    if (!transport) return;
    sfx('cardPlay');
    transport.submitAction({ kind: 'playCard', side: transport.localSide, handIndex, targetUid });
    setSelected(null);
  }

  function onCardClick(handIndex: number) {
    if (!view?.yourTurn) return;
    const inst = view.you.hand[handIndex];
    const card = inst ? getCard(inst.cardId) : undefined;
    if (!card) return;
    if (selected === handIndex) {
      setSelected(null);
      return;
    }
    const aim = needsAim(card);
    if (aim === 'enemy' && view.foe.party.some((m) => m.isAlive())) {
      setSelected(handIndex);
      return;
    }
    if (aim === 'ally' && view.you.party.some((m) => m.isAlive() && m.hp < m.maxHp)) {
      setSelected(handIndex);
      return;
    }
    submit(handIndex);
  }

  const aimMode: 'enemy' | 'ally' | null = (() => {
    if (selected === null || !view) return null;
    const card = getCard(view.you.hand[selected]?.cardId ?? '');
    return card ? needsAim(card) : null;
  })();

  // ==========================================================================
  // Menu — the shell a server browser will grow into
  // ==========================================================================
  if (phase === 'menu') {
    const record = state.duelRecord;
    return (
      <div className="panel duel-panel">
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
              Pick your beasts and take a rival tamer's challenge — or your own reflection's. Your party fights on the
              same cards, the same statuses, the same rules as the dark below. It costs nothing but the afternoon.
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
      <div className="panel duel-panel">
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
  // The duel itself
  // ==========================================================================
  if (!view) {
    return (
      <div className="panel duel-panel">
        <h1 className="title">⚔️ The Duelling Ring</h1>
        <p className="subtitle">Chalking the circle…</p>
      </div>
    );
  }

  if (view.outcome.kind !== 'ongoing') {
    const local = transportRef.current?.localSide ?? 'a';
    const won = view.outcome.kind === 'win' && view.outcome.winner === local;
    const drew = view.outcome.kind === 'draw';
    const quote = rival ? (won ? rival.defeatLine : drew ? rival.taunt : rival.victoryLine) : won ? '"Of course you did. I am you."' : '"I am you. Remember that."';
    return (
      <div className="panel duel-panel">
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

  const foeIntents = view.foe.intents;

  const renderFigure = (m: MonsterInstance, mine: boolean, aimable: boolean, block: number) => {
    const intent = mine ? undefined : foeIntents[m.uid];
    const pct = Math.max(0, Math.round((m.hp / m.maxHp) * 100));
    const body = (
      <>
        {block > 0 && <span className="duel-block">🛡{block}</span>}
        <MonsterImage speciesId={m.speciesId} size={62} rarity={m.rarity} facing={mine ? 'right' : 'left'} />
        <span className="duel-figure-name" title={`${m.nickname} — Lv ${m.level} ${m.species.name}`}>
          {m.nickname}
        </span>
        <div className="duel-hpbar">
          <div className={`duel-hpfill${mine ? ' mine' : ''}`} style={{ width: `${pct}%` }} />
        </div>
        <span className="duel-hptext">
          {m.hp}/{m.maxHp}
        </span>
        <span className="duel-figure-sub">
          Lv {m.level} · {m.personality?.name ?? '—'}
        </span>
        {(m.statusEffects.length > 0 || m.activeMods.length > 0) && (
          <span className="duel-tags">
            {m.statusEffects.map((s) => (
              <span className="duel-tag bad" key={s.name}>
                {s.name} {s.turns}
              </span>
            ))}
            {m.activeMods.map((mod, i) => (
              <span className="duel-tag" key={`${mod.stat}-${i}`}>
                {mod.stat}
                {mod.amount > 0 ? '↑' : '↓'}
              </span>
            ))}
          </span>
        )}
        {intent && (
          <span className="duel-intent" title={intent.label ?? INTENT_VERB[intent.kind]}>
            {intent.label ?? INTENT_VERB[intent.kind] ?? intent.kind}
            {intent.kind === 'attack' && intent.amount ? ` ⚔${intent.amount}${(intent.times ?? 1) > 1 ? `×${intent.times}` : ''}` : ''}
            {intent.kind === 'defend' && intent.amount ? ` 🛡${intent.amount}` : ''}
          </span>
        )}
      </>
    );
    const classes = `duel-figure${m.isAlive() ? '' : ' down'}${aimable ? ' aimable' : ''}`;
    return aimable ? (
      <button key={m.uid} className={classes} onClick={() => selected !== null && submit(selected, m.uid)}>
        {body}
      </button>
    ) : (
      <div key={m.uid} className={classes}>
        {body}
      </div>
    );
  };

  const tamerPlate = (
    side: DuelView['you'] | DuelView['foe'],
    hero: Character,
    mine: boolean,
    active: boolean,
    figures: React.ReactNode,
  ) => (
    <div className={`duel-side${active ? ' active' : ''}`}>
      <div className="duel-tamer">
        <span className="duel-tamer-name">{side.name}</span>
        <span className="duel-tamer-title">{side.title}</span>
        {mine && (
          <span className="duel-vigor" title={`Vigor ${side.energy}/${side.maxEnergy}`}>
            {Array.from({ length: Math.max(side.maxEnergy, side.energy) }, (_, i) => (
              <span key={i} className={`duel-pip${i < side.energy ? ' lit' : ''}`} />
            ))}
          </span>
        )}
        <span className="duel-counts">
          <span title="Tamer">
            ♥ {hero.hp}/{hero.maxHp}
          </span>
          {side.block > 0 && <span title="Ward">🛡 {side.block}</span>}
          <span title="Hand">🖐 {side.handCount}</span>
          <span title="Draw pile">🂠 {side.drawCount}</span>
          <span title="Discard">♺ {side.discardCount}</span>
        </span>
      </div>
      <div className="duel-row">{figures}</div>
    </div>
  );

  return (
    <div className="panel duel-panel">
      <h1 className="title">
        ⚔️ Round {view.round} — {view.yourTurn ? 'your move' : `${view.foe.name} is thinking`}
      </h1>

      <div className="duel-board">
        <div className="duel-field">
          {tamerPlate(
            view.foe,
            view.foe.hero,
            false,
            !view.yourTurn,
            view.foe.party.map((m) => renderFigure(m, false, aimMode === 'enemy' && m.isAlive(), view.foe.beastBlock[m.uid] ?? 0)),
          )}
          {tamerPlate(
            view.you,
            view.you.hero,
            true,
            view.yourTurn,
            view.you.party.map((m) => renderFigure(m, true, aimMode === 'ally' && m.isAlive(), view.you.beastBlock[m.uid] ?? 0)),
          )}

          <div className="duel-hand">
            {view.you.hand.map((inst, i) => {
              const card = getCard(inst.cardId);
              if (!card) return null;
              const source = view.you.party.find((m) => m.uid === inst.sourceMonsterUid);
              const affordable = view.yourTurn && card.cost <= view.you.energy;
              return (
                <button
                  key={inst.uid}
                  className={`duel-card-slot${selected === i ? ' selected' : ''}`}
                  disabled={!view.yourTurn}
                  onMouseEnter={() => sfx('cardHover')}
                  onClick={() => onCardClick(i)}
                >
                  <CardView
                    card={card}
                    hero={view.you.hero}
                    sourceMonster={source}
                    width={126}
                    playable={affordable}
                    selected={selected === i}
                    upgraded={!!inst.upgraded}
                  />
                </button>
              );
            })}
            {view.you.hand.length === 0 && <p className="duel-note">Your hand is empty. End the turn and draw again.</p>}
          </div>

          <div className="duel-actions">
            <button
              className="btn primary"
              disabled={!view.yourTurn}
              onClick={() => {
                const transport = transportRef.current;
                if (!transport) return;
                sfx('endTurn');
                setSelected(null);
                transport.submitAction({ kind: 'endTurn', side: transport.localSide });
              }}
            >
              End turn
            </button>
            {selected !== null && (
              <button className="btn" onClick={() => setSelected(null)}>
                Cancel aim
              </button>
            )}
            {aimMode === 'enemy' && <span className="duel-hint">Choose which of their beasts takes it.</span>}
            {aimMode === 'ally' && <span className="duel-hint">Choose which of yours to mend.</span>}
            <span style={{ marginLeft: 'auto' }} />
            {confirmConcede ? (
              <>
                <span className="duel-hint">Yield the ring?</span>
                <button
                  className="btn danger"
                  onClick={() => {
                    const transport = transportRef.current;
                    if (!transport) return;
                    transport.submitAction({ kind: 'concede', side: transport.localSide });
                    setConfirmConcede(false);
                  }}
                >
                  Yield
                </button>
                <button className="btn small" onClick={() => setConfirmConcede(false)}>
                  No
                </button>
              </>
            ) : (
              <button className="btn small" disabled={!view.yourTurn} onClick={() => setConfirmConcede(true)}>
                Concede
              </button>
            )}
          </div>
        </div>

        <div className="duel-log">
          {view.log.slice(-40).map((line, i) => (
            <div key={`${i}-${line}`} className={`duel-log-line${line.startsWith('—') || line.startsWith('⸻') ? ' turn' : ''}`}>
              {line}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
