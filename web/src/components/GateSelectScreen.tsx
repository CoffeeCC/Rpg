import type { GameAction, GameState } from '../engine/game';
import { GATES, GATE_ORDER } from '../engine/data/gates';

export function GateSelectScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  return (
    <div className="panel">
      <h1 className="title">The Gates</h1>
      <p className="subtitle">Each gate holds a Warden. Claim all four orbs to open the way below.</p>
      <div className="option-list">
        {GATE_ORDER.map((id) => {
          const gate = GATES[id];
          const locked = state.orbs.length < gate.requiredOrbs;
          const cleared = state.defeatedBosses.includes(id);
          return (
            <button
              type="button"
              key={id}
              className="option-card"
              disabled={locked}
              onClick={() => dispatch({ type: 'ENTER_GATE', gateId: id })}
            >
              <div className="name">
                {gate.emoji} {gate.name} {cleared ? '✅' : ''}
                {locked ? ` 🔒 (needs ${gate.requiredOrbs} orbs)` : ''}
              </div>
              <div className="desc">{gate.description}</div>
              <div className="desc">
                {gate.floors.length} floors · Warden: {cleared ? gate.bossName : '???'}
              </div>
            </button>
          );
        })}
      </div>
      <div className="btn-row">
        <button className="btn" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
          Back
        </button>
      </div>
    </div>
  );
}
