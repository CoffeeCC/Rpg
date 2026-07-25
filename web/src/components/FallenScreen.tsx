import type { GameAction, GameState } from '../engine/game';
import { loadTellings, nextTelling } from '../platform/tellings';
import { PAGE_TURN_LINES, ordinal as tellingOrdinal } from '../engine/data/tellingsLore';
import { pageTurnPassage } from '../engine/data/retellingLore';
import { ChroniclerPassage, CarryLedger } from './BookPanel';
import { play as sfx } from '../platform/sfx';
import '../sheets.css';

/** PLAN5 #49 — the run is over. The Chronicler turns the page.
 *  v17 (PLAN7 C7): staged as a cinematic — centered block, big display type,
 *  the summary ledger fading in line by line (CSS only), one strong CTA.
 *
 *  The Retelling pass: this is the beat the entire meta-loop hangs on. It is
 *  the first moment a player actually asks "why would I do that again", and
 *  until now the screen answered with a stat block and one clause about
 *  stories not staying finished. The first page turn now carries the whole
 *  arrangement, in the Chronicler's own voice, exactly once; every page turn
 *  after carries one further piece of it (see data/retellingLore.ts). The
 *  plain carry-over ledger is shown every time, because "what did I just lose"
 *  is a question fiction should not be asked to answer on its own.
 *
 *  Still presentation only: the RESTART dispatch and the telling bookkeeping
 *  are untouched. */
export function FallenScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const s = state.fallenSummary;
  const meta = loadTellings();
  const heroName = state.player?.name ?? 'The hero';
  const firstFall = meta.telling <= 1;

  // bankFall has already written this telling's record by the time we render,
  // so the place it ended is on the last struck draft. Fall back rather than
  // trust it: a corrupt or absent book must not take the screen down.
  const record = meta.fallen[meta.fallen.length - 1];
  const place = record?.telling === meta.telling ? record.place : 'the road';

  const pageTurn = PAGE_TURN_LINES[(meta.telling - 1) % PAGE_TURN_LINES.length]
    .replaceAll('{telling}', tellingOrdinal(meta.telling))
    .replaceAll('{name}', heroName);
  const passage = pageTurnPassage(meta.telling, { name: heroName, place });

  return (
    <div className="panel center-text fallen-panel cine-screen fallen-cine">
      <div className="cine-glow" aria-hidden="true" />
      <div className="cine-block">
        <h1 className="title fallen-title cine-title">The Telling Ends</h1>
        <p className="subtitle cine-verse">{pageTurn}</p>

        {/* The arrangement, in full, on the first page turn only. */}
        <ChroniclerPassage paragraphs={passage} className={`cine-verse${firstFall ? ' rite-passage' : ''}`} />

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

        {/* The plain reading. Shown every time — a player who has died six
            times still deserves to know exactly what the sixth death cost. */}
        <CarryLedger />

        <p className="subtitle cine-verse">
          Verses banked: <b>✒️ {meta.verses}</b> · The Chronicler keeps his desk at the tavern, in the next telling and
          every telling after. Spend them there.
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
