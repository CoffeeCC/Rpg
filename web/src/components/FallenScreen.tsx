import type { GameAction, GameState } from '../engine/game';
import { loadTellings, nextTelling } from '../platform/tellings';
import { PAGE_TURN_LINES, ordinal as tellingOrdinal } from '../engine/data/tellingsLore';
import { play as sfx } from '../platform/sfx';
import '../sheets.css';

/** PLAN5 #49 — the run is over. The Chronicler turns the page.
 *  v17 (PLAN7 C7): staged as a cinematic — centered block, big display type,
 *  the summary ledger fading in line by line (CSS only), one strong CTA.
 *  Presentation only; the RESTART dispatch and telling bookkeeping unchanged. */
export function FallenScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const s = state.fallenSummary;
  const meta = loadTellings();
  const heroName = state.player?.name ?? 'The hero';
  const pageTurn = PAGE_TURN_LINES[(meta.telling - 1) % PAGE_TURN_LINES.length]
    .replaceAll('{telling}', tellingOrdinal(meta.telling))
    .replaceAll('{name}', heroName);
  return (
    <div className="panel center-text fallen-panel cine-screen fallen-cine">
      <div className="cine-glow" aria-hidden="true" />
      <div className="cine-block">
        <h1 className="title fallen-title cine-title">The Telling Ends</h1>
        <p className="subtitle cine-verse">{pageTurn}</p>
        {s && (
          <div className="fallen-summary cine-verse">
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
        <p className="subtitle cine-verse">
          Verses banked: <b>✒️ {meta.verses}</b> · Spend them with the Chronicler at the tavern, in the next telling. Stories in Everdusk do not stay
          finished.
        </p>
        <div className="btn-row cine-cta">
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
    </div>
  );
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
