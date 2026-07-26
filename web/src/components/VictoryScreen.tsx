import { useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { useNavScope } from '../nav';
import { loadTellings } from '../platform/tellings';
import { ordinal } from '../engine/data/tellingsLore';
import { VICTORY_READING, fillSlots } from '../engine/data/retellingLore';
import { ChroniclerPassage } from './BookPanel';
import { useConfirmAction } from './ConfirmOverlay';
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

  // A terminal screen. No `onCancel`: "Begin the next telling" is destructive
  // and must never be what a stray B press reaches for.
  const root = useRef<HTMLDivElement>(null);
  useNavScope(root, { id: 'victory' });

  // B is unbound here for exactly the reason the next telling now asks first:
  // "Begin the next telling" sits directly right of "Stay in this telling",
  // and on a pad that is one over-travelled press from ending a won run.
  const guard = useConfirmAction();

  return (
    <div className="panel center-text cine-screen victory-cine" ref={root}>
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
          <button
            className="btn danger cine-quiet"
            onClick={() =>
              guard.ask({
                title: `Begin the ${ordinal(meta.telling)} telling?`,
                detail: `${heroName}, their party and their gear end here. Verses, boons, premises and the standing record carry over; nothing else does. This cannot be undone.`,
                confirmLabel: 'Begin it',
                cancelLabel: 'Stay in this telling',
                perform: () => dispatch({ type: 'RESTART' }),
              })
            }
          >
            Begin the {ordinal(meta.telling)} telling
          </button>
        </div>
        <p className="subtitle cine-verse victory-carry-note">
          Beginning the next telling makes a new hero in a newly remembered realm. Verses, boons, premises and the
          standing record carry over. This hero, their party and their gear do not.
        </p>
      </div>
      {guard.overlay}
    </div>
  );
}
