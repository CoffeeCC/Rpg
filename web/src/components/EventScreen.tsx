import type { GameAction, GameState } from '../engine/game';
import { EVENTS } from '../engine/data/events';
import { Icon } from './Icon';

export function EventScreen({ state, dispatch }: { state: GameState; dispatch: (a: GameAction) => void }) {
  const event = EVENTS.find((e) => e.id === state.pendingEvent?.eventId);
  if (!event) return null;
  return (
    <div className="panel">
      <h1 className="title">
        <Icon name={`event_${event.id}`} emoji={event.emoji} size={28} /> {event.name}
      </h1>
      <p className="story-paragraph">{event.text}</p>
      <div className="option-list">
        {event.options.map((option, i) => (
          <button type="button" key={i} className="option-card" onClick={() => dispatch({ type: 'EVENT_CHOICE', optionIndex: i })}>
            <div className="name">{option.label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
