import type { GameAction, GameState } from '../engine/game';
import { loadTellings } from '../platform/tellings';
import { ordinal } from '../engine/data/tellingsLore';
import { VICTORY_READING, fillSlots } from '../engine/data/retellingLore';
import { ChroniclerPassage } from './BookPanel';
import '../sheets.css';

// v17 (PLAN7 C7): the ending as a cinematic — centered block, big display
// type, verse lines fading in one after another (CSS only), one strong CTA.
//
// The Retelling pass: an ending used to be the one beat with nothing to say
// about the loop it had just closed. bankTriumph() has already turned the page
// by the time this renders, and the Depths have just unlocked — and the desk,
// by its own promise, will not raise the subject until the book has been read
// through once. This is that moment, and the only place Depths are introduced.
// Both dispatches remain untouched.

export function VictoryScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const player = state.player;
  const meta = loadTellings();
  // bankTriumph incremented the count on the way in, so the telling that just
  // closed is the one before the standing one. Prefer the record it wrote.
  const closed = meta.triumphs[meta.triumphs.length - 1]?.telling ?? Math.max(1, meta.telling - 1);
  const heroName = player?.name ?? 'The hero';
  const reading = VICTORY_READING.map((p) => fillSlots(p, { name: heroName, telling: ordinal(closed) }));

  return (
    <div className="panel center-text cine-screen victory-cine">
      <div className="cine-glow" aria-hidden="true" />
      <div className="cine-block">
        <h1 className="title cine-title">🌅 Dawn over Everdusk</h1>
        <p className="story-paragraph cine-verse">
          The Hollow Sovereign is unmade. The Last Lantern burns tall and unafraid for the first time in living memory, and the town that hired a nobody has a hero to argue about statues for.
        </p>
        {player && (
          <p className="subtitle cine-verse">
            {player.name} · Level {player.level} · {state.party.length + state.stable.length} monsters befriended · {state.orbs.length}/4 orbs returned
          </p>
        )}

        <ChroniclerPassage paragraphs={reading} className="cine-verse rite-passage" />

        <p className="subtitle cine-verse">The gates stand open. The world behind them is just a world now — keep exploring, taming, and breeding as long as you like, or go back to the desk and have the next draft written.</p>
        <div className="btn-row cine-cta">
          <button className="btn primary" onClick={() => dispatch({ type: 'GOTO', screen: 'town' })}>
            Stay in this telling
          </button>
          <button className="btn danger cine-quiet" onClick={() => dispatch({ type: 'RESTART' })}>
            Begin the {ordinal(meta.telling)} telling
          </button>
        </div>
        <p className="subtitle cine-verse victory-carry-note">
          Beginning the next telling makes a new hero in a newly remembered realm. Verses, boons, premises and the
          standing record carry over. This hero, their party and their gear do not.
        </p>
      </div>
    </div>
  );
}
