import { useRef } from 'react';
import type { GameAction, GameState } from '../engine/game';
import { useNavScope } from '../nav';
import { play as sfx } from '../platform/sfx';

/**
 * Somebody was here first, and this is what is left of them.
 *
 * Quieter than LegendOverlay on purpose — that screen exists to announce, and
 * this one exists to be read. No art, no kicker in red, one soft button. A
 * leaving that shouted would stop being a thing found on the floor and start
 * being a reward screen, which is the one thing it must not be.
 */
export function LeavingOverlay({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const leaving = state.pendingLeaving;
  // Trapping overlay over the floor. B dismisses it — unlike a legend, reading
  // someone else's leaving is optional and closing it is the whole interaction.
  const overlayRef = useRef<HTMLDivElement>(null);
  useNavScope(overlayRef, {
    id: 'leaving',
    layer: 10,
    trap: true,
    enabled: !!leaving,
    onCancel: () => {
      dispatch({ type: 'LEAVING_SEEN' });
      return true;
    },
  });
  if (!leaving) return null;

  // Your own dead get the warmer frame. It is the only one of the three the
  // player has a personal claim on and the styling should not pretend
  // otherwise.
  const own = leaving.kind === 'telling';

  return (
    <div className="overlay leaving-overlay" ref={overlayRef}>
      <div className={`panel leaving-panel ${own ? 'own' : ''}`}>
        <p className="leaving-kicker">{own ? 'A HAND YOU KNOW' : 'SOMEONE WAS HERE'}</p>
        <h1 className="title leaving-name">{leaving.name}</h1>
        {leaving.author ? (
          <p className="leaving-author">{leaving.author}</p>
        ) : (
          <p className="leaving-author leaving-anon">no name is recorded</p>
        )}
        <div className="leaving-body">
          {leaving.passage.map((p, i) => (
            <p key={i} className="story-paragraph">
              {p}
            </p>
          ))}
        </div>
        <button
          className="btn"
          autoFocus
          onClick={() => {
            sfx('uiClick');
            dispatch({ type: 'LEAVING_SEEN' });
          }}
        >
          Leave them to it
        </button>
      </div>
    </div>
  );
}
