import { useEffect, useRef, useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { CHRONICLER_BOONS, hasTriumphed, loadTellings, purchaseBoon } from '../platform/tellings';
import { CHRONICLER_DESK_LINES, ordinal as tellingOrdinal } from '../engine/data/tellingsLore';
import { DESK_FIRST_TELLING } from '../engine/data/retellingLore';
import { PrefaceDisclosure } from './BookPanel';
import { NPCS } from '../engine/data/npcs';
import { NPC_LINE_AUDIO } from '../engine/data/npcLineAudio';
import { NpcPortrait, NPC_ACCENTS } from '../art/npcArt';
import { PAINTED_NPCS } from '../art/paintedCharacters';
import { play as sfx, isMuted } from '../platform/sfx';
import { Icon } from './Icon';
import { NextDraftPanel } from './NextDraftPanel';
import { useNavScope } from '../nav';
import '../services.css';

const AUDIO_BASE = (import.meta as unknown as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '';

export function TavernScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [meta, setMeta] = useState(loadTellings());
  const talking = state.lastTalk ? NPCS.find((n) => n.id === state.lastTalk!.npcId) : null;
  const accent = talking ? NPC_ACCENTS[talking.id] ?? '#c8a24a' : '#c8a24a';
  const voiceRef = useRef<HTMLAudioElement | null>(null);

  // Speak the line when a townsfolk greets you (voiced greetings only; the
  // procedurally-filled rumors have no recording and simply stay text).
  useEffect(() => {
    voiceRef.current?.pause();
    if (!state.lastTalk || isMuted()) return;
    const clip = NPC_LINE_AUDIO[`${state.lastTalk.npcId}|${state.lastTalk.text}`];
    if (!clip) return;
    const audio = new Audio(AUDIO_BASE + clip);
    audio.volume = 0.95;
    voiceRef.current = audio;
    audio.play().catch(() => {});
    return () => audio.pause();
  }, [state.lastTalk]);

  // One scope covers the tavern AND the Chronicler's desk it hosts, including
  // NextDraftPanel — the panel is inline, not an overlay, so its rows are just
  // more controls inside this root. It is one of the three longest screens in
  // the game; LT/RT paging and the right stick both work off `.game-main`.
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, {
    id: 'tavern',
    onCancel: () => {
      dispatch({ type: 'GOTO', screen: 'town' });
      return true;
    },
  });

  return (
    <div className="panel tavern" ref={root}>
      <h1 className="title title-with-icon"><Icon name="tavern" size={26} emoji="" /> The Held Breath</h1>
      <p className="subtitle">Everdusk's only tavern. The fire is low, the talk is lower, and both are warm.</p>

      {talking && state.lastTalk && (
        <div className="tavern-speech with-portrait" style={{ ['--npc-accent' as string]: accent }}>
          {/* key on npcId so switching speakers replays the slide-in */}
          <div key={talking.id} className={`tavern-portrait${PAINTED_NPCS[talking.id] ? '' : ' portrait-fallback'}`}>
            {PAINTED_NPCS[talking.id] ? (
              <img src={PAINTED_NPCS[talking.id]} width={132} height={132} alt="" className="painted-portrait" draggable={false} />
            ) : (
              <NpcPortrait npcId={talking.id} size={132} />
            )}
          </div>
          <div className="tavern-speech-body">
            <span className="tavern-speaker">
              {talking.emoji} {talking.name}
            </span>
            <p className="tavern-line">“{state.lastTalk.text}”</p>
          </div>
        </div>
      )}

      <div className="option-list">
        {NPCS.map((npc) => (
          <button
            type="button"
            key={npc.id}
            className={`option-card ${state.lastTalk?.npcId === npc.id ? 'selected' : ''}`}
            onClick={() => {
              sfx('uiClick');
              dispatch({ type: 'TALK', npcId: npc.id });
            }}
          >
            <div className={`npc-thumb${PAINTED_NPCS[npc.id] ? '' : ' portrait-fallback'}`}>
              {PAINTED_NPCS[npc.id] ? (
                <img src={PAINTED_NPCS[npc.id]} alt="" draggable={false} />
              ) : (
                <NpcPortrait npcId={npc.id} size={92} />
              )}
            </div>
            <div className="name">
              {npc.emoji} {npc.name}
            </div>
            <div className="desc">{npc.role}</div>
          </button>
        ))}
      </div>

      <div className="chronicler-desk">
        <h2 className="title" style={{ fontSize: '1rem' }}>
          ✒️ The Chronicler's Desk
        </h2>
        <p className="subtitle chronicler-desk-line">
          {CHRONICLER_DESK_LINES[(meta.telling + meta.purchased.length) % CHRONICLER_DESK_LINES.length]}
        </p>
        <p className="subtitle">
          {meta.telling > 1
            ? `This is the ${tellingOrdinal(meta.telling)} telling of your story, by the Chronicler's count. Verses banked: ✒️ ${meta.verses}. Verses are what a telling was worth; they outlive the hero who earned them.`
            : `${DESK_FIRST_TELLING} Verses banked: ✒️ ${meta.verses}.`}
        </p>

        {/* The whole account of the loop, folded away until asked for. A player
            who wants it can have all of it here; a player who does not is never
            handed it. The Depths paragraph stays sealed until the book has been
            finished, which is the promise NextDraftPanel already makes. */}
        <PrefaceDisclosure triumphed={hasTriumphed(meta)} />

        <h3 className="draft-heading">The Desk: Boons</h3>
        <p className="subtitle" style={{ fontSize: '0.72rem' }}>
          Bought once with verses, and true at the beginning of every telling after. Small, permanent, unromantic.
        </p>
        <div className="option-list ledger-list">
          {CHRONICLER_BOONS.map((boon) => {
            const owned = meta.purchased.includes(boon.id);
            return (
              <div className={`ledger-row${owned ? ' owned' : ''}${!owned && meta.verses < boon.cost ? ' cant' : ''}`} key={boon.id}>
                <div className="ledger-row-body">
                  <b className="ledger-name">{boon.name}</b>
                  {owned && <span className="pill slain-pill">written in</span>}
                  <div className="affix-line">{boon.text}</div>
                </div>
                {!owned && (
                  <div className="svc-buy">
                    <span className="price-chip verse-chip" title="Cost in verses">✒️ {boon.cost}</span>
                    <button
                      className="btn small"
                      disabled={meta.verses < boon.cost}
                      onClick={() => {
                        const updated = purchaseBoon(boon.id);
                        if (updated) setMeta(updated);
                      }}
                    >
                      Inscribe
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <p className="subtitle" style={{ fontSize: '0.72rem' }}>
          Boons are written into every telling to come — they take effect when the next hero begins.
        </p>

        {/* The other half of the desk: what the next draft is ABOUT, rather
            than how much stronger it starts. See engine/data/bindings.ts.
            Framed here rather than inside the panel, which belongs to another
            owner — a player meeting "Bindings" and "Depths" cold has no way to
            know they are two different kinds of thing. */}
        <p className="subtitle desk-second-ledger">
          The second ledger, thinner than the first. A boon above makes the next hero stronger; a premise below makes
          the next telling <i>different</i> — it gives and takes at once, and is fixed the moment that hero is made.
        </p>
        <NextDraftPanel state={state} meta={meta} setMeta={setMeta} />

        <div className="btn-row desk-to-book">
          <button
            className="btn small"
            onClick={() => {
              sfx('uiClick');
              dispatch({ type: 'GOTO', screen: 'chronicle' });
            }}
          >
            Read the book itself
          </button>
        </div>
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back into the dusk
        </button>
      </div>
    </div>
  );
}
