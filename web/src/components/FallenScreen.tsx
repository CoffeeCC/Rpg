import type { GameAction, GameState } from '../engine/game';
import { loadTellings, nextTelling } from '../platform/tellings';
import { play as sfx } from '../platform/sfx';

/** PLAN5 #49 — the run is over. The Chronicler turns the page. */
export function FallenScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const s = state.fallenSummary;
  const meta = loadTellings();
  return (
    <div className="panel fallen-panel">
      <h1 className="title fallen-title">The Telling Ends</h1>
      <p className="subtitle">
        {state.player?.name ?? 'The hero'} fell. In Everdusk, the Chronicler writes the last line without looking up — they have written it before.
      </p>
      {s && (
        <div className="fallen-summary">
          <div className="stat-row">
            <span>Reached level</span>
            <span>{s.level}</span>
          </div>
          <div className="stat-row">
            <span>Warden's Orbs claimed</span>
            <span>{s.orbs}/4</span>
          </div>
          <div className="stat-row">
            <span>Legends laid to rest</span>
            <span>{s.beasts}</span>
          </div>
          <div className="stat-row verses-row">
            <span>Verses written into the Chronicle</span>
            <span>✒️ +{s.verses}</span>
          </div>
        </div>
      )}
      <p className="subtitle" style={{ marginTop: 12 }}>
        Verses banked: <b>✒️ {meta.verses}</b> · Spend them with the Chronicler at the tavern, in the next telling. Stories in Everdusk do not stay
        finished.
      </p>
      <div className="btn-row">
        <button
          className="btn primary"
          onClick={() => {
            sfx('uiClick');
            nextTelling();
            dispatch({ type: 'RESTART' });
          }}
        >
          Begin the {ordinal(meta.telling + 1)} Telling
        </button>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
