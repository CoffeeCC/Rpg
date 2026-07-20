import { useState } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { CHRONICLER_BOONS, loadTellings, purchaseBoon } from '../platform/tellings';
import { NPCS } from '../engine/data/npcs';
import { NpcPortrait, NPC_ACCENTS } from '../art/npcArt';
import { PAINTED_NPCS } from '../art/paintedCharacters';
import { play as sfx } from '../platform/sfx';

export function TavernScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const [meta, setMeta] = useState(loadTellings());
  const talking = state.lastTalk ? NPCS.find((n) => n.id === state.lastTalk!.npcId) : null;
  const accent = talking ? NPC_ACCENTS[talking.id] ?? '#c8a24a' : '#c8a24a';
  return (
    <div className="panel tavern">
      <h1 className="title">🕯️ The Held Breath</h1>
      <p className="subtitle">Everdusk's only tavern. The fire is low, the talk is lower, and both are warm.</p>

      {talking && state.lastTalk && (
        <div className="tavern-speech with-portrait" style={{ ['--npc-accent' as string]: accent }}>
          {/* key on npcId so switching speakers replays the slide-in */}
          <div key={talking.id} className="tavern-portrait">
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
        <p className="subtitle">
          {meta.telling > 1
            ? `This is the ${meta.telling}\u1d57\u02b0 telling of your story, by the Chronicler's count. Verses banked: ${meta.verses}.`
            : `The Chronicler writes everything down. Verses banked: ${meta.verses}. They hint, without quite saying it, that stories here do not stay finished.`}
        </p>
        <div className="option-list">
          {CHRONICLER_BOONS.map((boon) => {
            const owned = meta.purchased.includes(boon.id);
            return (
              <div className="item-row" key={boon.id}>
                <div className="item-desc">
                  <b>{boon.name}</b>
                  {owned && <span className="pill slain-pill">written in</span>}
                  <div className="affix-line">{boon.text}</div>
                </div>
                {!owned && (
                  <button
                    className="btn small"
                    disabled={meta.verses < boon.cost}
                    onClick={() => {
                      const updated = purchaseBoon(boon.id);
                      if (updated) setMeta(updated);
                    }}
                  >
                    ✒️ {boon.cost}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <p className="subtitle" style={{ fontSize: '0.72rem' }}>
          Boons are written into every telling to come — they take effect when the next hero begins.
        </p>
      </div>

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back into the dusk
        </button>
      </div>
    </div>
  );
}
