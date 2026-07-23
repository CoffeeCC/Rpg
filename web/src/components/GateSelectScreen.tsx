import type { GameAction, GameState } from '../engine/game';
import { GATES, GATE_ORDER } from '../engine/data/gates';
import { NpcHost } from './NpcHost';
import { Icon } from './Icon';

export function GateSelectScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  return (
    <div className="panel">
      <h1 className="title">The Gates</h1>
      <NpcHost npcId="sess" state={state} />
      <p className="subtitle">Each gate holds a Warden. Claim all four orbs to open the way below.</p>
      <div className="option-list">
        {GATE_ORDER.map((id) => {
          const gate = GATES[id];
          const locked = state.orbs.length < gate.requiredOrbs;
          const cleared = state.defeatedBosses.includes(id);
          const lowBand = gate.floors[0].spawn.levelBonus + 1;
          const highBand = gate.floors[gate.floors.length - 1].spawn.levelBonus + 4;
          const playerLevel = state.player?.level ?? 1;
          const overreach = playerLevel < lowBand - 1;
          return (
            <div key={id}>
              <button type="button" className="option-card" disabled={locked} onClick={() => dispatch({ type: 'ENTER_GATE', gateId: id })}>
                <div className="name">
                  <Icon name={`gate_${id}`} emoji={gate.emoji} size={22} /> {gate.name} {cleared ? '✅' : ''}
                  {locked ? ` 🔒 (needs ${gate.requiredOrbs} orbs)` : ''}
                </div>
                <div className="desc">{gate.description}</div>
                <div className="desc">
                  {gate.floors.length} floors · Danger Lv {lowBand}–{highBand} · Warden: {cleared ? gate.bossName : '???'}
                  {overreach && (
                    <span className="pill danger-pill">
                      {' '}
                      <Icon name="boss" emoji="☠️" size={14} /> beyond you, for now
                    </span>
                  )}
                </div>
              </button>
              {cleared && (
                <button type="button" className="option-card wilds-card" onClick={() => dispatch({ type: 'ENTER_WILDS', gateId: id })}>
                  <div className="name">🌫️ Venture into the Unmapped Wilds</div>
                  <div className="desc">
                    Past every floor a cartographer has ever charted. No end, no map — only what your Lantern finds.
                  </div>
                </button>
              )}
            </div>
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
