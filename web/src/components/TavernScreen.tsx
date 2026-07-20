import type { GameAction, GameState } from '../engine/game';
import { NPCS } from '../engine/data/npcs';
import { NpcPortrait, NPC_ACCENTS } from '../art/npcArt';
import { play as sfx } from '../platform/sfx';

export function TavernScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
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
            <NpcPortrait npcId={talking.id} size={132} />
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

      <div className="btn-row">
        <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back into the dusk
        </button>
      </div>
    </div>
  );
}
