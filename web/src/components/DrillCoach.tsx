import { DRILL_BEATS, DRILL_STATUS_ASIDE, drillBeatAt } from '../engine/data/drill';
import { drillBeat, type DrillState } from '../engine/game';
import '../drill.css';

// ===========================================================================
// BRAM'S RAIL — the coaching layer for the recruit drill.
//
// This is deliberately NOT a battle renderer, a battle variant, or a second
// stage. `BattleScreen` renders the one `BattleStage` exactly as it always
// has and hangs this beside it; the fight underneath is a completely ordinary
// solo battle that happens to have a captain talking over it. Nothing in
// BattleStage knows the drill exists.
//
// TWO RULES, both load-bearing:
//
//   1. NO FOCUSABLE CONTROLS. Combat's nav scope lives on the stage root and
//      owns the D-pad; a second scope up here would either trap the pad away
//      from the cards or add cursor stops between a player and their hand.
//      Everything the recruit has to DO is done with the real controls they
//      are being taught. The way out is the retreat button the stage already
//      renders, relabelled by the adapter.
//
//   2. `pointer-events: none`, in the stylesheet, on the whole rail. It is a
//      panel that sits over a battlefield you must be able to click. It can
//      never eat a click meant for a card or a foe.
//
// Both rules are why this can be static text and still satisfy the controller
// bar: it is always visible, never hover-gated, never a `title=`, and it
// costs the pad player nothing.
// ===========================================================================

export function DrillCoach({ drill }: { drill: DrillState }) {
  if (drill.outcome !== 'running') return null;

  const index = drillBeat(drill);
  const beat = drillBeatAt(index);

  return (
    <aside className="drill-rail" aria-live="polite" aria-label="Watch Captain Bram, drilling">
      <div className="drill-head">
        <span className="drill-head-name">Watch Captain Bram</span>
        <span className="drill-head-count">
          entry {index + 1} of {DRILL_BEATS.length}
        </span>
      </div>

      {/* A ruled progress strip rather than a percentage: it is a ledger. */}
      <div className="drill-ticks" aria-hidden="true">
        {DRILL_BEATS.map((b, i) => (
          <span key={b.id} className={`drill-tick ${i < index ? 'done' : ''} ${i === index ? 'now' : ''}`} />
        ))}
      </div>

      <h2 className="drill-title">{beat.title}</h2>

      <div className="drill-lines">
        {beat.lines.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
      </div>

      {/*
        The aside only ever appears if the slime's kit actually rolled Acid
        Ooze, which is roughly one turn in seven. No beat may depend on a die,
        so statuses are taught opportunistically or not at all — see the note
        on DRILL_STATUS_ASIDE.
      */}
      {drill.sawStatus && (
        <div className="drill-aside">
          {DRILL_STATUS_ASIDE.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      <div className="drill-ask">
        <span className="drill-ask-label">Required</span>
        <span className="drill-ask-text">{beat.ask}</span>
      </div>

      <p className="drill-foot">
        Nothing here is entered against your name. You may leave the yard at any time.
      </p>
    </aside>
  );
}
