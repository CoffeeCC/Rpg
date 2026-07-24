import type { GameAction, GameState } from '../engine/game';
import { EVENTS } from '../engine/data/events';
import '../sheets.css';

// v17 (PLAN7 C8): events as dramatic centered narration — big glyph, display
// title, drop-cap prose, and choices as large numbered cards. Presentation
// only; the EVENT_CHOICE dispatch is unchanged.

export function EventScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const event = EVENTS.find((e) => e.id === state.pendingEvent?.eventId);
  if (!event) return null;
  return (
    <div className="panel event-screen">
      <div className="event-stage">
        <div className="event-glyph" aria-hidden="true">
          {event.emoji}
        </div>
        <h1 className="title event-title">{event.name}</h1>
        <p className="story-paragraph event-text">{event.text}</p>
        <div className="event-choices">
          {event.options.map((option, i) => (
            <button type="button" key={i} className="event-choice" onClick={() => dispatch({ type: 'EVENT_CHOICE', optionIndex: i })}>
              <span className="event-choice-label">{option.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
